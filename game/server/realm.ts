import {
  combatStatForPath,
  damageAfterDefense,
  generalXpToNext,
  isAwakeningEligible,
  isValidTrainingTarget,
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
  RealmSnapshot,
  ServerMessage,
} from "../shared/types";
import { clonePosition } from "../shared/types";
import {
  STARTER_MAP,
  STARTER_MONSTERS,
  type MonsterDefinition,
} from "./content";

export const REALM_TICK_RATE = 10;
export const REALM_SNAPSHOT_RATE = 5;
const TICK_INTERVAL_MS = 1_000 / REALM_TICK_RATE;
const SNAPSHOT_EVERY_TICKS = REALM_TICK_RATE / REALM_SNAPSHOT_RATE;
const PLAYER_ATTACK_INTERVAL_MS = 900;
const REPATH_INTERVAL_MS = 250;
const DISCONNECTED_PLAYER_TTL_MS = 30_000;
const MONSTER_WANDER_RADIUS = 3;
const MONSTER_WANDER_MIN_DELAY_MS = 1_600;
const MONSTER_WANDER_MAX_DELAY_MS = 3_600;

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
}

export class InMemoryRealm {
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly peers = new Map<string, RealmPeer>();
  private readonly players = new Map<string, RuntimePlayer>();
  private readonly monsters = new Map<string, RuntimeMonster>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private currentTick = 0;

