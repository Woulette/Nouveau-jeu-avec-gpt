"use client";

import { useEffect, useRef, useState } from "react";

import { prepareOfflineCache } from "@/game/client/offlineCache";

import Hud, {
  type HudConnectionStatus,
  type HudConnectionMode,
  type HudEquipmentSlot,
  type HudInventoryItem,
  type HudMapPosition,
  type HudMapSize,
  type HudReward,
  type HudRift,
  type HudRiftCompletion,
  type HudStatBreakdown,
} from "./Hud";

interface GameHudState {
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  xp: number;
  maxXp: number;
  level: number;
  rank: string | null;
  power: number;
  gold: number;
  connectionStatus: HudConnectionStatus;
  playerName: string;
  inventory: HudInventoryItem[];
  equipment: HudEquipmentSlot[];
  stats: HudStatBreakdown[];
  rewards: HudReward[];
  alive: boolean;
  rifts: HudRift[];
  playerMapPosition: HudMapPosition;
  mapSize: HudMapSize;
  preferredConnectionMode: HudConnectionMode;
  riftCompletion: HudRiftCompletion | null;
}

export type GameHudUpdate = Partial<GameHudState>;

const initialInventory: HudInventoryItem[] = [
  {
    id: "starter-potion",
    name: "Petite potion",
    icon: "◉",
    quantity: 2,
    rarity: "common",
    description: "Une préparation simple qui restaure quelques points de vie.",
    equippable: false,
    category: "consumable",
  },
  {
    id: "coiffe-aventurier",
    name: "Coiffe d’aventurier",
    icon: "♕",
    quantity: 1,
    rarity: "common",
    description: "Une coiffe légère remise aux nouveaux aventuriers du Val d’Aube.",
    equippable: true,
    canEquip: true,
    category: "equipment",
    stats: [{ label: "Défense", value: "+1" }],
  },
  {
    id: "dague-emoussee",
    name: "Dague émoussée",
    icon: "†",
    quantity: 1,
    rarity: "common",
    description: "Une arme modeste, mais suffisante pour les premières chasses.",
    equippable: true,
    canEquip: true,
    category: "equipment",
    stats: [{ label: "Corps-à-corps", value: "+1" }],
  },
  {
    id: "tunique-aventurier",
    name: "Tunique d’aventurier",
    icon: "♜",
    quantity: 1,
    rarity: "common",
    description: "Une tunique renforcée distribuée aux nouveaux aventuriers.",
    equippable: true,
    canEquip: true,
    category: "equipment",
    stats: [{ label: "Défense", value: "+1" }],
  },
  {
    id: "pantalon-aventurier",
    name: "Pantalon d’aventurier",
    icon: "♙",
    quantity: 1,
    rarity: "common",
    description: "Un pantalon solide conçu pour les premiers voyages hors de la ville.",
    equippable: true,
    canEquip: true,
    category: "equipment",
    stats: [{ label: "Défense", value: "+1" }],
  },
  {
    id: "bottes-aventurier",
    name: "Bottes d’aventurier",
    icon: "⌁",
    quantity: 1,
    rarity: "common",
    description: "Des bottes souples qui facilitent les longues expéditions.",
    equippable: true,
    canEquip: true,
    category: "equipment",
    stats: [{ label: "Énergie", value: "+1" }],
  },
  {
    id: "anneau-cuivre",
    name: "Anneau de cuivre",
    icon: "○",
    quantity: 1,
    rarity: "common",
    description: "Un anneau sans rang qui renforce légèrement l’énergie de son porteur.",
    equippable: true,
    canEquip: true,
    category: "equipment",
    stats: [{ label: "Énergie", value: "+1" }],
  },
];

const initialEquipment: HudEquipmentSlot[] = [
  { id: "head", label: "Coiffe", icon: "♕", item: null },
  { id: "weapon", label: "Corps-à-corps", icon: "†", item: null },
  { id: "armor", label: "Armure", icon: "♜", item: null },
  { id: "legs", label: "Pantalon", icon: "♙", item: null },
  { id: "boots", label: "Bottes", icon: "⌁", item: null },
  { id: "ring", label: "Anneau", icon: "○", item: null },
];

