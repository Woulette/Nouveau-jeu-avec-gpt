import * as Phaser from "phaser";

import type { GameHudUpdate } from "@/components/GameShell";
import type {
  HudEquipmentSlot,
  HudInventoryItem,
  HudReward,
  HudRift,
  HudRiftCompletion,
  HudStatBreakdown,
} from "@/components/Hud";
import { positionKey } from "@/game/shared/grid";
import {
  EQUIPMENT_SLOTS,
  ITEM_CATALOG,
  isKnownItem,
  meetsItemRank,
  type ItemBonuses,
  type ItemDefinition,
} from "@/game/shared/items";
import type {
  Direction,
  EquipmentSlot,
  EquipmentSnapshot,
  GameEvent,
  GridPosition,
  MonsterBehaviour,
  MonsterSnapshot,
  PlayerSnapshot,
  PublicMapDefinition,
  RealmSnapshot,
  RiftSnapshot,
} from "@/game/shared/types";
import { RIFT_MAP, RIFT_ROOM_GATES } from "@/game/shared/rifts";
import { STARTER_LANDMARKS, STARTER_MAP } from "@/game/shared/world";

import { createProceduralAssets } from "./AssetFactory";
import { WorldSocket } from "./WorldSocket";
import { loadPreferredConnectionMode, savePlayerSnapshot } from "./storage";
import {
  VISUAL_ANIMATIONS,
  VISUAL_KEYS,
  adventurerTextureKey,
  creatureTextureKey,
  portalTextureKey,
  type CardinalDirection,
  type CreatureKind,
} from "./visualTypes";

const PLAYER_NAME_KEY = "nouveau-mmo-player-name-v1";
const TILE = STARTER_MAP.tileSize;

interface WorldCallbacks {
  onReady(): void;
  onHud(update: GameHudUpdate): void;
}

interface EntityView {
  container: Phaser.GameObjects.Container;
  sprite: Phaser.GameObjects.Sprite;
  selection: Phaser.GameObjects.Sprite;
  label: Phaser.GameObjects.Text;
  health: Phaser.GameObjects.Graphics;
  lastTile: GridPosition | null;
  maxHp: number;
  isBoss: boolean;
  healthY: number;
}

interface RiftView {
  container: Phaser.GameObjects.Container;
  label: Phaser.GameObjects.Text;
  sprite: Phaser.GameObjects.Sprite;
}

const EQUIPMENT_LABELS: Readonly<Record<EquipmentSlot, string>> = {
  head: "Coiffe",
  weapon: "Corps-à-corps",
  armor: "Armure",
  legs: "Pantalon",
  boots: "Bottes",
  ring: "Anneau",
};

const EQUIPMENT_ICONS: Readonly<Record<EquipmentSlot, string>> = {
  head: "♕",
  weapon: "†",
  armor: "♜",
  legs: "♙",
  boots: "⌁",
  ring: "○",
};

const BONUS_LABELS: Readonly<Record<keyof ItemBonuses, string>> = {
  melee: "Corps-à-corps",
  ranged: "Distance",
  magic: "Magie",
  defense: "Défense",
  energy: "Énergie",
};

function tileCenter(position: GridPosition) {
  return {
    x: position.x * TILE + TILE / 2,
    y: position.y * TILE + TILE,
  };
}

function visualDirection(direction: Direction): CardinalDirection {
  if (direction === "north") return "up";
  if (direction === "south") return "down";
  if (direction === "east") return "right";
  return "left";
}

function creatureKind(species: string, isBoss: boolean): CreatureKind {
  if (isBoss || species === "rift-guardian") return "boss";
  if (species === "slime") return "slime";
  if (species === "wolf") return "corrupted";
  return "wolf";
}

const MONSTER_BEHAVIOUR_COPY: Readonly<
  Record<MonsterBehaviour, { label: string; color: string; hint: string }>
> = {
  passive: {
    label: "Paisible",
    color: "#8fd5a6",
    hint: "paisible · ne vous attaquera pas",
  },
  defensive: {
    label: "Riposte",
    color: "#efc875",
    hint: "défensif · riposte seulement si vous l’attaquez",
  },
  aggressive: {
    label: "Agressif",
    color: "#f08b8b",
    hint: "agressif · attaque les aventuriers à portée",
  },
};

export class WorldScene extends Phaser.Scene {
  private readonly callbacks: WorldCallbacks;
  private socket: WorldSocket | null = null;
  private map: PublicMapDefinition = STARTER_MAP;
  private localPlayerId: string | null = null;
  private selectedTargetId: string | null = null;
  private destinationMarker: Phaser.GameObjects.Sprite | null = null;
  private toast: Phaser.GameObjects.Text | null = null;
  private zoneTitle: Phaser.GameObjects.Text | null = null;
  private introText: Phaser.GameObjects.Text | null = null;
  private playerViews = new Map<string, EntityView>();
  private monsterViews = new Map<string, EntityView>();
  private latestPlayers = new Map<string, PlayerSnapshot>();
  private latestMonsters = new Map<string, MonsterSnapshot>();
  private attackingUntil = new Map<string, number>();
  private followedPlayerId: string | null = null;
  private equipment: EquipmentSnapshot = {
    head: null,
    weapon: null,
    armor: null,
    legs: null,
    boots: null,
    ring: null,
  };
  private inventorySignature = "";
  private rewards: HudReward[] = [];
  private rewardSequence = 0;
  private toastTween: Phaser.Tweens.Tween | null = null;
  private readySent = false;
  private worldLayer: Phaser.GameObjects.Layer | null = null;
  private riftLayer: Phaser.GameObjects.Layer | null = null;
  private zoneKind: "world" | "rift" = "world";
  private currentZoneId = STARTER_MAP.id;
  private riftViews = new Map<string, RiftView>();
  private latestRifts = new Map<string, RiftSnapshot>();
  private lastWorldPosition: GridPosition = { ...STARTER_MAP.playerSpawn };
  private latestLocalPlayer: PlayerSnapshot | null = null;
  private lastSaveAt = 0;

  private readonly equipListener = (event: Event) => {
    const itemId = (event as CustomEvent<{ itemId?: string }>).detail?.itemId;
    if (itemId) this.socket?.equip(itemId);
  };

  private readonly unequipListener = (event: Event) => {
    const slotId = (event as CustomEvent<{ slotId?: string }>).detail?.slotId;
    if (slotId && EQUIPMENT_SLOTS.includes(slotId as EquipmentSlot)) {
      this.socket?.unequip(slotId as EquipmentSlot);
    }
  };