  constructor(options: RealmOptions = {}) {
    this.now = options.now ?? Date.now;
    this.random = options.random ?? Math.random;
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
      });
    }

    if (options.autoStart !== false) this.start();
  }

  start(): void {
    if (this.timer !== null) return;
    this.timer = setInterval(() => this.step(this.now()), TICK_INTERVAL_MS);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer === null) return;
    clearInterval(this.timer);
    this.timer = null;
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
    const player = resumed ?? this.createPlayer(message.name);

    if (player.connectionId && player.connectionId !== peerId) {
      const previousPeer = this.peers.get(player.connectionId);
      if (previousPeer) previousPeer.playerId = null;
    }

    player.connectionId = peerId;
    player.disconnectedAt = null;
    player.name = this.cleanName(message.name);
    peer.playerId = player.id;
    this.players.set(player.id, player);

    peer.send({
      type: "welcome",
      playerId: player.id,
      resumeToken: player.resumeToken,
      tickRate: REALM_TICK_RATE,
      snapshotRate: REALM_SNAPSHOT_RATE,
      map: STARTER_MAP,
      snapshot: this.snapshot(),
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
    if (message.type === "equip") this.requestEquip(player, message.itemId, message.sequence);
    if (message.type === "unequip") this.requestUnequip(player, message.slot, message.sequence);
  }

  /** Public for deterministic tests; production uses the internal interval. */
  step(now = this.now()): void {
    this.currentTick += 1;
    this.cleanupDisconnectedPlayers(now);
    this.updatePlayers(now);
    this.updateMonsters(now);

    if (this.currentTick % SNAPSHOT_EVERY_TICKS === 0) this.broadcastSnapshot();
  }

  snapshot(): RealmSnapshot {
    return {
      zoneId: STARTER_MAP.id,
      tick: this.currentTick,
      serverTime: this.now(),
      players: [...this.players.values()]
        .filter((player) => player.connectionId !== null)
        .map((player) => this.playerSnapshot(player))
        .sort((a, b) => a.id.localeCompare(b.id)),
      monsters: [...this.monsters.values()]
        .map((monster) => this.monsterSnapshot(monster))
        .sort((a, b) => a.id.localeCompare(b.id)),
    };
  }

  private createPlayer(name: string): RuntimePlayer {
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
    };
    return player;
  }

  private cleanName(name: string): string {
    const cleaned = name.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 24);
    return cleaned || "Aventurier";
  }

  private requestMove(player: RuntimePlayer, destination: GridPosition, sequence: number): void {
    if (!player.alive) {
      this.sendPlayerError(player, "PLAYER_DEAD", "Vous devez réapparaître.", sequence);
      return;
    }

    const path = findPath(STARTER_MAP, player.position, destination, {
      occupied: this.occupiedPositions(new Set([player.id])),
    });
    if (path === null) {
      this.sendPlayerError(player, "NO_PATH", "Cette case est inaccessible.", sequence);
      return;
    }

    player.targetId = null;
    player.lastTargetPosition = null;
    player.path = path;
  }

  private requestTarget(player: RuntimePlayer, targetId: string, sequence: number): void {
    if (!player.alive) {
      this.sendPlayerError(player, "PLAYER_DEAD", "Vous devez réapparaître.", sequence);
      return;
    }

    const target = this.monsters.get(targetId);
    if (!target?.alive) {
      this.sendPlayerError(player, "INVALID_TARGET", "Cette cible n'est pas disponible.", sequence);
      return;
    }

    player.targetId = targetId;
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

      const target = player.targetId ? this.monsters.get(player.targetId) : undefined;
      if (target && target.alive) {
        player.direction = directionBetween(player.position, target.position);
        if (this.canAttack(player.position, target.position, this.attackRange(player))) {
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
    const path = findPathToAttackRange(
      STARTER_MAP,
      player.position,
      target.position,
      this.attackRange(player),
      { occupied: this.occupiedPositions(new Set([player.id, target.definition.id])) },
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
      const occupied = this.occupiedPositions(new Set([player.id]));
      if (!isWalkable(STARTER_MAP, next, occupied)) {
        player.path = [];
        player.nextRepathAt = 0;
        return;
      }

      player.direction = directionBetween(player.position, next);
      player.position = clonePosition(next);
      player.path.shift();
      player.nextMoveAt += interval;
      steps += 1;
    }
  }

  private playerAttack(player: RuntimePlayer, target: RuntimeMonster, now: number): void {
    player.nextAttackAt = now + PLAYER_ATTACK_INTERVAL_MS;
    const offensive = this.playerCombatStat(player);
    const rawDamage = outgoingPlayerDamage(offensive, player.rank);
    const damage = damageAfterDefense(rawDamage, target.definition.defense);
    target.hp = Math.max(0, target.hp - damage);
    if (target.definition.behaviour === "defensive") target.provokedById = player.id;

    this.broadcastEvent({
      type: "damage",
      sourceId: player.id,
      targetId: target.definition.id,
      amount: damage,
      remainingHp: target.hp,
    });

    if (isValidTrainingTarget(player.level, target.definition.level)) {
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
    }

    if (target.hp <= 0) this.killMonster(target, player, now);
  }

  private updateMonsters(now: number): void {
    for (const monster of this.monsters.values()) {
      if (!monster.alive) {
        if (now >= monster.respawnAt) this.respawnMonster(monster);
        continue;
      }

      this.updateMonsterTarget(monster);
      const target = monster.targetId ? this.players.get(monster.targetId) : undefined;
      if (target?.alive && target.connectionId) {
        monster.direction = directionBetween(monster.position, target.position);
        if (this.canAttack(monster.position, target.position, 1)) {
          monster.path = [];
          if (now >= monster.nextAttackAt) this.monsterAttack(monster, target, now);
          continue;
        }

        const targetMoved =
          !monster.lastTargetPosition ||
          positionKey(monster.lastTargetPosition) !== positionKey(target.position);
        if (targetMoved || monster.path.length === 0 || now >= monster.nextRepathAt) {
          monster.path =
            findPathToAttackRange(STARTER_MAP, monster.position, target.position, 1, {
              occupied: this.occupiedPositions(new Set([monster.definition.id, target.id])),
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
      if (!current.alive || !current.connectionId || outsideLeash) {
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
      if (!player.alive || !player.connectionId) continue;
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
          findPath(STARTER_MAP, monster.position, monster.definition.spawn, {
            occupied: this.occupiedPositions(new Set([monster.definition.id])),
          }) ?? [];
        monster.nextRepathAt = now + REPATH_INTERVAL_MS;
      }
      return;
    }

    if (monster.path.length > 0 || now < monster.nextWanderAt) return;

    const occupied = this.occupiedPositions(new Set([monster.definition.id]));
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
          isWalkable(STARTER_MAP, candidate, occupied)
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
      const path = findPath(STARTER_MAP, monster.position, destination, { occupied });
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
    const occupied = this.occupiedPositions(new Set([monster.definition.id]));
    if (!isWalkable(STARTER_MAP, next, occupied)) {
      monster.path = [];
      monster.nextRepathAt = 0;
      return;
    }

    monster.direction = directionBetween(monster.position, next);
    monster.position = clonePosition(next);
    monster.path.shift();
    monster.nextMoveAt = now + monster.definition.moveIntervalMs;
  }

  private monsterAttack(monster: RuntimeMonster, player: RuntimePlayer, now: number): void {
    monster.nextAttackAt = now + monster.definition.attackIntervalMs;
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

    if (isValidTrainingTarget(player.level, monster.definition.level)) {
      const xp = trainingXpForAction(3, player.rank);
      this.addMasteryXp(player, "defense", xp);
      this.sendEventToPlayer(player, {
        type: "xp",
        playerId: player.id,
        general: 0,
        mastery: "defense",
        masteryXp: xp,
      });
    }

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
    monster.respawnAt = now + monster.definition.respawnMs;
    killer.targetId = null;
    killer.path = [];
    this.broadcastEvent({
      type: "death",
      entityId: monster.definition.id,
      killerId: killer.id,
    });

    this.addGeneralXp(killer, monster.definition.xpReward);
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
      this.sendEventToPlayer(killer, {
        type: "loot",
        playerId: killer.id,
        itemId,
        quantity: 1,
      });
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
    player.alive = true;
    player.position = this.nearestOpenPosition(STARTER_MAP.playerSpawn);
    player.hp = this.playerMaxHp(player);
    player.mp = this.playerMaxMp(player);
    player.direction = "south";
    player.path = [];
    this.broadcastEvent({ type: "respawn", entityId: player.id, position: player.position });
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

  private canAttack(from: GridPosition, to: GridPosition, range: number): boolean {
    return (
      manhattanDistance(from, to) <= range &&
      (range === 1 || hasLineOfSight(STARTER_MAP, from, to))
    );
  }

  private occupiedPositions(excludedIds = new Set<string>()): ReadonlySet<string> {
    const occupied = new Set<string>();
    for (const player of this.players.values()) {
      if (!player.alive || !player.connectionId || excludedIds.has(player.id)) continue;
      occupied.add(positionKey(player.position));
    }
    for (const monster of this.monsters.values()) {
      if (!monster.alive || excludedIds.has(monster.definition.id)) continue;
      occupied.add(positionKey(monster.position));
    }
    return occupied;
  }

  private nearestOpenPosition(origin: GridPosition): GridPosition {
    const occupied = this.occupiedPositions();
    if (isWalkable(STARTER_MAP, origin, occupied)) return clonePosition(origin);
    for (let radius = 1; radius < 8; radius += 1) {
      for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          const position = { x: origin.x + dx, y: origin.y + dy };
          if (isWalkable(STARTER_MAP, position, occupied)) return position;
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
    const message: ServerMessage = { type: "snapshot", snapshot: this.snapshot() };
    for (const peer of this.peers.values()) {
      if (peer.playerId) this.safeSend(peer, message);
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
