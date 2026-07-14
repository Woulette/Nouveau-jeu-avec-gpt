import type { ClientMessage } from "@/game/shared/protocol";
import type {
  EquipmentSlot,
  GameEvent,
  PublicMapDefinition,
  RealmSnapshot,
  ServerMessage,
} from "@/game/shared/types";
import type { InMemoryRealm } from "@/game/server/realm";

type ConnectionStatus = "connecting" | "online" | "reconnecting" | "local";

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

  constructor(
    private readonly identity: WorldIdentity,
    private readonly handlers: WorldSocketHandlers,
  ) {}

  connect() {
    this.stopped = false;
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
    this.socket?.close();
    this.socket = null;
    this.stopLocal();
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

  equip(itemId: string) {
    this.send({ type: "equip", itemId, sequence: this.nextSequence() });
  }

  unequip(slot: EquipmentSlot) {
    this.send({ type: "unequip", slot, sequence: this.nextSequence() });
  }

  private nextSequence() {
    this.sequence += 1;
    return this.sequence;
  }

  private open() {
    if (this.stopped) return;
    this.handlers.onStatus(this.retry === 0 ? "connecting" : "reconnecting");

    const scheme = window.location.protocol === "https:" ? "wss:" : "ws:";
    let socket: WebSocket;
    try {
      socket = new WebSocket(scheme + "//" + window.location.host + "/api/ws");
    } catch {
      void this.startLocal();
      this.scheduleReconnect();
      return;
    }
    this.socket = socket;

    this.localFallbackTimer = window.setTimeout(() => {
      if (socket.readyState !== WebSocket.OPEN) void this.startLocal();
    }, 2200);

    socket.addEventListener("open", () => {
      this.retry = 0;
      this.stopLocal();
      const storedToken = window.localStorage.getItem(TOKEN_KEY) ?? undefined;
      this.send({
        type: "join",
        name: this.identity.name,
        resumeToken: this.identity.resumeToken ?? storedToken,
        clientVersion: "0.1.0",
      });
    });

    socket.addEventListener("message", (message) => {
      let payload: ServerMessage;
      try {
        payload = JSON.parse(String(message.data)) as ServerMessage;
      } catch {
        return;
      }
      this.handleServerMessage(payload, "online");
    });

    socket.addEventListener("close", () => {
      if (this.socket === socket) this.socket = null;
      if (this.stopped) return;
      void this.startLocal();
      this.scheduleReconnect();
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

  private scheduleReconnect() {
    if (this.stopped || this.reconnectTimer !== null) return;
    this.retry += 1;
    const delay = Math.min(1_000 * Math.pow(1.7, this.retry), 15_000);
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.open();
    }, delay);
  }

  private async startLocal() {
    if (this.stopped || this.localRealm || this.startingLocal) return;
    this.startingLocal = true;
    try {
      const { InMemoryRealm } = await import("@/game/server/realm");
      if (this.stopped || this.socket?.readyState === WebSocket.OPEN) return;

      const realm = new InMemoryRealm();
      const peerId = `local-${crypto.randomUUID()}`;
      this.localRealm = realm;
      this.localPeerId = peerId;
      this.handlers.onStatus("local");
      realm.registerPeer(peerId, (message) => this.handleServerMessage(message, "local"));
      realm.joinPeer(peerId, {
        type: "join",
        name: this.identity.name,
        clientVersion: "0.1.0-local",
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
      if (mode === "online") window.localStorage.setItem(TOKEN_KEY, payload.resumeToken);
      this.handlers.onStatus(mode);
      this.handlers.onWelcome({
        playerId: payload.playerId,
        map: payload.map,
        snapshot: payload.snapshot,
      });
    } else if (payload.type === "snapshot") {
      this.handlers.onSnapshot(payload.snapshot);
    } else if (payload.type === "event") {
      this.handlers.onEvent(payload.event);
    } else if (payload.type === "error") {
      this.handlers.onError(payload.message);
    }
  }
}
