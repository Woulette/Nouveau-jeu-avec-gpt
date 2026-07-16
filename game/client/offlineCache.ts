export type OfflineCacheState = "preparing" | "ready" | "error" | "unsupported";

export const OFFLINE_CACHE_EVENT = "game:offline-cache";
const PREPARATION_TIMEOUT_MS = 25_000;

interface OfflineCacheReply {
  type?: string;
  assetCount?: number;
  message?: string;
}

function publishOfflineCacheState(state: OfflineCacheState, message?: string): void {
  document.documentElement.dataset.offlineCache = state;
  window.dispatchEvent(
    new CustomEvent(OFFLINE_CACHE_EVENT, {
      detail: { state, message },
    }),
  );
}

/** Keep immutable Next chunks and local game assets. API and foreign requests are excluded. */
export function selectOfflineAssetUrls(resourceUrls: string[], origin: string): string[] {
  const selected = new Set<string>();
  for (const resourceUrl of resourceUrls) {
    try {
      const url = new URL(resourceUrl, origin);
      if (
        url.origin !== origin ||
        (!url.pathname.startsWith("/_next/static/") && !url.pathname.startsWith("/assets/"))
      ) {
        continue;
      }
      selected.add(url.pathname + url.search);
    } catch {
      // Resource Timing can contain browser-specific, non-URL entries; ignore them.
    }
  }
  return [...selected];
}

function waitForActivation(worker: ServiceWorker): Promise<ServiceWorker> {
  if (worker.state === "activated") return Promise.resolve(worker);
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      worker.removeEventListener("statechange", onStateChange);
      reject(new Error("Le service hors ligne n'a pas pu s'activer."));
    }, PREPARATION_TIMEOUT_MS);

    function onStateChange() {
      if (worker.state === "activated") {
        window.clearTimeout(timeout);
        worker.removeEventListener("statechange", onStateChange);
        resolve(worker);
      } else if (worker.state === "redundant") {
        window.clearTimeout(timeout);
        worker.removeEventListener("statechange", onStateChange);
        reject(new Error("Le service hors ligne a été remplacé avant son activation."));
      }
    }

    worker.addEventListener("statechange", onStateChange);
  });
}

async function activePreparationWorker(
  registration: ServiceWorkerRegistration,
): Promise<ServiceWorker> {
  const updatingWorker = registration.installing ?? registration.waiting;
  if (updatingWorker) return waitForActivation(updatingWorker);
  if (registration.active) return waitForActivation(registration.active);
  const readyRegistration = await navigator.serviceWorker.ready;
  if (!readyRegistration.active) throw new Error("Aucun service hors ligne actif.");
  return waitForActivation(readyRegistration.active);
}

function askWorkerToPrepare(worker: ServiceWorker, urls: string[]): Promise<OfflineCacheReply> {
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const timeout = window.setTimeout(() => {
      channel.port1.close();
      reject(new Error("La préparation hors ligne n'a pas répondu."));
    }, PREPARATION_TIMEOUT_MS);

    channel.port1.onmessage = (event: MessageEvent<OfflineCacheReply>) => {
      window.clearTimeout(timeout);
      channel.port1.close();
      if (event.data?.type === "OFFLINE_CACHE_READY") resolve(event.data);
      else reject(new Error(event.data?.message ?? "Préparation hors ligne impossible."));
    };
    channel.port1.start();
    worker.postMessage({ type: "PREPARE_OFFLINE", urls }, [channel.port2]);
  });
}

let preparation: Promise<boolean> | null = null;

/**
 * Fetches the local realm chunk up front, then asks the active service worker to
 * persist every Next chunk observed during the complete game boot.
 */
export function prepareOfflineCache(): Promise<boolean> {
  if (preparation) return preparation;
  preparation = (async () => {
    if (!("serviceWorker" in navigator)) {
      publishOfflineCacheState("unsupported");
      return false;
    }

    publishOfflineCacheState("preparing");
    try {
      const registration = await navigator.serviceWorker.register("/sw.js", {
        scope: "/",
        updateViaCache: "none",
      });
      await registration.update().catch(() => undefined);

      // This is the only game module normally first requested when online play falls back.
      // Loading it now makes a later, fully disconnected launch deterministic.
      await import("@/game/server/realm");

      const worker = await activePreparationWorker(registration);
      const resourceUrls = performance
        .getEntriesByType("resource")
        .map((entry) => entry.name);
      const urls = selectOfflineAssetUrls(resourceUrls, window.location.origin);
      const reply = await askWorkerToPrepare(worker, urls);
      publishOfflineCacheState(
        "ready",
        `${reply.assetCount ?? urls.length} ressources disponibles hors ligne.`,
      );
      return true;
    } catch (error) {
      publishOfflineCacheState(
        "error",
        error instanceof Error ? error.message : "Préparation hors ligne impossible.",
      );
      return false;
    }
  })();
  return preparation;
}
