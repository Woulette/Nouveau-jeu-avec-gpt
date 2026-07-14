import type { ClientMessage } from "@/game/shared/protocol";
import type { PreferredConnectionMode } from "@/game/shared/save";
import type {
  AwakenedCombatPath,
  EquipmentSlot,
  GameEvent,
  PublicMapDefinition,
  RealmSnapshot,
  ServerMessage,
} from "@/game/shared/types";
import type { InMemoryRealm } from "@/game/server/realm";
import { loadSavedRiftWorldState, saveRiftWorldState } from "./rift-storage";
import {
  loadPreferredConnectionMode,
  loadSavedProfile,
  savePreferredConnectionMode,
} from "./storage";

export type ConnectionStatus = "connecting" | "online" | "reconnecting" | "local" | "offline";

export interface WorldSocketHandlers {
  onStatus(status: ConnectionStatus): void;
  onWelcome(payload: {
    playerId: string;
    map: PublicMapDefinition;
    snapshot: RealmSnapshot;
  }): void;
  onSnapshot(snapshot: RealmSnapshot): void;
  onEvent(event: GameEvent): void;
  onError(message: string): void;
}

interface WorldIdentity {
  name: string;
  resumeToken?: string;
}

const TOKEN_KEY = "nouveau-mmo-resume-token";
const HEARTBEAT_INTERVAL_MS = 10_000;
const HEARTBEAT_TIMEOUT_MS = 25_000;

