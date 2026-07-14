import {
  combatStatForPath,
  damageAfterDefense,
  generalXpToNext,
  isAwakeningEligible,
  masteryXpToNext,
  outgoingPlayerDamage,
  playerMaxHp,
  playerMaxMp,
  playerMoveIntervalMs,
  playerSpeed,
  powerIndex,
  rankBonus,
  trainingXpForAction,
} from "../shared/formulas";
import {
  directionBetween,
  hasLineOfSight,
  isWalkable,
  manhattanDistance,
  positionKey,
} from "../shared/grid";
import {
  ITEM_CATALOG,
  STARTER_INVENTORY,
  isKnownItem,
  meetsItemRank,
  type ItemBonuses,
  type ItemDefinition,
} from "../shared/items";
import { findPath, findPathToAttackRange } from "../shared/pathfinding";
import type { ClientMessage, JoinMessage } from "../shared/protocol";
import {
  RIFT_MAP,
  RIFT_ROOM_ENTRANCES,
  RIFT_ROOM_GATES,
  RIFT_SPAWN_LOCATIONS,
  RIFT_SPAWN_MAX_DELAY_MS,
  RIFT_SPAWN_MIN_DELAY_MS,
  advanceRankERift,
  completeRiftRoom,
  createRankERift,
  createRiftInstance,
  type RankERift,
  type RiftInstance,
  type RiftItemReward,
  type RiftRoomNumber,
} from "../shared/rifts";
import {
  RIFT_WORLD_SAVE_VERSION,
  type PersistedRiftWorldState,
} from "../shared/rift-persistence";
import type { PersistedPlayerProfile } from "../shared/save";
import type {
  CombatPath,
  Direction,
  EntityId,
  EquipmentSlot,
  GameEvent,
  GridPosition,
  MonsterSnapshot,
  PlayerRank,
  PlayerSnapshot,
  PublicMapDefinition,
  RealmSnapshot,
  RiftRunSnapshot,
  RiftSnapshot,
  ServerMessage,
} from "../shared/types";
import { clonePosition } from "../shared/types";
import {
  STARTER_MAP,
  STARTER_MONSTERS,
  type MonsterDefinition,
} from "./content";
import { escapedRiftBoss, riftRoomMonsters } from "./rift-content";

export const REALM_TICK_RATE = 10;
export const REALM_SNAPSHOT_RATE = 5;
const TICK_INTERVAL_MS = 1_000 / REALM_TICK_RATE;
const SNAPSHOT_EVERY_TICKS = REALM_TICK_RATE / REALM_SNAPSHOT_RATE;
const PLAYER_ATTACK_INTERVAL_MS = 900;
export const PLAYER_COMBAT_TIMEOUT_MS = 5_000;
export const PLAYER_HEALTH_REGEN_PER_SECOND = 2;
const PLAYER_HEALTH_REGEN_INTERVAL_MS = 1_000;
const REPATH_INTERVAL_MS = 250;
const DISCONNECTED_PLAYER_TTL_MS = 30_000;
const MONSTER_WANDER_RADIUS = 3;
const MONSTER_WANDER_MIN_DELAY_MS = 1_600;
const MONSTER_WANDER_MAX_DELAY_MS = 3_600;
const RIFT_COMPLETION_XP = 100;
const MAX_ACTIVE_RIFTS = 3;
const RIFT_STATE_CHECKPOINT_INTERVAL_MS = 1_000;

type MasteryKey = "melee" | "ranged" | "magic" | "defense";

interface RuntimeMastery {
  level: number;
  xp: number;
}

interface RuntimePlayer {
  id: EntityId;
  resumeToken: string;
  connectionId: string | null;
  disconnectedAt: number | null;
  name: string;
  position: GridPosition;
  direction: Direction;
  path: GridPosition[];
  targetId: EntityId | null;
  lastTargetPosition: GridPosition | null;
  nextMoveAt: number;
  nextAttackAt: number;
  nextRepathAt: number;
  lastCombatAt: number | null;
  nextHealthRegenAt: number;
  alive: boolean;
  hp: number;
  mp: number;
  level: number;
  xp: number;
  rank: PlayerRank | null;
  combatPath: CombatPath;
  className: string;
  masteries: Record<MasteryKey, RuntimeMastery>;
  inventory: Record<string, number>;
  equipment: Record<EquipmentSlot, string | null>;
  lastSequence: number;
  zoneId: string;
  pendingRiftId: string | null;
}

interface RuntimeMonster {
  definition: MonsterDefinition;
  position: GridPosition;
  direction: Direction;
  path: GridPosition[];
  targetId: EntityId | null;
  provokedById: EntityId | null;
  lastTargetPosition: GridPosition | null;
  nextMoveAt: number;
  nextAttackAt: number;
  nextRepathAt: number;
  nextWanderAt: number;
  alive: boolean;
  hp: number;
  respawnAt: number;
  zoneId: string;
  riftId: string | null;
  riftRoom: RiftRoomNumber | null;
  escapedFromRift: boolean;
}

interface RuntimeRift extends RankERift {
  outsideBossAlive: boolean;
  outsideBossId: string | null;
}

interface RuntimeRiftRun {
  playerId: string;
  zoneId: string;
  instance: RiftInstance;
  activeRoom: RiftRoomNumber;
  roomCleared: boolean;
  roomMonsterIds: string[];
  roomGeneralXp: number;
  roomItems: Map<string, number>;
}

interface RealmPeer {
  id: string;
  playerId: string | null;
  send: (message: ServerMessage) => void;
}

export interface RealmOptions {
  now?: () => number;
  random?: () => number;
  autoStart?: boolean;
  /** Browser-provided saves are accepted only by the explicit local/offline realm. */
  allowClientSaves?: boolean;
  /** Versioned portal cycle restored only by the local/offline realm. */
  persistedRiftWorldState?: PersistedRiftWorldState;
  /** Local persistence hook. Online realms deliberately keep their state in memory. */
  onRiftWorldStateChange?: (state: PersistedRiftWorldState) => void;
}

export class InMemoryRealm {
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly allowClientSaves: boolean;
  private readonly onRiftWorldStateChange?: (state: PersistedRiftWorldState) => void;
  private readonly peers = new Map<string, RealmPeer>();
  private readonly players = new Map<string, RuntimePlayer>();
  private readonly monsters = new Map<string, RuntimeMonster>();
  private readonly rifts = new Map<string, RuntimeRift>();
  private readonly riftRuns = new Map<string, RuntimeRiftRun>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private currentTick = 0;
  private riftSequence = 0;
  private nextRiftSpawnAt = 0;
  private riftStateDirty = false;
  private nextRiftStateCheckpointAt = 0;

  constructor(options: RealmOptions = {}) {
    this.now = options.now ?? Date.now;
    this.random = options.random ?? Math.random;
    this.allowClientSaves = options.allowClientSaves ?? false;
    this.onRiftWorldStateChange = options.onRiftWorldStateChange;
    for (const definition of STARTER_MONSTERS) {
      this.monsters.set(definition.id, {
        definition,
        position: clonePosition(definition.spawn),
        direction: "south",
        path: [],
        targetId: null,
        provokedById: null,
        lastTargetPosition: null,
        nextMoveAt: 0,
        nextAttackAt: 0,
        nextRepathAt: 0,
        nextWanderAt: 0,
        alive: true,
        hp: definition.maxHp,
        respawnAt: 0,
        zoneId: STARTER_MAP.id,
        riftId: null,
        riftRoom: null,
        escapedFromRift: false,
      });
    }

    const now = this.now();
    if (options.persistedRiftWorldState) {
      this.restoreRiftWorldState(options.persistedRiftWorldState);
      this.updateRifts(now);
    } else {
      this.spawnRift(now, RIFT_SPAWN_LOCATIONS[0].position);
      this.scheduleNextRift(now);
    }
    this.checkpointRiftWorldState(now, true);

    if (options.autoStart !== false) this.start();
  }

  start(): void {
    if (this.timer !== null) return;
    this.timer = setInterval(() => this.step(this.now()), TICK_INTERVAL_MS);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.checkpointRiftWorldState(this.now(), true);
  }