  private readonly useItemListener = (event: Event) => {
    const itemId = (event as CustomEvent<{ itemId?: string }>).detail?.itemId;
    if (itemId) this.socket?.useItem(itemId);
  };

  private readonly respawnListener = () => {
    this.socket?.respawn();
  };

  private readonly connectionModeListener = (event: Event) => {
    const mode = (event as CustomEvent<{ mode?: "online" | "offline" }>).detail?.mode;
    if (mode === "online" || mode === "offline") {
      this.socket?.setConnectionMode(mode);
      this.showToast(
        mode === "offline" ? "Passage en mode hors ligne…" : "Connexion au monde en ligne…",
        0x76c9f4,
      );
    }
  };

  private readonly pageHideListener = () => {
    if (this.latestLocalPlayer && this.zoneKind === "world") {
      savePlayerSnapshot(this.latestLocalPlayer);
    }
  };

  constructor(callbacks: WorldCallbacks) {
    super({ key: "ValDAube" });
    this.callbacks = callbacks;
  }

  create() {
    createProceduralAssets(this);

    this.worldLayer = this.captureWorldLayer(() => this.createWorld());
    this.riftLayer = this.captureWorldLayer(() => this.createRiftWorld()).setVisible(false);
    this.destinationMarker = this.add
      .sprite(0, 0, VISUAL_KEYS.effects.destination)
      .setVisible(false)
      .setDepth(9_000);
    this.createScreenText();
    this.configureCamera();
    this.configureInput();

    window.addEventListener("ui:equip", this.equipListener);
    window.addEventListener("ui:unequip", this.unequipListener);
    window.addEventListener("ui:use-item", this.useItemListener);
    window.addEventListener("ui:respawn", this.respawnListener);
    window.addEventListener("ui:connection-mode", this.connectionModeListener);
    window.addEventListener("pagehide", this.pageHideListener);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.shutdownWorld());

    const playerName = this.getPlayerName();
    const preferredConnectionMode = loadPreferredConnectionMode();
    this.callbacks.onHud({ preferredConnectionMode });
    this.socket = new WorldSocket(
      { name: playerName },
      {
        onStatus: (status) => {
          this.callbacks.onHud({
            connectionStatus:
              status === "online"
                ? "connected"
                : status === "local"
                  ? "local"
                  : status === "offline"
                    ? "offline"
                    : "connecting",
          });
          if (status === "local") {
            this.showToast("Mode local actif · la partie reste jouable", 0x76c9f4);
          }
          if (status === "offline") {
            this.showToast("Mode hors ligne actif · progression sauvegardée sur cet appareil", 0x76c9f4);
          }
        },
        onWelcome: ({ playerId, map, snapshot }) => {
          this.localPlayerId = playerId;
          this.map = map;
          this.applySnapshot(snapshot, true);
        },
        onSnapshot: (snapshot) => this.applySnapshot(snapshot),
        onEvent: (event) => this.applyEvent(event),
        onError: (message) => this.showToast(message, 0xf0a46d),
      },
    );
    this.socket.connect();