function readResumeToken(): string | undefined {
  try {
    return window.localStorage.getItem(TOKEN_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

function writeResumeToken(token: string): void {
  try {
    window.localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // The in-memory identity still keeps this page playable.
  }
}

export class WorldSocket {
  private socket: WebSocket | null = null;
  private sequence = 0;
  private stopped = false;
  private retry = 0;
  private reconnectTimer: number | null = null;
  private localFallbackTimer: number | null = null;
  private localRealm: InMemoryRealm | null = null;
  private localPeerId: string | null = null;
  private startingLocal = false;
  private preferredMode: PreferredConnectionMode;
  private heartbeatTimer: number | null = null;
  private lastPongAt = 0;
  private memoryResumeToken: string | undefined;

  constructor(
    private readonly identity: WorldIdentity,
    private readonly handlers: WorldSocketHandlers,
    preferredMode = loadPreferredConnectionMode(),
  ) {
    this.preferredMode = preferredMode;
    this.memoryResumeToken = identity.resumeToken ?? readResumeToken();
  }

  connect() {
    this.stopped = false;
    if (this.preferredMode === "offline") {
      void this.startLocal();
      return;
    }
    if (window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost") {
      void this.startLocal();
      return;
    }
    this.open();
  }

  close() {
    this.stopped = true;
    if (this.reconnectTimer !== null) window.clearTimeout(this.reconnectTimer);
    if (this.localFallbackTimer !== null) window.clearTimeout(this.localFallbackTimer);
    if (this.heartbeatTimer !== null) window.clearInterval(this.heartbeatTimer);
    this.socket?.close();
    this.socket = null;
    this.heartbeatTimer = null;
    this.stopLocal();
  }

  getPreferredConnectionMode(): PreferredConnectionMode {
    return this.preferredMode;
  }

  setConnectionMode(mode: PreferredConnectionMode): void {
    if (
      mode === this.preferredMode &&
      !(
        mode === "online" &&
        (this.localRealm !== null || this.socket?.readyState !== WebSocket.OPEN)
      )
    ) return;
    this.preferredMode = mode;
    savePreferredConnectionMode(mode);
    this.retry = 0;

    if (this.reconnectTimer !== null) window.clearTimeout(this.reconnectTimer);
    if (this.localFallbackTimer !== null) window.clearTimeout(this.localFallbackTimer);
    if (this.heartbeatTimer !== null) window.clearInterval(this.heartbeatTimer);
    this.reconnectTimer = null;
    this.localFallbackTimer = null;
    this.heartbeatTimer = null;
    this.socket?.close();
    this.socket = null;
    this.stopLocal();

    if (this.stopped) return;
    if (mode === "offline") void this.startLocal();
    else this.open();
  }

  move(x: number, y: number) {
    this.send({ type: "move", destination: { x, y }, sequence: this.nextSequence() });
  }

  target(targetId: string) {
    this.send({ type: "target", targetId, sequence: this.nextSequence() });
  }

  cast(slot: number, targetId?: string) {
    this.send({ type: "cast", slot, targetId, sequence: this.nextSequence() });
  }

  respawn() {
    this.send({ type: "respawn", sequence: this.nextSequence() });
  }

  interactNpc(npcId: string) {
    this.send({ type: "interact-npc", npcId, sequence: this.nextSequence() });
  }

  awaken(npcId: string, combatPath: AwakenedCombatPath) {
    this.send({ type: "awaken", npcId, combatPath, sequence: this.nextSequence() });
  }

  enterRift(riftId: string) {
    this.send({ type: "rift", action: "enter", riftId, sequence: this.nextSequence() });
  }

  leaveRift(riftId: string) {
    this.send({ type: "rift", action: "leave", riftId, sequence: this.nextSequence() });
  }

  equip(itemId: string) {
    this.send({ type: "equip", itemId, sequence: this.nextSequence() });
  }

  unequip(slot: EquipmentSlot) {
    this.send({ type: "unequip", slot, sequence: this.nextSequence() });
  }

  useItem(itemId: string) {
    this.send({ type: "use-item", itemId, sequence: this.nextSequence() });
  }

  private nextSequence() {
    this.sequence += 1;
    return this.sequence;
  }

  private open() {
    if (this.stopped || this.preferredMode === "offline") return;
    this.handlers.onStatus(this.retry === 0 ? "connecting" : "reconnecting");

    const scheme = window.location.protocol === "https:" ? "wss:" : "ws:";
    let socket: WebSocket;
    try {
      socket = new WebSocket(scheme + "//" + window.location.host + "/api/ws");
    } catch {
      void this.startLocal();
      return;
    }
    this.socket = socket;

    this.localFallbackTimer = window.setTimeout(() => {
      if (socket.readyState !== WebSocket.OPEN && this.socket === socket) {
        this.socket = null;
        socket.close();
        void this.startLocal();
      }
    }, 2200);

    socket.addEventListener("open", () => {
      if (this.socket !== socket || this.preferredMode !== "online") {
        socket.close();
        return;
      }
      this.retry = 0;
      this.stopLocal();
      this.lastPongAt = Date.now();
      this.startHeartbeat(socket);
      this.send({
        type: "join",
        name: this.identity.name,
        resumeToken: this.memoryResumeToken,
        clientVersion: "0.1.0",
      });
    });

    socket.addEventListener("message", (message) => {
      if (this.socket !== socket) return;
      let payload: ServerMessage;
      try {
        payload = JSON.parse(String(message.data)) as ServerMessage;
      } catch {
        return;
      }
      this.handleServerMessage(payload, "online");
    });

    socket.addEventListener("close", () => {
      if (this.socket !== socket) return;
      if (this.heartbeatTimer !== null) window.clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
      if (this.socket === socket) this.socket = null;
      if (this.stopped || this.preferredMode === "offline") return;
      void this.startLocal();
    });

    socket.addEventListener("error", () => socket.close());
  }

  private send(message: ClientMessage) {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
      return;
    }

    if (!this.localRealm || !this.localPeerId || message.type === "join") return;
    this.localRealm.handleMessage(this.localPeerId, message);
  }

  private startHeartbeat(socket: WebSocket): void {
    if (this.heartbeatTimer !== null) window.clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = window.setInterval(() => {
      if (this.socket !== socket || socket.readyState !== WebSocket.OPEN) return;
      if (Date.now() - this.lastPongAt > HEARTBEAT_TIMEOUT_MS) {
        socket.close();
        return;
      }
      socket.send(JSON.stringify({ type: "ping", clientTime: Date.now() } satisfies ClientMessage));
    }, HEARTBEAT_INTERVAL_MS);
  }

  private async startLocal() {
    if (this.stopped || this.localRealm || this.startingLocal) return;
    this.startingLocal = true;
    try {
      const { InMemoryRealm } = await import("@/game/server/realm");
      if (
        this.stopped ||
        (this.preferredMode === "online" && this.socket?.readyState === WebSocket.OPEN)
      ) return;

      const realm = new InMemoryRealm({
        allowClientSaves: true,
        persistedRiftWorldState: loadSavedRiftWorldState(),
        onRiftWorldStateChange: saveRiftWorldState,
      });
      const peerId = `local-${crypto.randomUUID()}`;
      this.localRealm = realm;
      this.localPeerId = peerId;
      this.handlers.onStatus(this.preferredMode === "offline" ? "offline" : "local");
      realm.registerPeer(peerId, (message) => this.handleServerMessage(message, "local"));
      realm.joinPeer(peerId, {
        type: "join",
        name: this.identity.name,
        clientVersion: "0.1.0-local",
        savedProfile: loadSavedProfile(),
      });
    } catch {
      this.handlers.onError("Le mode local n’a pas pu démarrer.");
    } finally {
      this.startingLocal = false;
    }
  }

  private stopLocal() {
    if (this.localRealm && this.localPeerId) {
      this.localRealm.disconnectPeer(this.localPeerId);
      this.localRealm.stop();
    }
    this.localRealm = null;
    this.localPeerId = null;
  }

  private handleServerMessage(payload: ServerMessage, mode: "online" | "local") {
    if (payload.type === "welcome") {
      if (mode === "online") {
        this.memoryResumeToken = payload.resumeToken;
        writeResumeToken(payload.resumeToken);
      }
      this.handlers.onStatus(
        mode === "local" && this.preferredMode === "offline" ? "offline" : mode,
      );
      this.handlers.onWelcome({
        playerId: payload.playerId,
        map: payload.map,
        snapshot: payload.snapshot,
      });
    } else if (payload.type === "snapshot") {
      this.handlers.onSnapshot(payload.snapshot);
    } else if (payload.type === "event") {
      this.handlers.onEvent(payload.event);
    } else if (payload.type === "pong") {
      this.lastPongAt = Date.now();
    } else if (payload.type === "error") {
      this.handlers.onError(payload.message);
    }
  }
}