  registerPeer(id: string, send: (message: ServerMessage) => void): void {
    this.peers.set(id, { id, playerId: null, send });
  }

  disconnectPeer(id: string): void {
    const peer = this.peers.get(id);
    if (!peer) return;

    if (peer.playerId) {
      const player = this.players.get(peer.playerId);
      if (player?.connectionId === id) {
        player.connectionId = null;
        player.disconnectedAt = this.now();
        player.path = [];
        player.targetId = null;
      }
    }
    this.peers.delete(id);
  }

  joinPeer(peerId: string, message: JoinMessage): void {
    const peer = this.peers.get(peerId);
    if (!peer) return;
    if (peer.playerId) {
      this.sendError(peerId, "ALREADY_JOINED", "Ce client a déjà rejoint la zone.");
      return;
    }

    const resumed = message.resumeToken
      ? [...this.players.values()].find((player) => player.resumeToken === message.resumeToken)
      : undefined;
    const player = resumed ?? this.createPlayer(
      message.name,
      this.allowClientSaves ? message.savedProfile : undefined,
    );

    if (player.connectionId && player.connectionId !== peerId) {
      const previousPeer = this.peers.get(player.connectionId);
      if (previousPeer) previousPeer.playerId = null;
    }

    player.connectionId = peerId;
    player.disconnectedAt = null;
    // Command sequences are scoped to a WebSocket/client instance. A refreshed
    // browser starts again at zero and must not inherit the previous socket's
    // anti-replay counter.
    player.lastSequence = -1;
    player.name = this.cleanName(message.name);
    peer.playerId = player.id;
    this.players.set(player.id, player);

    peer.send({
      type: "welcome",
      playerId: player.id,
      resumeToken: player.resumeToken,
      tickRate: REALM_TICK_RATE,
      snapshotRate: REALM_SNAPSHOT_RATE,
      map: this.mapForZone(player.zoneId),
      snapshot: this.snapshotForPlayer(player),
    });
    this.broadcastSnapshot();
  }

  handleMessage(peerId: string, message: Exclude<ClientMessage, JoinMessage>): void {
    const peer = this.peers.get(peerId);
    const player = peer?.playerId ? this.players.get(peer.playerId) : undefined;
    if (!peer || !player) {
      this.sendError(peerId, "JOIN_REQUIRED", "Rejoignez la zone avant de jouer.");
      return;
    }

    if (message.type === "ping") {
      peer.send({ type: "pong", clientTime: message.clientTime, serverTime: this.now() });
      return;
    }

    if (message.sequence <= player.lastSequence) {
      this.sendError(peerId, "STALE_SEQUENCE", "Commande déjà traitée.", message.sequence);
      return;
    }
    player.lastSequence = message.sequence;

    if (message.type === "move") this.requestMove(player, message.destination, message.sequence);
    if (message.type === "target") this.requestTarget(player, message.targetId, message.sequence);
    if (message.type === "cast") {
      this.sendError(
        peerId,
        "SKILL_LOCKED",
        "L’Aventurier débloque ses compétences après son éveil au QG.",
        message.sequence,
      );
    }
    if (message.type === "respawn") this.respawnPlayer(player, message.sequence);
    if (message.type === "rift") {
      if (message.action === "enter") this.requestEnterRift(player, message.riftId, message.sequence);
      else this.requestLeaveRift(player, message.riftId, message.sequence);
    }
    if (message.type === "equip") this.requestEquip(player, message.itemId, message.sequence);
    if (message.type === "unequip") this.requestUnequip(player, message.slot, message.sequence);
  }

  /** Public for deterministic tests; production uses the internal interval. */
  step(now = this.now()): void {
    this.currentTick += 1;
    this.cleanupDisconnectedPlayers(now);
    this.updateRifts(now);
    this.updatePlayers(now);
    this.updateMonsters(now);
    this.regeneratePlayers(now);
    this.checkpointRiftWorldState(now);

    if (this.currentTick % SNAPSHOT_EVERY_TICKS === 0) this.broadcastSnapshot();
  }

  snapshot(): RealmSnapshot {
    return this.worldSnapshot();
  }

  /** Portable state used only by the browser-local realm. */
  exportRiftWorldState(savedAt = this.now()): PersistedRiftWorldState {
    return {
      version: RIFT_WORLD_SAVE_VERSION,
      savedAt: Math.max(0, Math.floor(savedAt)),
      nextRiftSpawnAt: Math.max(0, Math.floor(this.nextRiftSpawnAt)),
      riftSequence: this.riftSequence,
      rifts: [...this.rifts.values()]
        .sort((left, right) => left.spawnedAt - right.spawnedAt || left.id.localeCompare(right.id))
        .map((rift) => {
          const boss = rift.outsideBossId
            ? this.monsters.get(rift.outsideBossId)
            : undefined;
          const outsideBoss = rift.outsideBossAlive && boss?.alive
            ? {
                position: clonePosition(boss.position),
                hp: Math.max(1, Math.floor(boss.hp)),
              }
            : null;
          return {
            id: rift.id,
            rank: "E" as const,
            position: clonePosition(rift.position),
            spawnedAt: Math.max(0, Math.floor(rift.spawnedAt)),
            expiresAt: Math.max(0, Math.floor(rift.expiresAt)),
            status: rift.status,
            outsideBossAlive: outsideBoss !== null,
            outsideBoss,
          };
        }),
    };
  }

  private worldSnapshot(): RealmSnapshot {
    return {
      zoneId: STARTER_MAP.id,
      zoneKind: "world",
      map: STARTER_MAP,
      tick: this.currentTick,
      serverTime: this.now(),
      players: [...this.players.values()]
        .filter((player) => player.connectionId !== null && player.zoneId === STARTER_MAP.id)
        .map((player) => this.playerSnapshot(player))
        .sort((a, b) => a.id.localeCompare(b.id)),
      monsters: [...this.monsters.values()]
        .filter((monster) => monster.zoneId === STARTER_MAP.id)
        .map((monster) => this.monsterSnapshot(monster))
        .sort((a, b) => a.id.localeCompare(b.id)),
      rifts: this.riftSnapshots(),
      riftRun: null,
    };
  }

  private snapshotForPlayer(player: RuntimePlayer): RealmSnapshot {
    if (player.zoneId === STARTER_MAP.id) return this.worldSnapshot();
    return {
      zoneId: player.zoneId,
      zoneKind: "rift",
      map: RIFT_MAP,
      tick: this.currentTick,
      serverTime: this.now(),
      players: [...this.players.values()]
        .filter((candidate) => candidate.connectionId !== null && candidate.zoneId === player.zoneId)
        .map((candidate) => this.playerSnapshot(candidate))
        .sort((a, b) => a.id.localeCompare(b.id)),
      monsters: [...this.monsters.values()]
        .filter((monster) => monster.zoneId === player.zoneId)
        .map((monster) => this.monsterSnapshot(monster))
        .sort((a, b) => a.id.localeCompare(b.id)),
      rifts: this.riftSnapshots(),
      riftRun: this.riftRunSnapshot(player),
    };
  }

  private createPlayer(name: string, saved?: PersistedPlayerProfile): RuntimePlayer {
    const position = this.nearestOpenPosition(STARTER_MAP.playerSpawn);
    const player: RuntimePlayer = {
      id: crypto.randomUUID(),
      resumeToken: crypto.randomUUID(),
      connectionId: null,
      disconnectedAt: null,
      name: this.cleanName(name),
      position,
      direction: "south",
      path: [],
      targetId: null,
      lastTargetPosition: null,
      nextMoveAt: 0,
      nextAttackAt: 0,
      nextRepathAt: 0,
      lastCombatAt: null,
      nextHealthRegenAt: this.now() + PLAYER_HEALTH_REGEN_INTERVAL_MS,
      alive: true,
      hp: playerMaxHp(1, null),
      mp: playerMaxMp(1),
      level: 1,
      xp: 0,
      // Reaching level 10 only unlocks the future headquarters interaction.
      // A rank and combat path must never be assigned automatically.
      rank: null,
      combatPath: "adventurer",
      className: "Aventurier",
      masteries: {
        melee: { level: 0, xp: 0 },
        ranged: { level: 0, xp: 0 },
        magic: { level: 0, xp: 0 },
        defense: { level: 0, xp: 0 },
      },
      inventory: Object.fromEntries(
        Object.entries(STARTER_INVENTORY).filter(([, quantity]) => quantity > 0),
      ),
      equipment: {
        head: null,
        weapon: null,
        armor: null,
        legs: null,
        boots: null,
        ring: null,
      },
      lastSequence: -1,
      zoneId: STARTER_MAP.id,
      pendingRiftId: null,
    };
    if (saved) this.restorePlayer(player, saved);
    return player;
  }