const initialStats: HudStatBreakdown[] = [
  { id: "melee", label: "Corps-à-corps", icon: "⚔", description: "Augmente les dégâts des attaques au corps à corps.", base: 1, training: 0, equipment: 0, total: 1, xp: 0, xpToNext: 50 },
  { id: "ranged", label: "Distance", icon: "➶", description: "Augmente les dégâts des attaques à distance.", base: 1, training: 0, equipment: 0, total: 1, xp: 0, xpToNext: 50 },
  { id: "magic", label: "Magie", icon: "✦", description: "Augmente la puissance des sorts magiques.", base: 1, training: 0, equipment: 0, total: 1, xp: 0, xpToNext: 50 },
  { id: "defense", label: "Défense", icon: "🛡", description: "Réduit les dégâts reçus au combat.", base: 1, training: 0, equipment: 0, total: 1, xp: 0, xpToNext: 50 },
  { id: "energy", label: "Énergie", icon: "⚡", description: "Renforce les réserves de vie et de mana.", base: 1, training: 0, equipment: 0, total: 1 },
  { id: "speed", label: "Vitesse", icon: "➟", description: "Base 100, puis +1 tous les 10 niveaux (maximum 300).", base: 100, training: 0, equipment: 0, total: 100 },
];

export default function GameShell() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [hud, setHud] = useState<GameHudState>({
    hp: 112,
    maxHp: 112,
    mp: 35,
    maxMp: 35,
    xp: 0,
    maxXp: 80,
    level: 1,
    rank: null,
    power: 70,
    gold: 0,
    connectionStatus: "connecting" as HudConnectionStatus,
    playerName: "Aventurier",
    inventory: initialInventory,
    equipment: initialEquipment,
    stats: initialStats,
    rewards: [] as HudReward[],
    alive: true,
    rifts: [],
    playerMapPosition: { x: 17, y: 27 },
    mapSize: { width: 64, height: 48 },
    preferredConnectionMode: "online",
    riftCompletion: null,
  });

  useEffect(() => {
    let disposed = false;
    let destroyGame: (() => void) | undefined;

    async function start() {
      if (!containerRef.current) return;
      const { createMmoGame } = await import("@/game/client/createGame");
      if (disposed || !containerRef.current) return;
      destroyGame = createMmoGame(containerRef.current, {
        onReady: () => setReady(true),
        onHud: (update) => setHud((current) => ({ ...current, ...update })),
      });
      if (process.env.NODE_ENV === "production") void prepareOfflineCache();
    }

    void start();
    return () => {
      disposed = true;
      destroyGame?.();
    };
  }, []);

  function dispatchToGame(type: string, detail: unknown) {
    window.dispatchEvent(new CustomEvent(type, { detail }));
  }

  return (
    <main id="game-root">
      <div ref={containerRef} className="game-canvas" aria-label="Monde du jeu" />

      {!ready ? (
        <div className="loading-screen">
          <div className="loading-card">
            <h1>Nouveau MMO RPG</h1>
            <p>Ouverture de la première faille…</p>
          </div>
        </div>
      ) : null}

      <Hud
        {...hud}
        skillSlots={[]}
        inventoryCapacity={20}
        onEquip={(itemId) => dispatchToGame("ui:equip", { itemId })}
        onUnequip={(slotId) => dispatchToGame("ui:unequip", { slotId })}
        onUseItem={(itemId) => dispatchToGame("ui:use-item", { itemId })}
        onSkillActivate={(skillId) => dispatchToGame("ui:skill", { skillId })}
        onRespawn={() => dispatchToGame("ui:respawn", {})}
        onConnectionModeChange={(mode) => {
          setHud((current) => ({ ...current, preferredConnectionMode: mode }));
          dispatchToGame("ui:connection-mode", { mode });
        }}
        onDismissRiftCompletion={() => setHud((current) => ({ ...current, riftCompletion: null }))}
      />
    </main>
  );
}