    if (!this.readySent) {
      this.readySent = true;
      this.callbacks.onReady();
    }
    this.time.delayedCall(650, () =>
      this.showToast("Touchez une case pour vous déplacer · touchez un monstre pour combattre"),
    );
  }

  private createWorld() {
    const worldWidth = this.map.width * TILE;
    const worldHeight = this.map.height * TILE;

    this.add
      .tileSprite(worldWidth / 2, worldHeight / 2, worldWidth, worldHeight, VISUAL_KEYS.terrain.grass)
      .setDepth(0);
    this.add
      .tileSprite(15 * TILE, worldHeight / 2, 30 * TILE, worldHeight, VISUAL_KEYS.terrain.grassAlt)
      .setDepth(1)
      .setAlpha(0.8);

    this.add
      .tileSprite(31 * TILE, worldHeight / 2, 2 * TILE, worldHeight, VISUAL_KEYS.terrain.water)
      .setDepth(2);

    this.paintRect(14, 16, 12, 15, VISUAL_KEYS.terrain.cobble, 3);
    this.paintRect(15, 1, 4, 46, VISUAL_KEYS.terrain.cobble, 3);
    this.paintRect(1, 24, 29, 4, VISUAL_KEYS.terrain.path, 3);
    this.paintRect(30, 24, 28, 4, VISUAL_KEYS.terrain.path, 4);
    this.paintRect(52, 5, 8, 12, VISUAL_KEYS.terrain.riftGround, 3);
    this.paintRect(54, 16, 3, 10, VISUAL_KEYS.terrain.dirt, 3);

    for (const patch of [
      { x: 35, y: 31, w: 5, h: 3 },
      { x: 44, y: 7, w: 4, h: 3 },
      { x: 56, y: 35, w: 5, h: 4 },
    ]) {
      this.paintRect(patch.x, patch.y, patch.w, patch.h, VISUAL_KEYS.terrain.dirt, 2, 0.62);
    }

    this.createBridge();
    this.createBuildings();
    this.createProps();
    this.createNpc();

    this.add
      .text(32 * TILE + 18, 25.5 * TILE, "Prairies de l’Est  →", {
        fontFamily: "Georgia, serif",
        fontSize: "11px",
        color: "#dfd2ad",
        backgroundColor: "#11161dcc",
        padding: { x: 6, y: 3 },
      })
      .setOrigin(0, 0.5)
      .setDepth(4_000);
  }

  private captureWorldLayer(builder: () => void): Phaser.GameObjects.Layer {
    const before = new Set(this.children.list);
    builder();
    const created = this.children.list.filter((child) => !before.has(child));
    const layer = this.add.layer();
    layer.add(created);
    return layer;
  }

  private createRiftWorld() {
    const width = RIFT_MAP.width * TILE;
    const height = RIFT_MAP.height * TILE;
    this.add
      .tileSprite(width / 2, height / 2, width, height, VISUAL_KEYS.terrain.riftGround)
      .setDepth(0)
      .setTint(0x77658f);
    this.paintRect(1, 1, RIFT_MAP.width - 2, RIFT_MAP.height - 2, VISUAL_KEYS.terrain.dirt, 1, 0.72);
    this.paintRect(2, 7, RIFT_MAP.width - 4, 5, VISUAL_KEYS.terrain.path, 2, 0.68);

    const walls = this.add.graphics().setDepth(3);
    walls.fillStyle(0x171321, 1);
    walls.lineStyle(1, 0x76579b, 0.75);
    for (const key of RIFT_MAP.blocked) {
      const [x, y] = key.split(",").map(Number);
      walls.fillRect(x * TILE, y * TILE, TILE, TILE);
      walls.strokeRect(x * TILE + 1, y * TILE + 1, TILE - 2, TILE - 2);
    }

    for (const [index, gateX] of RIFT_ROOM_GATES.entries()) {
      const gate = this.add.graphics().setDepth(4);
      gate.fillStyle(0x7b4bac, 0.3).fillRect(gateX * TILE - 3, 6 * TILE, 6, 7 * TILE);
      gate.lineStyle(2, 0xb987ef, 0.8).lineBetween(gateX * TILE, 6 * TILE, gateX * TILE, 13 * TILE);
      this.worldLabel(
        gateX * TILE,
        5.8 * TILE,
        `Sceau ${index + 1}`,
        5,
        "#d5b6f4",
      );
    }

    const roomLabels = [
      { x: 9, text: "SALLE I · LES DISTORSIONS" },
      { x: 27, text: "SALLE II · LES TRAQUEURS" },
      { x: 44, text: "SALLE DU GARDIEN" },
    ];
    for (const room of roomLabels) {
      this.worldLabel(room.x * TILE, 2.2 * TILE, room.text, 5, "#cbb0ec");
    }

    const entrance = this.add
      .sprite(2.3 * TILE, 10.5 * TILE, portalTextureKey(0))
      .setOrigin(0.5, 1)
      .setScale(0.78)
      .setDepth(12 * TILE)
      .play(VISUAL_ANIMATIONS.portal);
    entrance.setTint(0x9a82bb);
  }

  private paintRect(
    x: number,
    y: number,
    width: number,
    height: number,
    texture: string,
    depth: number,
    alpha = 1,
  ) {
    for (let offsetY = 0; offsetY < height; offsetY += 1) {
      for (let offsetX = 0; offsetX < width; offsetX += 1) {
        this.add
          .image((x + offsetX) * TILE + TILE / 2, (y + offsetY) * TILE + TILE / 2, texture)
          .setDepth(depth)
          .setAlpha(alpha);
      }
    }
  }

  private createBridge() {
    const graphics = this.add.graphics().setDepth(5);
    graphics.fillStyle(0x3d2d24, 1);
    graphics.fillRect(30 * TILE, 24 * TILE, 2 * TILE, 4 * TILE);
    for (let y = 24 * TILE + 3; y < 28 * TILE; y += 10) {
      graphics.fillStyle(0x8d5a38, 1);
      graphics.fillRect(30 * TILE + 3, y, 2 * TILE - 6, 7);
      graphics.fillStyle(0xc08750, 0.65);
      graphics.fillRect(30 * TILE + 5, y + 1, 2 * TILE - 10, 1);
    }
  }

  private createBuildings() {
    for (const landmark of STARTER_LANDMARKS) {
      if (!["headquarters", "inn", "forge"].includes(landmark.kind)) continue;
      const baseDepth = (landmark.position.y + landmark.height) * TILE;
      const tint = landmark.kind === "headquarters" ? 0xffffff : landmark.kind === "inn" ? 0xcda884 : 0xb48d7c;

      for (let y = 0; y < landmark.height; y += 1) {
        for (let x = 0; x < landmark.width; x += 1) {
          const texture = y < Math.ceil(landmark.height * 0.55)
            ? VISUAL_KEYS.props.hqRoof
            : VISUAL_KEYS.props.hqWall;
          this.add
            .image(
              (landmark.position.x + x) * TILE + TILE / 2,
              (landmark.position.y + y) * TILE + TILE / 2,
              texture,
            )
            .setTint(tint)
            .setDepth(baseDepth);
        }
      }

      const doorX = landmark.position.x + Math.floor(landmark.width / 2);
      const doorY = landmark.position.y + landmark.height - 1;
      this.add
        .image(doorX * TILE + TILE / 2, doorY * TILE + TILE / 2, VISUAL_KEYS.props.hqDoor)
        .setDepth(baseDepth + 1);
      for (const windowOffset of [-2, 2]) {
        const windowX = Phaser.Math.Clamp(doorX + windowOffset, landmark.position.x, landmark.position.x + landmark.width - 1);
        this.add
          .image(windowX * TILE + TILE / 2, doorY * TILE + TILE / 2, VISUAL_KEYS.props.hqWindow)
          .setDepth(baseDepth + 1);
      }

      this.worldLabel(
        (landmark.position.x + landmark.width / 2) * TILE,
        landmark.position.y * TILE - 4,
        landmark.name,
        baseDepth + 3,
      );
    }

    const fountain = STARTER_LANDMARKS.find((landmark) => landmark.kind === "fountain");
    if (fountain) {
      const cx = (fountain.position.x + fountain.width / 2) * TILE;
      const cy = (fountain.position.y + fountain.height / 2) * TILE;
      const graphics = this.add.graphics().setDepth(cy + 20);
      graphics.fillStyle(0x1c2229, 0.5).fillEllipse(cx, cy + 16, 88, 30);
      graphics.fillStyle(0x6f7880, 1).fillEllipse(cx, cy + 7, 82, 42);
      graphics.fillStyle(0x2a7896, 1).fillEllipse(cx, cy + 4, 68, 30);
      graphics.fillStyle(0x9aa5aa, 1).fillRect(cx - 7, cy - 22, 14, 31);
      graphics.fillStyle(0x68c6df, 0.85).fillRect(cx - 2, cy - 30, 4, 25);
      this.worldLabel(cx, cy - 42, fountain.name, cy + 21);
    }
  }

  private createProps() {
    const trees: GridPosition[] = [
      { x: 2, y: 3 }, { x: 3, y: 14 }, { x: 26, y: 4 }, { x: 27, y: 14 },
      { x: 2, y: 34 }, { x: 8, y: 41 }, { x: 25, y: 39 }, { x: 34, y: 5 },
      { x: 36, y: 17 }, { x: 42, y: 12 }, { x: 44, y: 42 }, { x: 51, y: 45 },
      { x: 61, y: 5 }, { x: 61, y: 25 }, { x: 61, y: 43 }, { x: 34, y: 43 },
    ];
    for (const [index, position] of trees.entries()) {
      const point = tileCenter(position);
      this.add
        .image(point.x, point.y, index % 3 === 0 ? VISUAL_KEYS.props.pine : VISUAL_KEYS.props.tree)
        .setOrigin(0.5, 1)
        .setDepth(point.y);
    }

    const rocks: GridPosition[] = [
      { x: 39, y: 7 }, { x: 41, y: 8 }, { x: 46, y: 16 }, { x: 57, y: 31 },
      { x: 38, y: 40 }, { x: 43, y: 28 }, { x: 49, y: 37 }, { x: 59, y: 18 },
    ];
    for (const position of rocks) {
      const point = tileCenter(position);
      this.add.image(point.x, point.y, VISUAL_KEYS.props.rock).setOrigin(0.5, 1).setDepth(point.y);
    }

    for (const position of [
      { x: 4, y: 17 }, { x: 10, y: 17 }, { x: 23, y: 14 }, { x: 27, y: 32 },
      { x: 37, y: 23 }, { x: 48, y: 24 }, { x: 58, y: 28 }, { x: 45, y: 36 },
    ]) {
      const point = tileCenter(position);
      this.add.image(point.x, point.y, VISUAL_KEYS.props.bush).setOrigin(0.5, 1).setDepth(point.y);
    }

    for (const position of [{ x: 14, y: 24 }, { x: 19, y: 30 }, { x: 28, y: 24 }]) {
      const point = tileCenter(position);
      this.add.image(point.x, point.y, VISUAL_KEYS.props.lantern).setOrigin(0.5, 1).setDepth(point.y);
    }

    const sign = tileCenter({ x: 29, y: 23 });
    this.add.image(sign.x, sign.y, VISUAL_KEYS.props.sign).setOrigin(0.5, 1).setDepth(sign.y);
  }

  private createPortal() {
    const portal = STARTER_LANDMARKS.find((landmark) => landmark.kind === "portal");
    if (!portal) return;
    const x = (portal.position.x + portal.width / 2) * TILE;
    const y = (portal.position.y + portal.height) * TILE;
    this.add
      .sprite(x, y, portalTextureKey(0))
      .setOrigin(0.5, 1)
      .setDepth(y)
      .play(VISUAL_ANIMATIONS.portal);
    this.worldLabel(x, portal.position.y * TILE - 12, "Faille instable · Rang E", y + 2, "#d7a7ff");
  }

  private createNpc() {
    const point = tileCenter({ x: 15, y: 13 });
    const sprite = this.add
      .sprite(point.x, point.y, adventurerTextureKey("down", "idle", 0))
      .setOrigin(0.5, 1)
      .setTint(0xf0c56b)
      .setDepth(point.y)
      .play(VISUAL_ANIMATIONS.adventurer("down", "idle"));
    sprite.setScale(0.92);
    this.worldLabel(point.x, point.y - 68, "Maître du QG", point.y + 1, "#f3cf78");
  }

  private worldLabel(x: number, y: number, text: string, depth: number, color = "#eadfbf") {
    return this.add
      .text(x, y, text, {
        fontFamily: "Georgia, serif",
        fontSize: "10px",
        color,
        backgroundColor: "#10151bcc",
        padding: { x: 5, y: 2 },
        stroke: "#080a0d",
        strokeThickness: 1,
      })
      .setOrigin(0.5, 1)
      .setDepth(depth);
  }

  private createScreenText() {
    this.zoneTitle = this.add
      .text(0, 0, "VAL D’AUBE", {
        fontFamily: "Georgia, serif",
        fontSize: "15px",
        color: "#ead49a",
        letterSpacing: 3,
        backgroundColor: "#0b0f14b8",
        padding: { x: 13, y: 6 },
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(20_000);

    this.introText = this.add
      .text(0, 0, "Zone ouverte · monstres passifs, défensifs et agressifs", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "9px",
        color: "#b9b4a6",
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(20_000);

    this.toast = this.add
      .text(0, 0, "", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "11px",
        color: "#f4ead4",
        backgroundColor: "#10151be8",
        padding: { x: 10, y: 5 },
        align: "center",
        wordWrap: { width: 460 },
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(20_001)
      .setAlpha(0);
    this.positionScreenText();
  }

  private configureCamera() {
    const camera = this.cameras.main;
    camera.setBounds(0, 0, this.map.width * TILE, this.map.height * TILE);
    camera.setBackgroundColor(0x10151b);
    camera.roundPixels = true;
    this.updateZoom();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this);
  }

  private handleResize(gameSize: Phaser.Structs.Size) {
    this.cameras.main.setSize(gameSize.width, gameSize.height);
    this.updateZoom();
    this.positionScreenText();
  }

  private updateZoom() {
    const { width, height } = this.scale.gameSize;
    const portrait = height > width;
    const baseZoom = portrait ? 1.02 : width < 700 ? 1.08 : 1.2;
    this.cameras.main.setZoom(baseZoom * 0.9);
  }

  private positionScreenText() {
    const { width, height } = this.scale.gameSize;
    this.zoneTitle?.setPosition(width / 2, 10);
    this.introText?.setPosition(width / 2, 43);
    this.toast?.setPosition(width / 2, Math.max(76, height - 92));
  }

  private configureInput() {
    this.input.addPointer(1);
    this.input.on(
      Phaser.Input.Events.POINTER_UP,
      (pointer: Phaser.Input.Pointer, gameObjects: Phaser.GameObjects.GameObject[]) => {
        if (gameObjects.length > 0 || !this.socket) return;
        const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
        const destination = { x: Math.floor(world.x / TILE), y: Math.floor(world.y / TILE) };
        if (
          destination.x < 0 || destination.y < 0 ||
          destination.x >= this.map.width || destination.y >= this.map.height ||
          this.map.blocked.includes(positionKey(destination))
        ) {
          this.showToast("Cette case est inaccessible", 0xf0a46d);
          return;
        }
        this.selectedTargetId = null;
        this.refreshSelections();
        this.socket.move(destination.x, destination.y);
        const point = tileCenter(destination);
        this.destinationMarker?.setPosition(point.x, point.y - 5).setVisible(true).setAlpha(1);
        if (this.destinationMarker) {
          this.tweens.killTweensOf(this.destinationMarker);
          this.tweens.add({
            targets: this.destinationMarker,
            alpha: 0,
            duration: 720,
            ease: "Sine.Out",
            onComplete: () => this.destinationMarker?.setVisible(false),
          });
        }
      },
    );
  }

  private applySnapshot(snapshot: RealmSnapshot, immediate = false) {
    const zoneChanged = this.switchZone(snapshot);
    immediate = immediate || zoneChanged;
    this.latestPlayers = new Map(snapshot.players.map((player) => [player.id, player]));
    this.latestMonsters = new Map(snapshot.monsters.map((monster) => [monster.id, monster]));
    this.updateRiftViews(snapshot.rifts);

    for (const player of snapshot.players) this.updatePlayerView(player, immediate);
    for (const monster of snapshot.monsters) this.updateMonsterView(monster, immediate);

    for (const [id, view] of this.playerViews) {
      if (!this.latestPlayers.has(id)) {
        view.container.destroy(true);
        this.playerViews.delete(id);
      }
    }
    for (const [id, view] of this.monsterViews) {
      if (!this.latestMonsters.has(id)) {
        view.container.destroy(true);
        this.monsterViews.delete(id);
      }
    }

    const localPlayer = this.localPlayerId ? this.latestPlayers.get(this.localPlayerId) : undefined;
    if (localPlayer) {
      this.latestLocalPlayer = localPlayer;
      if (snapshot.zoneKind === "world") {
        this.lastWorldPosition = { ...localPlayer.position };
        const now = Date.now();
        if (now - this.lastSaveAt >= 1_000) {
          savePlayerSnapshot(localPlayer, now);
          this.lastSaveAt = now;
        }
      }
      this.publishInventory(localPlayer);
      this.publishPlayerHud(localPlayer);
      const rifts: HudRift[] = snapshot.rifts.map((rift) => ({
        id: rift.id,
        rank: rift.rank,
        x: rift.position.x,
        y: rift.position.y,
        spawnedAt: rift.spawnedAt,
        expiresAt: rift.expiresAt,
        status: rift.status,
        outsideBossAlive: rift.outsideBossAlive,
      }));
      this.callbacks.onHud({
        rifts,
        playerMapPosition: this.lastWorldPosition,
        mapSize: { width: STARTER_MAP.width, height: STARTER_MAP.height },
      });
    }
  }

  private switchZone(snapshot: RealmSnapshot): boolean {
    const changed = snapshot.zoneId !== this.currentZoneId || snapshot.zoneKind !== this.zoneKind;
    this.map = snapshot.map;
    if (!changed) {
      if (snapshot.riftRun) {
        this.zoneTitle?.setText(`FAILLE E · SALLE ${snapshot.riftRun.room}/3`);
        this.introText?.setText(
          snapshot.riftRun.roomCleared
            ? "Salle nettoyée · avancez vers la salle suivante"
            : snapshot.riftRun.room === 3
              ? "Éliminez le Gardien pour refermer le portail"
              : "Éliminez tous les monstres pour briser le sceau",
        );
      }
      return false;
    }

    this.currentZoneId = snapshot.zoneId;
    this.zoneKind = snapshot.zoneKind;
    this.worldLayer?.setVisible(snapshot.zoneKind === "world");
    this.riftLayer?.setVisible(snapshot.zoneKind === "rift");
    this.cameras.main.setBounds(0, 0, this.map.width * TILE, this.map.height * TILE);
    this.destinationMarker?.setVisible(false);
    this.selectedTargetId = null;
    this.followedPlayerId = null;
    for (const view of this.playerViews.values()) view.container.destroy(true);
    for (const view of this.monsterViews.values()) view.container.destroy(true);
    this.playerViews.clear();
    this.monsterViews.clear();
    this.latestPlayers.clear();
    this.latestMonsters.clear();

    if (snapshot.zoneKind === "world") {
      this.zoneTitle?.setText("VAL D’AUBE");
      this.introText?.setText("Zone ouverte · surveillez les nouvelles failles sur la carte");
    } else if (snapshot.riftRun) {
      this.zoneTitle?.setText(`FAILLE E · SALLE ${snapshot.riftRun.room}/3`);
      this.introText?.setText("Éliminez tous les monstres pour briser le sceau");
      this.showToast("Vous franchissez la faille dimensionnelle", 0xc59aff);
    }
    return true;
  }

  private updateRiftViews(rifts: RiftSnapshot[]): void {
    this.latestRifts = new Map(rifts.map((rift) => [rift.id, rift]));
    if (this.zoneKind !== "world") {
      for (const view of this.riftViews.values()) view.container.setVisible(false);
      return;
    }

    const activeIds = new Set(rifts.map((rift) => rift.id));
    for (const rift of rifts) {
      let view = this.riftViews.get(rift.id);
      if (!view) {
        view = this.createRiftView(rift);
        this.riftViews.set(rift.id, view);
      }
      const point = tileCenter(rift.position);
      const escaped = rift.status === "boss-escaped";
      view.container.setPosition(point.x, point.y).setDepth(point.y).setVisible(true);
      view.sprite.setTint(escaped ? 0xff6f77 : 0xffffff);
      view.label
        .setText(
          escaped
            ? rift.outsideBossAlive
              ? "Faille E · GARDIEN ÉCHAPPÉ"
              : "Faille E · brèche exposée"
            : "Faille dimensionnelle · Rang E",
        )
        .setColor(escaped ? "#ff9a9f" : "#d7a7ff");
    }
    for (const [id, view] of this.riftViews) {
      if (!activeIds.has(id)) {
        view.container.destroy(true);
        this.riftViews.delete(id);
      }
    }
  }

  private createRiftView(rift: RiftSnapshot): RiftView {
    const sprite = this.add
      .sprite(0, 0, portalTextureKey(0))
      .setOrigin(0.5, 1)
      .play(VISUAL_ANIMATIONS.portal);
    const label = this.add
      .text(0, -92, "Faille dimensionnelle · Rang E", {
        fontFamily: "Georgia, serif",
        fontSize: "10px",
        color: "#d7a7ff",
        backgroundColor: "#10151bdd",
        padding: { x: 5, y: 2 },
        align: "center",
      })
      .setOrigin(0.5, 1);
    const interaction = this.add
      .zone(0, -42, 86, 96)
      .setInteractive({ useHandCursor: true });
    const container = this.add.container(0, 0, [sprite, interaction, label]);
    interaction.on(
      Phaser.Input.Events.POINTER_UP,
      (
        _pointer: Phaser.Input.Pointer,
        _x: number,
        _y: number,
        event: Phaser.Types.Input.EventData,
      ) => {
        event.stopPropagation();
        const current = this.latestRifts.get(rift.id) ?? rift;
        this.socket?.enterRift(current.id);
        this.showToast(
          current.status === "boss-escaped" && current.outsideBossAlive
            ? "Le Gardien extérieur doit être vaincu avant l’entrée"
            : "Approche du portail en cours…",
          current.status === "boss-escaped" && current.outsideBossAlive ? 0xf08b8b : 0xc59aff,
        );
      },
    );
    return { container, label, sprite };
  }

  private updatePlayerView(player: PlayerSnapshot, immediate: boolean) {
    let view = this.playerViews.get(player.id);
    if (!view) {
      view = this.createPlayerView(player);
      this.playerViews.set(player.id, view);
      immediate = true;
    }
    const point = tileCenter(player.position);
    const positionChanged = this.moveView(view, point, immediate, 220);
    const identity = player.rank
      ? `${player.name} · rang ${player.rank === "OMEGA" ? "Ω" : player.rank}`
      : `${player.name} · Aventurier`;
    view.label.setText(player.id === this.localPlayerId ? player.name : identity);
    view.container.setVisible(player.alive).setAlpha(player.alive ? 1 : 0.3);
    this.drawHealth(view, player.hp, player.maxHp);

    if ((this.attackingUntil.get(player.id) ?? 0) <= this.time.now) {
      const visuallyMoving =
        player.moving || positionChanged || this.tweens.isTweening(view.container);
      view.sprite.play(
        VISUAL_ANIMATIONS.adventurer(
          visualDirection(player.direction),
          visuallyMoving ? "walk" : "idle",
        ),
        true,
      );
    }
    view.selection.setVisible(this.selectedTargetId === player.id);

    if (player.id === this.localPlayerId && this.followedPlayerId !== player.id) {
      this.cameras.main.startFollow(view.container, true, 1, 1);
      this.cameras.main.centerOn(point.x, point.y);
      this.followedPlayerId = player.id;
    }
  }

  private updateMonsterView(monster: MonsterSnapshot, immediate: boolean) {
    let view = this.monsterViews.get(monster.id);
    if (!view) {
      view = this.createMonsterView(monster);
      this.monsterViews.set(monster.id, view);
      immediate = true;
    }
    const point = tileCenter(monster.position);
    const movementDuration = Math.ceil(monster.moveIntervalMs / 100) * 100;
    this.moveView(view, point, immediate, movementDuration);
    const behaviour = MONSTER_BEHAVIOUR_COPY[monster.behaviour];
    view.label
      .setText(`${monster.name} · niv. ${monster.level}\n● ${behaviour.label}`)
      .setColor(monster.isBoss ? "#dba0ff" : behaviour.color);
    view.container.setVisible(monster.alive).setAlpha(monster.alive ? 1 : 0);
    view.sprite.setFlipX(monster.direction === "west");
    if ((this.attackingUntil.get(monster.id) ?? 0) <= this.time.now) {
      view.sprite.play(VISUAL_ANIMATIONS.creature(creatureKind(monster.species, monster.isBoss)), true);
    }
    this.drawHealth(view, monster.hp, monster.maxHp);
    view.selection.setVisible(monster.alive && this.selectedTargetId === monster.id);

    if (!monster.alive && this.selectedTargetId === monster.id) {
      this.selectedTargetId = null;
    }
  }

  private createPlayerView(player: PlayerSnapshot): EntityView {
    const point = tileCenter(player.position);
    const selection = this.add.sprite(0, -3, VISUAL_KEYS.effects.selection).setVisible(false);
    const sprite = this.add
      .sprite(0, 0, adventurerTextureKey(visualDirection(player.direction), "idle", 0))
      .setOrigin(0.5, 1);
    if (player.id !== this.localPlayerId) sprite.setTint(0xc7d6e5);
    const label = this.add
      .text(0, -68, player.name, {
        fontFamily: "system-ui, sans-serif",
        fontSize: "9px",
        color: player.id === this.localPlayerId ? "#f3d47f" : "#d8e6ef",
        backgroundColor: "#0a0e13b8",
        padding: { x: 3, y: 1 },
      })
      .setOrigin(0.5, 1);
    const health = this.add.graphics();
    const container = this.add.container(point.x, point.y, [selection, sprite, health, label]).setDepth(point.y);
    return {
      container,
      sprite,
      selection,
      label,
      health,
      lastTile: null,
      maxHp: player.maxHp,
      isBoss: false,
      healthY: -56,
    };
  }

  private createMonsterView(monster: MonsterSnapshot): EntityView {
    const point = tileCenter(monster.position);
    const kind = creatureKind(monster.species, monster.isBoss);
    const behaviour = MONSTER_BEHAVIOUR_COPY[monster.behaviour];
    const selection = this.add
      .sprite(0, -3, VISUAL_KEYS.effects.selection)
      .setScale(monster.isBoss ? 1.65 : 1)
      .setVisible(false);
    const sprite = this.add
      .sprite(0, 0, creatureTextureKey(kind, 0))
      .setOrigin(0.5, 1);
    const targetZone = this.add
      .zone(
        0,
        monster.isBoss ? -48 : kind === "slime" ? -18 : -27,
        monster.isBoss ? 86 : 52,
        monster.isBoss ? 104 : 58,
      )
      .setInteractive({ useHandCursor: true });
    const nameY = monster.isBoss ? -101 : kind === "slime" ? -38 : -54;
    const label = this.add
      .text(0, nameY, `${monster.name} · niv. ${monster.level}\n● ${behaviour.label}`, {
        fontFamily: "system-ui, sans-serif",
        fontSize: monster.isBoss ? "10px" : "8px",
        color: monster.isBoss ? "#dba0ff" : behaviour.color,
        backgroundColor: "#090c11c4",
        padding: { x: 3, y: 1 },
        align: "center",
      })
      .setOrigin(0.5, 1);
    const health = this.add.graphics();
    const container = this.add
      .container(point.x, point.y, [selection, targetZone, sprite, health, label])
      .setDepth(point.y);

    targetZone.on(
      Phaser.Input.Events.POINTER_UP,
      (
        _pointer: Phaser.Input.Pointer,
        _x: number,
        _y: number,
        event: Phaser.Types.Input.EventData,
      ) => {
        event.stopPropagation();
        this.selectedTargetId = monster.id;
        this.refreshSelections();
        this.socket?.target(monster.id);
        this.showToast(`${monster.name} ciblé · ${behaviour.hint}`);
      },
    );

    return {
      container,
      sprite,
      selection,
      label,
      health,
      lastTile: null,
      maxHp: monster.maxHp,
      isBoss: monster.isBoss,
      healthY: monster.isBoss ? -91 : kind === "slime" ? -29 : -44,
    };
  }

  private moveView(
    view: EntityView,
    point: { x: number; y: number },
    immediate: boolean,
    durationMs: number,
  ) {
    const newTile = { x: Math.floor(point.x / TILE), y: Math.floor((point.y - 1) / TILE) };
    const changedTile =
      !view.lastTile || view.lastTile.x !== newTile.x || view.lastTile.y !== newTile.y;
    if (immediate || !view.lastTile) {
      this.tweens.killTweensOf(view.container);
      view.container.setPosition(point.x, point.y);
    } else if (changedTile) {
      this.tweens.killTweensOf(view.container);
      this.tweens.add({
        targets: view.container,
        x: point.x,
        y: point.y,
        duration: Phaser.Math.Clamp(durationMs, 150, 800),
        ease: "Linear",
        onUpdate: () => view.container.setDepth(view.container.y),
      });
    }
    if (immediate) view.container.setDepth(point.y);
    view.lastTile = newTile;
    return changedTile && !immediate;
  }

  private drawHealth(view: EntityView, hp: number, maxHp: number) {
    const width = view.isBoss ? 66 : 36;
    const y = view.healthY;
    const ratio = Phaser.Math.Clamp(maxHp > 0 ? hp / maxHp : 0, 0, 1);
    view.health.clear();
    view.health.fillStyle(0x080a0d, 0.9).fillRect(-width / 2 - 1, y - 1, width + 2, 5);
    view.health.fillStyle(ratio > 0.45 ? 0xd95656 : 0xe28b42, 1).fillRect(-width / 2, y, width * ratio, 3);
  }

  private refreshSelections() {
    for (const [id, view] of this.monsterViews) view.selection.setVisible(id === this.selectedTargetId);
    for (const [id, view] of this.playerViews) view.selection.setVisible(id === this.selectedTargetId);
  }

  private applyEvent(event: GameEvent) {
    if (event.type === "damage") {
      this.animateAttack(event.sourceId, event.targetId, event.amount);
      return;
    }
    if (event.type === "death") {
      const monster = this.latestMonsters.get(event.entityId);
      if (monster) this.showToast(`${monster.name} vaincu !`, 0xf1ca70);
      if (event.entityId === this.localPlayerId) {
        this.callbacks.onHud({ alive: false });
        this.showToast("Vous êtes tombé au combat", 0xf08b8b);
      }
      return;
    }
    if (event.type === "xp" && event.playerId === this.localPlayerId) {
      const text = event.general > 0
        ? `+${event.general} XP générale`
        : `+${event.masteryXp} XP ${event.mastery ?? "statistique"}`;
      this.showToast(text, 0x8ee6ff);
      return;
    }
    if (event.type === "level-up" && event.playerId === this.localPlayerId) {
      this.showToast(`Niveau ${event.level} atteint ! Toutes les statistiques de base augmentent.`, 0xf3cf78);
      return;
    }
    if (event.type === "loot" && event.playerId === this.localPlayerId) {
      this.addLoot(event.itemId, event.quantity);
      return;
    }
    if (event.type === "item-used" && event.playerId === this.localPlayerId) {
      const definition = isKnownItem(event.itemId) ? ITEM_CATALOG[event.itemId] : null;
      this.showToast(
        `${definition?.name ?? "Objet"} utilisé · +${event.effectAmount} PV`,
        0x65ddbd,
      );
      return;
    }
    if (event.type === "respawn" && event.entityId === this.localPlayerId) {
      this.callbacks.onHud({ alive: true });
      this.showToast("Vous reprenez connaissance au Val d’Aube", 0x8ee6ff);
      return;
    }
    if (event.type === "rift-room-cleared" && event.playerId === this.localPlayerId) {
      this.showToast(
        event.nextRoom
          ? `Salle ${event.room} nettoyée · le sceau vers la salle ${event.nextRoom} est brisé`
          : `Salle ${event.room} nettoyée`,
        0xcda5ff,
      );
      return;
    }
    if (event.type === "rift-boss-escaped") {
      this.showToast("Alerte régionale · un Gardien vient de sortir d’une faille !", 0xff7f84);
      return;
    }
    if (event.type === "rift-outside-boss-defeated") {
      this.showToast("Gardien extérieur vaincu · la faille peut maintenant être refermée", 0xf1ca70);
      return;
    }
    if (event.type === "rift-complete" && event.playerId === this.localPlayerId) {
      const completion: HudRiftCompletion = {
        riftId: event.riftId,
        rank: event.rank,
        elapsedMs: event.elapsedMs,
        generalXp: event.generalXp,
        items: event.items.map(({ itemId, quantity }) => {
          const definition = isKnownItem(itemId) ? ITEM_CATALOG[itemId] : null;
          return {
            id: itemId,
            name: definition?.name ?? "Récompense inconnue",
            icon: definition?.icon ?? "◆",
            quantity,
            rarity: definition?.rarity ?? "common",
          };
        }),
      };
      this.callbacks.onHud({ riftCompletion: completion });
      this.showToast("Faille fermée · récompenses sécurisées", 0xf1ca70);
    }
  }

  private animateAttack(sourceId: string, targetId: string, amount: number) {
    const source = this.playerViews.get(sourceId) ?? this.monsterViews.get(sourceId);
    const target = this.playerViews.get(targetId) ?? this.monsterViews.get(targetId);
    if (!target) return;

    this.attackingUntil.set(sourceId, this.time.now + 280);
    if (source && this.playerViews.has(sourceId)) {
      const player = this.latestPlayers.get(sourceId);
      if (player) {
        source.sprite.play(VISUAL_ANIMATIONS.adventurer(visualDirection(player.direction), "attack"), true);
      }
    } else if (source) {
      this.tweens.add({ targets: source.sprite, scaleX: 1.12, scaleY: 0.92, yoyo: true, duration: 105 });
    }

    const hit = this.add.sprite(target.container.x, target.container.y - 28, VISUAL_KEYS.effects.hit).setDepth(15_000);
    hit.setScale(target.isBoss ? 1.35 : 1);
    this.tweens.add({
      targets: hit,
      alpha: 0,
      scale: hit.scale + 0.45,
      duration: 260,
      onComplete: () => hit.destroy(),
    });

    const damage = this.add
      .text(target.container.x, target.container.y - (target.isBoss ? 102 : 58), `-${amount}`, {
        fontFamily: "system-ui, sans-serif",
        fontSize: target.isBoss ? "16px" : "12px",
        fontStyle: "bold",
        color: "#ff8a80",
        stroke: "#160b0b",
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(15_001);
    this.tweens.add({
      targets: damage,
      y: damage.y - 24,
      alpha: 0,
      duration: 680,
      ease: "Cubic.Out",
      onComplete: () => damage.destroy(),
    });
  }

  private publishPlayerHud(player: PlayerSnapshot) {
    const stats: HudStatBreakdown[] = [
      this.statLine("melee", "Corps-à-corps", "†", player.level, player.masteries.melee),
      this.statLine("ranged", "Distance", "➶", player.level, player.masteries.ranged),
      this.statLine("magic", "Magie", "✦", player.level, player.masteries.magic),
      this.statLine("defense", "Défense", "♜", player.level, player.masteries.defense),
      {
        id: "energy",
        label: "Énergie",
        icon: "◆",
        description: "Renforce les réserves de vie et de mana.",
        base: player.level,
        training: 0,
        equipment: this.equipmentBonus("energy"),
        total: player.level + this.equipmentBonus("energy"),
      },
      {
        id: "speed",
        label: "Vitesse",
        icon: "➟",
        description: "Base 100, puis +1 tous les 10 niveaux (maximum 300).",
        base: 100,
        training: Math.max(0, player.speed - 100),
        equipment: 0,
        total: player.speed,
      },
    ];
    this.callbacks.onHud({
      hp: player.hp,
      maxHp: player.maxHp,
      mp: player.mp,
      maxMp: player.maxMp,
      xp: player.xp,
      maxXp: player.xpToNext,
      level: player.level,
      rank: player.rank === "OMEGA" ? "Ω" : player.rank,
      power: player.power,
      gold: player.gold,
      playerName: `${player.name} · ${player.className}`,
      alive: player.alive,
      stats,
    });
  }

  private statLine(
    id: string,
    label: string,
    icon: string,
    base: number,
    mastery: { level: number; xp: number; xpToNext: number },
  ): HudStatBreakdown {
    const equipment = this.equipmentBonus(id as keyof ItemBonuses);
    const descriptions: Readonly<Record<string, string>> = {
      melee: "Augmente les dégâts des attaques au corps à corps.",
      ranged: "Augmente les dégâts des attaques à distance.",
      magic: "Augmente la puissance des sorts magiques.",
      defense: "Réduit les dégâts reçus au combat.",
    };
    return {
      id,
      label,
      icon,
      description: descriptions[id],
      base,
      training: mastery.level,
      equipment,
      total: base + mastery.level + equipment,
      xp: mastery.xp,
      xpToNext: mastery.xpToNext,
    };
  }

  private equipmentBonus(stat: keyof ItemBonuses) {
    let total = 0;
    for (const itemId of Object.values(this.equipment)) {
      if (!itemId || !isKnownItem(itemId)) continue;
      const definition: ItemDefinition = ITEM_CATALOG[itemId];
      total += definition.bonuses?.[stat] ?? 0;
    }
    return total;
  }

  private addLoot(itemId: string, quantity: number) {
    const definition: ItemDefinition = isKnownItem(itemId) ? ITEM_CATALOG[itemId] : {
      id: itemId,
      name: "Butin mystérieux",
      icon: "◆",
      description: "Un objet trouvé sur un monstre.",
      kind: "material",
      category: "resource",
      rarity: "common",
    };
    const reward: HudReward = {
      id: `${itemId}-${this.time.now}-${this.rewardSequence++}`,
      name: definition.name,
      icon: definition.icon ?? "◆",
      quantity,
      rarity: definition.rarity,
    };
    this.rewards = [...this.rewards, reward].slice(-2);
    this.callbacks.onHud({ rewards: [...this.rewards] });
    this.time.delayedCall(5_000, () => {
      this.rewards = this.rewards.filter((entry) => entry.id !== reward.id);
      this.callbacks.onHud({ rewards: [...this.rewards] });
    });
    this.showToast(`${definition.name} ×${quantity} obtenu`, 0xcfa2ff);
  }

  private inventoryItem(
    definition: ItemDefinition,
    quantity: number,
    equipped: boolean,
    player: PlayerSnapshot,
  ): HudInventoryItem {
    const stats = Object.entries(definition.bonuses ?? {}).map(([key, value]) => ({
      label: BONUS_LABELS[key as keyof ItemBonuses],
      value: `+${value}`,
    }));
    return {
      id: definition.id,
      name: definition.name,
      icon: definition.icon,
      quantity,
      rarity: definition.rarity,
      description: definition.description,
      requiredRank: definition.requiredRank,
      equipped,
      equippable: definition.kind === "equipment",
      canEquip:
        definition.kind === "equipment" &&
        meetsItemRank(player.rank, definition.requiredRank),
      category: definition.category,
      stats,
    };
  }

  private publishInventory(player: PlayerSnapshot) {
    this.equipment = player.equipment;
    const signature = JSON.stringify([player.inventory, player.equipment, player.rank]);
    if (signature === this.inventorySignature) return;
    this.inventorySignature = signature;

    const equippedIds = new Set(Object.values(player.equipment).filter(Boolean));
    const inventory = player.inventory.flatMap(({ itemId, quantity }) => {
      if (!isKnownItem(itemId) || quantity <= 0) return [];
      const definition: ItemDefinition = ITEM_CATALOG[itemId];
      return [this.inventoryItem(definition, quantity, equippedIds.has(itemId), player)];
    });
    const equipment: HudEquipmentSlot[] = EQUIPMENT_SLOTS.map((slot) => {
      const itemId = player.equipment[slot];
      const definition: ItemDefinition | null =
        itemId && isKnownItem(itemId) ? ITEM_CATALOG[itemId] : null;
      return {
        id: slot,
        label: EQUIPMENT_LABELS[slot],
        icon: EQUIPMENT_ICONS[slot],
        item: definition ? this.inventoryItem(definition, 1, true, player) : null,
      };
    });
    this.callbacks.onHud({ inventory, equipment });
  }

  private showToast(message: string, color = 0xf4ead4) {
    if (!this.toast?.active) return;
    this.toastTween?.stop();
    this.toast.setText(message).setColor(`#${color.toString(16).padStart(6, "0")}`).setAlpha(1).setScale(0.98);
    this.toastTween = this.tweens.add({
      targets: this.toast,
      alpha: 0,
      scale: 1,
      delay: 1_850,
      duration: 420,
      ease: "Sine.In",
    });
  }

  private getPlayerName() {
    try {
      const existing = window.localStorage.getItem(PLAYER_NAME_KEY);
      if (existing) return existing;
    } catch {
      // A generated in-memory name is sufficient when storage is unavailable.
    }
    const name = `Aventurier-${Phaser.Math.Between(100, 999)}`;
    try {
      window.localStorage.setItem(PLAYER_NAME_KEY, name);
    } catch {
      // Use the generated name for this session.
    }
    return name;
  }

  private shutdownWorld() {
    this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    window.removeEventListener("ui:equip", this.equipListener);
    window.removeEventListener("ui:unequip", this.unequipListener);
    window.removeEventListener("ui:use-item", this.useItemListener);
    window.removeEventListener("ui:respawn", this.respawnListener);
    window.removeEventListener("ui:connection-mode", this.connectionModeListener);
    window.removeEventListener("pagehide", this.pageHideListener);
    this.pageHideListener();
    this.socket?.close();
    this.socket = null;
  }
}