  private cleanName(name: string): string {
    const cleaned = name.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 24);
    return cleaned || "Aventurier";
  }

  private restorePlayer(player: RuntimePlayer, saved: PersistedPlayerProfile): void {
    player.level = Math.max(1, Math.floor(saved.level));
    player.xp = Math.min(Math.max(0, Math.floor(saved.xp)), generalXpToNext(player.level) - 1);

    const hasAwakenedPath = saved.rank !== null && saved.combatPath !== "adventurer";
    player.rank = hasAwakenedPath ? saved.rank : null;
    player.combatPath = hasAwakenedPath ? saved.combatPath : "adventurer";
    player.className = hasAwakenedPath ? this.cleanName(saved.className) : "Aventurier";

    for (const key of ["melee", "ranged", "magic", "defense"] as const) {
      const level = Math.max(0, Math.floor(saved.masteries[key].level));
      player.masteries[key] = {
        level,
        xp: Math.min(
          Math.max(0, Math.floor(saved.masteries[key].xp)),
          masteryXpToNext(level) - 1,
        ),
      };
    }

    const inventory: Record<string, number> = {};
    for (const entry of saved.inventory) {
      if (!isKnownItem(entry.itemId)) continue;
      inventory[entry.itemId] = Math.min(
        9_999,
        (inventory[entry.itemId] ?? 0) + Math.max(0, Math.floor(entry.quantity)),
      );
    }
    player.inventory = inventory;
    player.equipment = {
      head: null,
      weapon: null,
      armor: null,
      legs: null,
      boots: null,
      ring: null,
    };
    for (const slot of Object.keys(player.equipment) as EquipmentSlot[]) {
      const itemId = saved.equipment[slot];
      if (!itemId || !isKnownItem(itemId) || (player.inventory[itemId] ?? 0) < 1) continue;
      const definition = ITEM_CATALOG[itemId];
      if (
        definition.kind === "equipment" &&
        definition.equipmentSlot === slot &&
        meetsItemRank(player.rank, definition.requiredRank)
      ) {
        player.equipment[slot] = itemId;
      }
    }

    const savedPosition = clonePosition(saved.position);
    if (isWalkable(STARTER_MAP, savedPosition, this.occupiedPositions(STARTER_MAP.id))) {
      player.position = savedPosition;
    }
    player.hp = Math.min(this.playerMaxHp(player), Math.max(1, Math.floor(saved.hp)));
    player.mp = Math.min(this.playerMaxMp(player), Math.max(0, Math.floor(saved.mp)));
    player.nextHealthRegenAt = this.now() + PLAYER_HEALTH_REGEN_INTERVAL_MS;
  }

  private restoreRiftWorldState(saved: PersistedRiftWorldState): void {
    this.rifts.clear();
    this.nextRiftSpawnAt = saved.nextRiftSpawnAt;
    this.riftSequence = saved.riftSequence;

    for (const persisted of saved.rifts) {
      const rift: RuntimeRift = {
        id: persisted.id,
        rank: "E",
        position: clonePosition(persisted.position),
        spawnedAt: persisted.spawnedAt,
        expiresAt: persisted.expiresAt,
        status: persisted.status,
        outsideBossAlive: persisted.outsideBossAlive,
        outsideBossId: null,
      };
      this.rifts.set(rift.id, rift);

      const sequence = /^rift-e-(\d+)$/.exec(rift.id)?.[1];
      if (sequence) this.riftSequence = Math.max(this.riftSequence, Number(sequence));

      if (!persisted.outsideBossAlive || !persisted.outsideBoss) continue;
      const preferred = persisted.outsideBoss.position;
      const spawn = isWalkable(
        STARTER_MAP,
        preferred,
        this.occupiedPositions(STARTER_MAP.id),
      )
        ? clonePosition(preferred)
        : this.nearestOpenPosition(
            { x: rift.position.x, y: rift.position.y + 3 },
            STARTER_MAP.id,
          );
      const definition = escapedRiftBoss(rift.id, spawn);
      const boss = this.addRuntimeMonster(definition, STARTER_MAP.id, rift.id, null, true);
      boss.hp = Math.min(definition.maxHp, Math.max(1, persisted.outsideBoss.hp));
      rift.outsideBossId = definition.id;
      rift.outsideBossAlive = true;
    }
  }

  private markRiftWorldStateDirty(): void {
    this.riftStateDirty = true;
  }

  private checkpointRiftWorldState(now: number, force = false): void {
    if (!this.onRiftWorldStateChange) return;
    if (!force && (!this.riftStateDirty || now < this.nextRiftStateCheckpointAt)) return;
    try {
      this.onRiftWorldStateChange(this.exportRiftWorldState(now));
      this.riftStateDirty = false;
      this.nextRiftStateCheckpointAt = now + RIFT_STATE_CHECKPOINT_INTERVAL_MS;
    } catch {
      // Persistence failure must never stop the authoritative local simulation.
      this.riftStateDirty = true;
      this.nextRiftStateCheckpointAt = now + RIFT_STATE_CHECKPOINT_INTERVAL_MS;
    }
  }

  private riftSnapshots(): RiftSnapshot[] {
    return [...this.rifts.values()]
      .map((rift) => ({
        id: rift.id,
        rank: rift.rank,
        position: clonePosition(rift.position),
        spawnedAt: rift.spawnedAt,
        expiresAt: rift.expiresAt,
        status: rift.status,
        outsideBossAlive: rift.outsideBossAlive,
      }))
      .sort((left, right) => left.spawnedAt - right.spawnedAt || left.id.localeCompare(right.id));
  }

  private riftRunSnapshot(player: RuntimePlayer): RiftRunSnapshot | null {
    const run = this.riftRuns.get(player.id);
    if (!run) return null;
    return {
      instanceId: run.instance.id,
      riftId: run.instance.riftId,
      rank: "E",
      startedAt: run.instance.startedAt,
      room: run.activeRoom,
      totalRooms: 3,
      roomCleared: run.roomCleared,
    };
  }

  private scheduleNextRift(now: number): void {
    const spread = RIFT_SPAWN_MAX_DELAY_MS - RIFT_SPAWN_MIN_DELAY_MS;
    this.nextRiftSpawnAt = now + RIFT_SPAWN_MIN_DELAY_MS + Math.floor(this.randomUnit() * spread);
    this.markRiftWorldStateDirty();
  }

  private spawnRift(now: number, requestedPosition?: GridPosition): RuntimeRift | null {
    if (this.rifts.size >= MAX_ACTIVE_RIFTS) return null;
    const occupied = new Set([...this.rifts.values()].map((rift) => positionKey(rift.position)));
    const candidates = RIFT_SPAWN_LOCATIONS.filter(
      (location) => !occupied.has(positionKey(location.position)),
    );
    const position = requestedPosition ?? candidates[Math.floor(this.randomUnit() * candidates.length)]?.position;
    if (!position) return null;
    const created = createRankERift({
      id: `rift-e-${++this.riftSequence}`,
      position,
      spawnedAt: now,
    });
    const rift: RuntimeRift = {
      ...created,
      outsideBossAlive: false,
      outsideBossId: null,
    };
    this.rifts.set(rift.id, rift);
    this.markRiftWorldStateDirty();
    return rift;
  }

  private updateRifts(now: number): void {
    for (const [id, rift] of this.rifts) {
      const advanced = advanceRankERift(rift, now);
      if (advanced.status === "boss-escaped" && rift.status !== "boss-escaped") {
        const escaped: RuntimeRift = { ...rift, status: "boss-escaped" };
        this.rifts.set(id, escaped);
        this.spawnEscapedRiftBoss(escaped);
      }
    }

    if (now >= this.nextRiftSpawnAt) {
      this.spawnRift(now);
      this.scheduleNextRift(now);
    }
  }

  private spawnEscapedRiftBoss(rift: RuntimeRift): void {
    const preferred = { x: rift.position.x, y: rift.position.y + 3 };
    const spawn = this.nearestOpenPosition(preferred, STARTER_MAP.id);
    const definition = escapedRiftBoss(rift.id, spawn);
    this.addRuntimeMonster(definition, STARTER_MAP.id, rift.id, null, true);
    rift.outsideBossAlive = true;
    rift.outsideBossId = definition.id;
    this.markRiftWorldStateDirty();

    for (const run of [...this.riftRuns.values()]) {
      if (run.instance.riftId !== rift.id) continue;
      const player = this.players.get(run.playerId);
      if (!player) continue;
      this.abandonRift(player);
      this.sendPlayerError(
        player,
        "RIFT_BOSS_ESCAPED",
        "Le Gardien s’est échappé. Tuez-le à l’extérieur avant de reprendre la faille.",
      );
    }
    this.broadcastEvent({ type: "rift-boss-escaped", riftId: rift.id, bossId: definition.id });
  }

  private addRuntimeMonster(
    definition: MonsterDefinition,
    zoneId: string,
    riftId: string | null,
    riftRoom: RiftRoomNumber | null,
    escapedFromRift = false,
  ): RuntimeMonster {
    const monster: RuntimeMonster = {
      definition,
      position: clonePosition(definition.spawn),
      direction: "south",
      path: [],
      targetId: null,
      provokedById: null,
      lastTargetPosition: null,
      nextMoveAt: 0,
      nextAttackAt: 0,
      nextRepathAt: 0,
      nextWanderAt: 0,
      alive: true,
      hp: definition.maxHp,
      respawnAt: 0,
      zoneId,
      riftId,
      riftRoom,
      escapedFromRift,
    };
    this.monsters.set(definition.id, monster);
    return monster;
  }

  private requestEnterRift(
    player: RuntimePlayer,
    riftId: string,
    sequence: number,
  ): void {
    if (!player.alive || player.zoneId !== STARTER_MAP.id || this.riftRuns.has(player.id)) {
      this.sendPlayerError(player, "RIFT_ENTRY_INVALID", "Vous ne pouvez pas entrer maintenant.", sequence);
      return;
    }
    const rift = this.rifts.get(riftId);
    if (!rift) {
      this.sendPlayerError(player, "RIFT_GONE", "Cette faille a déjà disparu.", sequence);
      return;
    }
    if (rift.outsideBossAlive) {
      this.sendPlayerError(
        player,
        "RIFT_BOSS_OUTSIDE",
        "Le Gardien échappé doit d’abord être vaincu à l’extérieur.",
        sequence,
      );
      return;
    }
    if (manhattanDistance(player.position, rift.position) <= 1) {
      this.enterRift(player, rift, this.now());
      return;
    }
    const path = findPathToAttackRange(STARTER_MAP, player.position, rift.position, 1, {
      occupied: this.occupiedPositions(STARTER_MAP.id, new Set([player.id])),
    });
    if (!path) {
      this.sendPlayerError(player, "NO_PATH", "Le portail est inaccessible.", sequence);
      return;
    }
    player.targetId = null;
    player.pendingRiftId = rift.id;
    player.path = path;
  }

  private enterRift(player: RuntimePlayer, rift: RuntimeRift, now: number): void {
    if (!this.rifts.has(rift.id) || rift.outsideBossAlive) return;
    const instance = createRiftInstance({
      id: crypto.randomUUID(),
      riftId: rift.id,
      startedAt: now,
    });
    const run: RuntimeRiftRun = {
      playerId: player.id,
      zoneId: `rift:${instance.id}`,
      instance,
      activeRoom: 1,
      roomCleared: false,
      roomMonsterIds: [],
      roomGeneralXp: 0,
      roomItems: new Map(),
    };
    this.riftRuns.set(player.id, run);
    player.zoneId = run.zoneId;
    player.position = clonePosition(RIFT_MAP.playerSpawn);
    player.direction = "east";
    player.path = [];
    player.targetId = null;
    player.pendingRiftId = null;
    player.lastTargetPosition = null;
    this.spawnRiftRoom(run);
    this.broadcastSnapshot();
  }

  private spawnRiftRoom(run: RuntimeRiftRun): void {
    run.roomMonsterIds = riftRoomMonsters(run.instance.id, run.activeRoom).map((definition) => {
      this.addRuntimeMonster(definition, run.zoneId, run.instance.riftId, run.activeRoom);
      return definition.id;
    });
    run.roomGeneralXp = 0;
    run.roomItems = new Map();
    run.roomCleared = false;
  }

  private advanceRiftRoomIfNeeded(player: RuntimePlayer): boolean {
    const run = this.riftRuns.get(player.id);
    if (!run || !run.roomCleared || run.activeRoom >= 3) return false;
    const nextRoom = (run.activeRoom + 1) as RiftRoomNumber;
    if (player.position.x < RIFT_ROOM_ENTRANCES[nextRoom - 1]) return false;
    for (const id of run.roomMonsterIds) this.monsters.delete(id);
    run.activeRoom = nextRoom;
    this.spawnRiftRoom(run);
    return true;
  }

  private clearRiftRoom(player: RuntimePlayer, run: RuntimeRiftRun, now: number): void {
    const finalRoom = run.activeRoom === 3;
    const rift = this.rifts.get(run.instance.riftId);
    if (finalRoom && rift?.outsideBossAlive) {
      this.rejectRiftClosureWhileBossOutside(player);
      return;
    }
    const guaranteedItems: RiftItemReward[] = finalRoom
      ? [
          { itemId: "poussiere-dimensionnelle", quantity: 3 },
          { itemId: "croc-de-faille", quantity: 1 },
        ]
      : [];
    const roomItems = [
      ...run.roomItems.entries().map(([itemId, quantity]) => ({ itemId, quantity })),
      ...guaranteedItems,
    ];
    run.instance = completeRiftRoom(run.instance, {
      room: run.activeRoom,
      clearedAt: now,
      rewards: {
        generalXp: run.roomGeneralXp + (finalRoom ? RIFT_COMPLETION_XP : 0),
        items: roomItems,
      },
    });

    if (!finalRoom) {
      run.roomCleared = true;
      this.sendEventToPlayer(player, {
        type: "rift-room-cleared",
        playerId: player.id,
        riftId: run.instance.riftId,
        room: run.activeRoom,
        nextRoom: (run.activeRoom + 1) as 2 | 3,
      });
      return;
    }

    this.addGeneralXp(player, RIFT_COMPLETION_XP);
    for (const reward of guaranteedItems) {
      player.inventory[reward.itemId] = (player.inventory[reward.itemId] ?? 0) + reward.quantity;
    }
    this.finishRift(player, run, now);
  }

  private finishRift(player: RuntimePlayer, run: RuntimeRiftRun, now: number): void {
    const rift = this.rifts.get(run.instance.riftId);
    if (rift?.outsideBossAlive) {
      this.rejectRiftClosureWhileBossOutside(player);
      return;
    }
    const returnPosition = rift
      ? { x: rift.position.x, y: rift.position.y + 3 }
      : STARTER_MAP.playerSpawn;
    for (const [id, monster] of this.monsters) {
      if (monster.zoneId === run.zoneId) this.monsters.delete(id);
    }
    if (rift?.outsideBossId) this.monsters.delete(rift.outsideBossId);
    this.riftRuns.delete(player.id);
    this.rifts.delete(run.instance.riftId);
    this.markRiftWorldStateDirty();
    player.zoneId = STARTER_MAP.id;
    player.position = this.nearestOpenPosition(returnPosition, STARTER_MAP.id);
    player.direction = "south";
    player.path = [];
    player.targetId = null;
    player.pendingRiftId = null;

    this.sendEventToPlayer(player, {
      type: "rift-complete",
      playerId: player.id,
      riftId: run.instance.riftId,
      rank: "E",
      elapsedMs: Math.max(0, now - run.instance.startedAt),
      generalXp: run.instance.rewards.generalXp,
      items: run.instance.rewards.items.map((reward) => ({ ...reward })),
    });
    this.broadcastSnapshot();
  }

  private rejectRiftClosureWhileBossOutside(player: RuntimePlayer): void {
    this.abandonRift(player);
    this.sendPlayerError(
      player,
      "RIFT_BOSS_OUTSIDE",
      "La faille résiste : le Gardien extérieur doit être vaincu avant sa fermeture.",
    );
    this.broadcastSnapshot();
  }

  private requestLeaveRift(player: RuntimePlayer, riftId: string, sequence: number): void {
    const run = this.riftRuns.get(player.id);
    if (!run || run.instance.riftId !== riftId) {
      this.sendPlayerError(player, "RIFT_NOT_ACTIVE", "Vous n’êtes pas dans cette faille.", sequence);
      return;
    }
    this.abandonRift(player);
    this.broadcastSnapshot();
  }

  private abandonRift(player: RuntimePlayer): void {
    const run = this.riftRuns.get(player.id);
    if (!run) return;
    for (const [id, monster] of this.monsters) {
      if (monster.zoneId === run.zoneId) this.monsters.delete(id);
    }
    const rift = this.rifts.get(run.instance.riftId);
    this.riftRuns.delete(player.id);
    player.zoneId = STARTER_MAP.id;
    player.position = this.nearestOpenPosition(
      rift ? { x: rift.position.x, y: rift.position.y + 3 } : STARTER_MAP.playerSpawn,
      STARTER_MAP.id,
    );
    player.path = [];
    player.targetId = null;
    player.pendingRiftId = null;
  }

  private requestMove(player: RuntimePlayer, destination: GridPosition, sequence: number): void {
    if (!player.alive) {
      this.sendPlayerError(player, "PLAYER_DEAD", "Vous devez réapparaître.", sequence);
      return;
    }

    const run = this.riftRuns.get(player.id);
    if (run && !run.roomCleared && run.activeRoom < 3) {
      const gateX = RIFT_ROOM_GATES[run.activeRoom - 1];
      if (destination.x >= gateX) {
        this.sendPlayerError(
          player,
          "RIFT_ROOM_LOCKED",
          "Éliminez tous les monstres avant de franchir cette porte.",
          sequence,
        );
        return;
      }
    }

    const map = this.mapForZone(player.zoneId);
    const path = findPath(map, player.position, destination, {
      occupied: this.occupiedPositions(player.zoneId, new Set([player.id])),
    });
    if (path === null) {
      this.sendPlayerError(player, "NO_PATH", "Cette case est inaccessible.", sequence);
      return;
    }

    player.targetId = null;
    player.pendingRiftId = null;
    player.lastTargetPosition = null;
    player.path = path;
  }

  private requestTarget(player: RuntimePlayer, targetId: string, sequence: number): void {
    if (!player.alive) {
      this.sendPlayerError(player, "PLAYER_DEAD", "Vous devez réapparaître.", sequence);
      return;
    }

    const target = this.monsters.get(targetId);
    if (!target?.alive || target.zoneId !== player.zoneId) {
      this.sendPlayerError(player, "INVALID_TARGET", "Cette cible n'est pas disponible.", sequence);
      return;
    }

    player.targetId = targetId;
    player.pendingRiftId = null;
    player.path = [];
    player.lastTargetPosition = null;
    player.nextRepathAt = 0;
    this.planPlayerAttackPath(player, target, this.now());
  }

  private requestEquip(player: RuntimePlayer, itemId: string, sequence: number): void {
    if (!isKnownItem(itemId)) {
      this.sendPlayerError(player, "UNKNOWN_ITEM", "Cet objet est inconnu.", sequence);
      return;
    }

    const definition = ITEM_CATALOG[itemId];
    const equipmentSlot = definition.equipmentSlot;
    if (definition.kind !== "equipment" || !equipmentSlot) {
      this.sendPlayerError(player, "ITEM_NOT_EQUIPPABLE", "Cet objet ne peut pas être équipé.", sequence);
      return;
    }
    if (definition.requiredRank && !meetsItemRank(player.rank, definition.requiredRank)) {
      this.sendPlayerError(
        player,
        "RANK_REQUIRED",
        `Le rang ${definition.requiredRank} est nécessaire pour équiper cet objet.`,
        sequence,
      );
      return;
    }
    if ((player.inventory[itemId] ?? 0) < 1) {
      this.sendPlayerError(
        player,
        "ITEM_NOT_OWNED",
        "Cet objet n’est pas dans votre inventaire.",
        sequence,
      );
      return;
    }

    const oldMaxHp = this.playerMaxHp(player);
    const oldMaxMp = this.playerMaxMp(player);
    player.equipment[equipmentSlot] = itemId;
    this.adjustVitalsAfterEquipmentChange(player, oldMaxHp, oldMaxMp);
    this.broadcastSnapshot();
  }

  private requestUnequip(player: RuntimePlayer, slot: EquipmentSlot, sequence: number): void {
    if (player.equipment[slot] === null) {
      this.sendPlayerError(player, "SLOT_EMPTY", "Cet emplacement est déjà vide.", sequence);
      return;
    }

    const oldMaxHp = this.playerMaxHp(player);
    const oldMaxMp = this.playerMaxMp(player);
    player.equipment[slot] = null;
    this.adjustVitalsAfterEquipmentChange(player, oldMaxHp, oldMaxMp);
    this.broadcastSnapshot();
  }

  private updatePlayers(now: number): void {
    for (const player of this.players.values()) {
      if (!player.connectionId || !player.alive) continue;

      if (player.pendingRiftId && player.zoneId === STARTER_MAP.id) {
        const rift = this.rifts.get(player.pendingRiftId);
        if (!rift) {
          player.pendingRiftId = null;
          player.path = [];
        } else if (manhattanDistance(player.position, rift.position) <= 1) {
          this.enterRift(player, rift, now);
          continue;
        }
      }

      const target = player.targetId ? this.monsters.get(player.targetId) : undefined;
      if (target && target.alive && target.zoneId === player.zoneId) {
        player.direction = directionBetween(player.position, target.position);
        if (
          this.canAttack(
            player.position,
            target.position,
            this.attackRange(player),
            this.mapForZone(player.zoneId),
          )
        ) {
          player.path = [];
          if (now >= player.nextAttackAt) this.playerAttack(player, target, now);
          continue;
        }

        const targetMoved =
          !player.lastTargetPosition ||
          positionKey(player.lastTargetPosition) !== positionKey(target.position);
        if (targetMoved || player.path.length === 0 || now >= player.nextRepathAt) {
          this.planPlayerAttackPath(player, target, now);
        }
      } else if (player.targetId) {
        player.targetId = null;
        player.path = [];
        player.lastTargetPosition = null;
      }

      this.advancePlayer(player, now);
    }
  }

  private planPlayerAttackPath(player: RuntimePlayer, target: RuntimeMonster, now: number): void {
    const map = this.mapForZone(player.zoneId);
    const path = findPathToAttackRange(
      map,
      player.position,
      target.position,
      this.attackRange(player),
      {
        occupied: this.occupiedPositions(
          player.zoneId,
          new Set([player.id, target.definition.id]),
        ),
      },
    );
    player.path = path ?? [];
    player.lastTargetPosition = clonePosition(target.position);
    player.nextRepathAt = now + REPATH_INTERVAL_MS;
  }

  private advancePlayer(player: RuntimePlayer, now: number): void {
    if (player.path.length === 0 || now < player.nextMoveAt) return;
    const interval = playerMoveIntervalMs(player.level);

    // A stale timestamp after an idle period must not grant a burst of catch-up moves.
    if (player.nextMoveAt <= 0 || now - player.nextMoveAt > interval * 2) {
      player.nextMoveAt = now;
    }

    // At high Speed, two tiles can legitimately become due during one 100 ms server tick.
    // Anchoring the schedule to its previous deadline also preserves small gains such as
    // 100 -> 101 instead of losing them to tick rounding.
    let steps = 0;
    while (player.path.length > 0 && now >= player.nextMoveAt && steps < 2) {
      const next = player.path[0];
      const map = this.mapForZone(player.zoneId);
      const occupied = this.occupiedPositions(player.zoneId, new Set([player.id]));
      if (!isWalkable(map, next, occupied)) {
        player.path = [];
        player.nextRepathAt = 0;
        return;
      }

      player.direction = directionBetween(player.position, next);
      player.position = clonePosition(next);
      player.path.shift();
      player.nextMoveAt += interval;
      steps += 1;
      if (this.advanceRiftRoomIfNeeded(player)) {
        player.path = [];
        break;
      }
    }
  }

  private playerAttack(player: RuntimePlayer, target: RuntimeMonster, now: number): void {
    player.nextAttackAt = now + PLAYER_ATTACK_INTERVAL_MS;
    this.markPlayerInCombat(player, now);
    const offensive = this.playerCombatStat(player);
    const rawDamage = outgoingPlayerDamage(offensive, player.rank);
    const damage = damageAfterDefense(rawDamage, target.definition.defense);
    target.hp = Math.max(0, target.hp - damage);
    if (target.escapedFromRift) this.markRiftWorldStateDirty();
    if (target.definition.behaviour === "defensive") target.provokedById = player.id;

    this.broadcastEvent({
      type: "damage",
      sourceId: player.id,
      targetId: target.definition.id,
      amount: damage,
      remainingHp: target.hp,
    });

    const mastery = this.masteryForPath(player.combatPath);
    const xp = trainingXpForAction(5, player.rank);
    this.addMasteryXp(player, mastery, xp);
    this.sendEventToPlayer(player, {
      type: "xp",
      playerId: player.id,
      general: 0,
      mastery,
      masteryXp: xp,
    });

    if (target.hp <= 0) this.killMonster(target, player, now);
  }

  private updateMonsters(now: number): void {
    for (const monster of this.monsters.values()) {
      if (!monster.alive) {
        if (monster.riftId === null && now >= monster.respawnAt) this.respawnMonster(monster);
        continue;
      }

      this.updateMonsterTarget(monster);
      const target = monster.targetId ? this.players.get(monster.targetId) : undefined;
      if (target?.alive && target.connectionId && target.zoneId === monster.zoneId) {
        monster.direction = directionBetween(monster.position, target.position);
        if (
          this.canAttack(
            monster.position,
            target.position,
            1,
            this.mapForZone(monster.zoneId),
          )
        ) {
          monster.path = [];
          if (now >= monster.nextAttackAt) this.monsterAttack(monster, target, now);
          continue;
        }

        const targetMoved =
          !monster.lastTargetPosition ||
          positionKey(monster.lastTargetPosition) !== positionKey(target.position);
        if (targetMoved || monster.path.length === 0 || now >= monster.nextRepathAt) {
          monster.path =
            findPathToAttackRange(this.mapForZone(monster.zoneId), monster.position, target.position, 1, {
              occupied: this.occupiedPositions(
                monster.zoneId,
                new Set([monster.definition.id, target.id]),
              ),
            }) ?? [];
          monster.lastTargetPosition = clonePosition(target.position);
          monster.nextRepathAt = now + REPATH_INTERVAL_MS;
        }
      } else {
        monster.targetId = null;
        monster.lastTargetPosition = null;
        this.planIdleMonsterMovement(monster, now);
      }

      this.advanceMonster(monster, now);
    }
  }

  private updateMonsterTarget(monster: RuntimeMonster): void {
    const current = monster.targetId ? this.players.get(monster.targetId) : undefined;
    if (current) {
      const outsideLeash =
        manhattanDistance(monster.position, monster.definition.spawn) >
          monster.definition.leashRange ||
        manhattanDistance(current.position, monster.definition.spawn) >
          monster.definition.leashRange + 2;
      if (
        !current.alive ||
        !current.connectionId ||
        current.zoneId !== monster.zoneId ||
        outsideLeash
      ) {
        monster.targetId = null;
        monster.provokedById = null;
        monster.path = [];
        monster.lastTargetPosition = null;
        monster.nextRepathAt = 0;
      }
    }

    if (monster.definition.behaviour === "passive") {
      monster.targetId = null;
      return;
    }

    if (monster.definition.behaviour === "defensive") {
      if (!monster.targetId && monster.provokedById) {
        const aggressor = this.players.get(monster.provokedById);
        if (aggressor?.alive && aggressor.connectionId) monster.targetId = aggressor.id;
      }
      return;
    }

    if (monster.targetId) return;
    let closest: RuntimePlayer | null = null;
    let closestDistance = Number.POSITIVE_INFINITY;
    for (const player of this.players.values()) {
      if (!player.alive || !player.connectionId || player.zoneId !== monster.zoneId) continue;
      const distance = manhattanDistance(monster.position, player.position);
      if (distance <= monster.definition.detectionRange && distance < closestDistance) {
        closest = player;
        closestDistance = distance;
      }
    }
    monster.targetId = closest?.id ?? null;
  }

  private planIdleMonsterMovement(monster: RuntimeMonster, now: number): void {
    const distanceFromSpawn = manhattanDistance(monster.position, monster.definition.spawn);
    const wanderRadius = Math.max(
      1,
      Math.min(MONSTER_WANDER_RADIUS, monster.definition.leashRange),
    );

    // A chase can end outside the small idle area. Returning home always takes
    // priority over selecting another patrol destination.
    if (distanceFromSpawn > wanderRadius) {
      if (monster.path.length === 0 || now >= monster.nextRepathAt) {
        monster.path =
          findPath(this.mapForZone(monster.zoneId), monster.position, monster.definition.spawn, {
            occupied: this.occupiedPositions(monster.zoneId, new Set([monster.definition.id])),
          }) ?? [];
        monster.nextRepathAt = now + REPATH_INTERVAL_MS;
      }
      return;
    }

    if (monster.path.length > 0 || now < monster.nextWanderAt) return;

    const occupied = this.occupiedPositions(monster.zoneId, new Set([monster.definition.id]));
    const candidates: GridPosition[] = [];
    for (
      let y = monster.definition.spawn.y - wanderRadius;
      y <= monster.definition.spawn.y + wanderRadius;
      y += 1
    ) {
      for (
        let x = monster.definition.spawn.x - wanderRadius;
        x <= monster.definition.spawn.x + wanderRadius;
        x += 1
      ) {
        const candidate = { x, y };
        if (
          positionKey(candidate) !== positionKey(monster.position) &&
          manhattanDistance(candidate, monster.definition.spawn) <= wanderRadius &&
          isWalkable(this.mapForZone(monster.zoneId), candidate, occupied)
        ) {
          candidates.push(candidate);
        }
      }
    }

    const roll = this.randomUnit();
    monster.nextWanderAt =
      now +
      MONSTER_WANDER_MIN_DELAY_MS +
      Math.floor(roll * (MONSTER_WANDER_MAX_DELAY_MS - MONSTER_WANDER_MIN_DELAY_MS));
    if (candidates.length === 0) return;

    const startIndex = Math.floor(roll * candidates.length);
    for (let offset = 0; offset < candidates.length; offset += 1) {
      const destination = candidates[(startIndex + offset) % candidates.length];
      const path = findPath(this.mapForZone(monster.zoneId), monster.position, destination, { occupied });
      if (
        path &&
        path.length > 0 &&
        path.every(
          (position) =>
            manhattanDistance(position, monster.definition.spawn) <= wanderRadius,
        )
      ) {
        monster.path = path;
        monster.nextRepathAt = now + REPATH_INTERVAL_MS;
        return;
      }
    }
  }

  private randomUnit(): number {
    return Math.min(1 - Number.EPSILON, Math.max(0, this.random()));
  }

  private advanceMonster(monster: RuntimeMonster, now: number): void {
    if (monster.path.length === 0 || now < monster.nextMoveAt) return;
    const next = monster.path[0];
    const occupied = this.occupiedPositions(monster.zoneId, new Set([monster.definition.id]));
    if (!isWalkable(this.mapForZone(monster.zoneId), next, occupied)) {
      monster.path = [];
      monster.nextRepathAt = 0;
      return;
    }

    monster.direction = directionBetween(monster.position, next);
    monster.position = clonePosition(next);
    monster.path.shift();
    monster.nextMoveAt = now + monster.definition.moveIntervalMs;
    if (monster.escapedFromRift) this.markRiftWorldStateDirty();
  }

  private monsterAttack(monster: RuntimeMonster, player: RuntimePlayer, now: number): void {
    monster.nextAttackAt = now + monster.definition.attackIntervalMs;
    this.markPlayerInCombat(player, now);
    const effectiveDefense = this.playerDefenseStat(player) * (1 + rankBonus(player.rank));
    const damage = damageAfterDefense(monster.definition.attackDamage, effectiveDefense);
    player.hp = Math.max(0, player.hp - damage);
    this.broadcastEvent({
      type: "damage",
      sourceId: monster.definition.id,
      targetId: player.id,
      amount: damage,
      remainingHp: player.hp,
    });

    const xp = trainingXpForAction(3, player.rank);
    this.addMasteryXp(player, "defense", xp);
    this.sendEventToPlayer(player, {
      type: "xp",
      playerId: player.id,
      general: 0,
      mastery: "defense",
      masteryXp: xp,
    });

    if (player.hp <= 0) {
      player.alive = false;
      player.path = [];
      player.targetId = null;
      monster.targetId = null;
      monster.provokedById = null;
      this.broadcastEvent({ type: "death", entityId: player.id, killerId: monster.definition.id });
    }
  }

  private killMonster(monster: RuntimeMonster, killer: RuntimePlayer, now: number): void {
    monster.alive = false;
    monster.path = [];
    monster.targetId = null;
    monster.provokedById = null;
    monster.lastTargetPosition = null;
    monster.respawnAt = monster.riftId === null
      ? now + monster.definition.respawnMs
      : Number.POSITIVE_INFINITY;
    killer.targetId = null;
    killer.path = [];
    this.broadcastEvent({
      type: "death",
      entityId: monster.definition.id,
      killerId: killer.id,
    });

    this.addGeneralXp(killer, monster.definition.xpReward);
    const run = this.riftRuns.get(killer.id);
    if (run && monster.zoneId === run.zoneId && monster.riftRoom === run.activeRoom) {
      run.roomGeneralXp += monster.definition.xpReward;
    }
    this.sendEventToPlayer(killer, {
      type: "xp",
      playerId: killer.id,
      general: monster.definition.xpReward,
      mastery: null,
      masteryXp: 0,
    });
    if (this.random() <= monster.definition.lootChance) {
      const itemId = monster.definition.lootItemId;
      killer.inventory[itemId] = (killer.inventory[itemId] ?? 0) + 1;
      if (run && monster.zoneId === run.zoneId && monster.riftRoom === run.activeRoom) {
        run.roomItems.set(itemId, (run.roomItems.get(itemId) ?? 0) + 1);
      }
      this.sendEventToPlayer(killer, {
        type: "loot",
        playerId: killer.id,
        itemId,
        quantity: 1,
      });
    }

    if (monster.escapedFromRift && monster.riftId) {
      const rift = this.rifts.get(monster.riftId);
      if (rift) {
        rift.outsideBossAlive = false;
        rift.outsideBossId = null;
        this.markRiftWorldStateDirty();
        this.broadcastEvent({
          type: "rift-outside-boss-defeated",
          riftId: rift.id,
          playerId: killer.id,
        });
      }
      this.monsters.delete(monster.definition.id);
      return;
    }

    if (run && monster.riftRoom === run.activeRoom) {
      const roomCleared = run.roomMonsterIds.every(
        (id) => this.monsters.get(id)?.alive === false,
      );
      if (roomCleared) this.clearRiftRoom(killer, run, now);
    }
  }

  private respawnMonster(monster: RuntimeMonster): void {
    monster.alive = true;
    monster.hp = monster.definition.maxHp;
    monster.position = clonePosition(monster.definition.spawn);
    monster.direction = "south";
    monster.path = [];
    monster.targetId = null;
    monster.provokedById = null;
    monster.lastTargetPosition = null;
    monster.respawnAt = 0;
    monster.nextAttackAt = 0;
    monster.nextMoveAt = 0;
    monster.nextRepathAt = 0;
    monster.nextWanderAt = 0;
    this.broadcastEvent({
      type: "respawn",
      entityId: monster.definition.id,
      position: clonePosition(monster.position),
    });
  }

  private respawnPlayer(player: RuntimePlayer, sequence: number): void {
    if (player.alive) {
      this.sendPlayerError(player, "ALREADY_ALIVE", "Vous êtes déjà en vie.", sequence);
      return;
    }
    if (this.riftRuns.has(player.id)) this.abandonRift(player);
    player.alive = true;
    player.zoneId = STARTER_MAP.id;
    player.position = this.nearestOpenPosition(STARTER_MAP.playerSpawn, STARTER_MAP.id);
    player.hp = this.playerMaxHp(player);
    player.mp = this.playerMaxMp(player);
    player.direction = "south";
    player.path = [];
    player.pendingRiftId = null;
    player.lastCombatAt = null;
    player.nextHealthRegenAt = this.now() + PLAYER_HEALTH_REGEN_INTERVAL_MS;
    this.broadcastEvent({ type: "respawn", entityId: player.id, position: player.position });
  }

  private markPlayerInCombat(player: RuntimePlayer, now: number): void {
    player.lastCombatAt = now;
    player.nextHealthRegenAt =
      now + PLAYER_COMBAT_TIMEOUT_MS + PLAYER_HEALTH_REGEN_INTERVAL_MS;
  }

  private regeneratePlayers(now: number): void {
    for (const player of this.players.values()) {
      if (!player.alive || now < player.nextHealthRegenAt) continue;

      // Resolve all elapsed whole seconds in one operation. The restored
      // amount therefore stays identical even if a server tick arrives late.
      const elapsedTicks =
        Math.floor(
          (now - player.nextHealthRegenAt) / PLAYER_HEALTH_REGEN_INTERVAL_MS,
        ) + 1;
      player.nextHealthRegenAt += elapsedTicks * PLAYER_HEALTH_REGEN_INTERVAL_MS;

      const maxHp = this.playerMaxHp(player);
      if (player.hp >= maxHp) continue;
      player.hp = Math.min(
        maxHp,
        player.hp + elapsedTicks * PLAYER_HEALTH_REGEN_PER_SECOND,
      );
    }
  }

  private addGeneralXp(player: RuntimePlayer, amount: number): void {
    player.xp += Math.max(0, amount);
    while (player.xp >= generalXpToNext(player.level)) {
      player.xp -= generalXpToNext(player.level);
      player.level += 1;
      player.hp = this.playerMaxHp(player);
      player.mp = this.playerMaxMp(player);
      this.broadcastEvent({ type: "level-up", playerId: player.id, level: player.level });
    }
  }

  private addMasteryXp(player: RuntimePlayer, mastery: MasteryKey, amount: number): void {
    const state = player.masteries[mastery];
    state.xp += Math.max(0, amount);
    while (state.xp >= masteryXpToNext(state.level)) {
      state.xp -= masteryXpToNext(state.level);
      state.level += 1;
    }
  }

  private attackRange(player: RuntimePlayer): number {
    if (player.combatPath === "ranged") return 5;
    if (player.combatPath === "magic") return 4;
    return 1;
  }

  private masteryForPath(combatPath: CombatPath): Exclude<MasteryKey, "defense"> {
    if (combatPath === "ranged") return "ranged";
    if (combatPath === "magic") return "magic";
    return "melee";
  }

  private canAttack(
    from: GridPosition,
    to: GridPosition,
    range: number,
    map: PublicMapDefinition,
  ): boolean {
    return (
      manhattanDistance(from, to) <= range &&
      (range === 1 || hasLineOfSight(map, from, to))
    );
  }

  private mapForZone(zoneId: string): PublicMapDefinition {
    return zoneId === STARTER_MAP.id ? STARTER_MAP : RIFT_MAP;
  }

  private occupiedPositions(
    zoneId: string,
    excludedIds = new Set<string>(),
  ): ReadonlySet<string> {
    const occupied = new Set<string>();
    for (const player of this.players.values()) {
      if (
        !player.alive ||
        !player.connectionId ||
        player.zoneId !== zoneId ||
        excludedIds.has(player.id)
      ) continue;
      occupied.add(positionKey(player.position));
    }
    for (const monster of this.monsters.values()) {
      if (
        !monster.alive ||
        monster.zoneId !== zoneId ||
        excludedIds.has(monster.definition.id)
      ) continue;
      occupied.add(positionKey(monster.position));
    }
    return occupied;
  }

  private nearestOpenPosition(origin: GridPosition, zoneId = STARTER_MAP.id): GridPosition {
    const map = this.mapForZone(zoneId);
    const occupied = this.occupiedPositions(zoneId);
    if (isWalkable(map, origin, occupied)) return clonePosition(origin);
    for (let radius = 1; radius < 8; radius += 1) {
      for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          const position = { x: origin.x + dx, y: origin.y + dy };
          if (isWalkable(map, position, occupied)) return position;
        }
      }
    }
    throw new Error("No free player spawn tile is available.");
  }

  private cleanupDisconnectedPlayers(now: number): void {
    for (const player of this.players.values()) {
      if (
        player.connectionId === null &&
        player.disconnectedAt !== null &&
        now - player.disconnectedAt >= DISCONNECTED_PLAYER_TTL_MS
      ) {
        if (this.riftRuns.has(player.id)) this.abandonRift(player);
        this.players.delete(player.id);
        for (const monster of this.monsters.values()) {
          if (monster.targetId === player.id) {
            monster.targetId = null;
            monster.path = [];
            monster.lastTargetPosition = null;
            monster.nextRepathAt = 0;
          }
          if (monster.provokedById === player.id) monster.provokedById = null;
        }
      }
    }
  }

  private playerCombatStat(player: RuntimePlayer): number {
    return combatStatForPath(player.combatPath, player.level, {
      melee: player.masteries.melee.level + this.equipmentBonus(player, "melee"),
      ranged: player.masteries.ranged.level + this.equipmentBonus(player, "ranged"),
      magic: player.masteries.magic.level + this.equipmentBonus(player, "magic"),
    });
  }

  private playerDefenseStat(player: RuntimePlayer): number {
    return player.level + player.masteries.defense.level + this.equipmentBonus(player, "defense");
  }

  private playerEnergyStat(player: RuntimePlayer): number {
    return player.level + this.equipmentBonus(player, "energy");
  }

  private playerMaxHp(player: RuntimePlayer): number {
    return playerMaxHp(this.playerEnergyStat(player), player.rank);
  }

  private playerMaxMp(player: RuntimePlayer): number {
    return playerMaxMp(this.playerEnergyStat(player));
  }

  private equipmentBonus(player: RuntimePlayer, bonus: keyof ItemBonuses): number {
    let total = 0;
    for (const itemId of Object.values(player.equipment)) {
      if (!itemId || !isKnownItem(itemId)) continue;
      const definition: ItemDefinition = ITEM_CATALOG[itemId];
      total += definition.bonuses?.[bonus] ?? 0;
    }
    return total;
  }

  private adjustVitalsAfterEquipmentChange(
    player: RuntimePlayer,
    oldMaxHp: number,
    oldMaxMp: number,
  ): void {
    const newMaxHp = this.playerMaxHp(player);
    const newMaxMp = this.playerMaxMp(player);
    const hpRatio = oldMaxHp > 0 ? player.hp / oldMaxHp : 1;
    const mpRatio = oldMaxMp > 0 ? player.mp / oldMaxMp : 1;
    player.hp = player.alive
      ? Math.min(newMaxHp, Math.max(0, Math.round(newMaxHp * hpRatio)))
      : 0;
    player.mp = Math.min(newMaxMp, Math.max(0, Math.round(newMaxMp * mpRatio)));
  }

  private playerSnapshot(player: RuntimePlayer): PlayerSnapshot {
    const combatStat = this.playerCombatStat(player);
    const defense = this.playerDefenseStat(player);
    const energy = this.playerEnergyStat(player);
    return {
      id: player.id,
      name: player.name,
      position: clonePosition(player.position),
      direction: player.direction,
      moving: player.path.length > 0,
      alive: player.alive,
      targetId: player.targetId,
      hp: player.hp,
      maxHp: this.playerMaxHp(player),
      mp: player.mp,
      maxMp: this.playerMaxMp(player),
      level: player.level,
      xp: player.xp,
      xpToNext: generalXpToNext(player.level),
      rank: player.rank,
      awakened: player.rank !== null,
      awakeningEligible: isAwakeningEligible(player.level, player.rank),
      combatPath: player.combatPath,
      className: player.className,
      power: powerIndex({
        level: player.level,
        combatStat,
        defense,
        energy,
      }),
      speed: playerSpeed(player.level),
      masteries: {
        melee: {
          level: player.masteries.melee.level,
          xp: player.masteries.melee.xp,
          xpToNext: masteryXpToNext(player.masteries.melee.level),
        },
        ranged: {
          level: player.masteries.ranged.level,
          xp: player.masteries.ranged.xp,
          xpToNext: masteryXpToNext(player.masteries.ranged.level),
        },
        magic: {
          level: player.masteries.magic.level,
          xp: player.masteries.magic.xp,
          xpToNext: masteryXpToNext(player.masteries.magic.level),
        },
        defense: {
          level: player.masteries.defense.level,
          xp: player.masteries.defense.xp,
          xpToNext: masteryXpToNext(player.masteries.defense.level),
        },
      },
      inventory: Object.entries(player.inventory)
        .filter(([, quantity]) => quantity > 0)
        .map(([itemId, quantity]) => ({ itemId, quantity }))
        .sort((a, b) => a.itemId.localeCompare(b.itemId)),
      equipment: { ...player.equipment },
    };
  }

  private monsterSnapshot(monster: RuntimeMonster): MonsterSnapshot {
    return {
      id: monster.definition.id,
      species: monster.definition.species,
      name: monster.definition.name,
      behaviour: monster.definition.behaviour,
      position: clonePosition(monster.position),
      direction: monster.direction,
      moving: monster.path.length > 0,
      alive: monster.alive,
      targetId: monster.targetId,
      hp: monster.hp,
      maxHp: monster.definition.maxHp,
      level: monster.definition.level,
      isBoss: monster.definition.isBoss ?? false,
      moveIntervalMs: monster.definition.moveIntervalMs,
    };
  }

  private broadcastSnapshot(): void {
    for (const peer of this.peers.values()) {
      const player = peer.playerId ? this.players.get(peer.playerId) : undefined;
      if (player) {
        this.safeSend(peer, { type: "snapshot", snapshot: this.snapshotForPlayer(player) });
      }
    }
  }

  private broadcastEvent(event: GameEvent): void {
    const message: ServerMessage = { type: "event", event };
    for (const peer of this.peers.values()) {
      if (peer.playerId) this.safeSend(peer, message);
    }
  }

  private sendEventToPlayer(player: RuntimePlayer, event: GameEvent): void {
    if (!player.connectionId) return;
    const peer = this.peers.get(player.connectionId);
    if (peer) this.safeSend(peer, { type: "event", event });
  }

  private sendError(peerId: string, code: string, message: string, sequence?: number): void {
    const peer = this.peers.get(peerId);
    if (peer) this.safeSend(peer, { type: "error", code, message, sequence });
  }

  private sendPlayerError(
    player: RuntimePlayer,
    code: string,
    message: string,
    sequence?: number,
  ): void {
    if (player.connectionId) this.sendError(player.connectionId, code, message, sequence);
  }

  private safeSend(peer: RealmPeer, message: ServerMessage): void {
    try {
      peer.send(message);
    } catch {
      this.disconnectPeer(peer.id);
    }
  }
}
