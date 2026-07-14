"use client";

import { useEffect, useRef, useState } from "react";

import Hud, {
  type HudConnectionStatus,
  type HudEquipmentSlot,
  type HudInventoryItem,
  type HudReward,
  type HudStatBreakdown,
} from "./Hud";

export interface GameHudUpdate {
  hp?: number;
  maxHp?: number;
  mp?: number;
  maxMp?: number;
  xp?: number;
  maxXp?: number;
  level?: number;
  rank?: string;
  power?: number;
  connectionStatus?: HudConnectionStatus;
  playerName?: string;
  inventory?: HudInventoryItem[];
  equipment?: HudEquipmentSlot[];
  stats?: HudStatBreakdown[];
  rewards?: HudReward[];
  alive?: boolean;
}

const initialInventory: HudInventoryItem[] = [
  {
    id: "starter-potion",
    name: "Petite potion",
    icon: "◉",
    quantity: 2,
    rarity: "common",
    description: "Une préparation simple qui restaure quelques points de vie.",
    equippable: false,
  },
  {
    id: "coiffe-aventurier",
    name: "Coiffe d’aventurier",
    icon: "♕",
    quantity: 1,
    rarity: "common",
    description: "Une coiffe légère remise aux nouveaux aventuriers du Val d’Aube.",
    requiredRank: "E",
    equippable: true,
    canEquip: true,
    stats: [{ label: "Défense", value: "+1" }],
  },
  {
    id: "dague-emoussee",
    name: "Dague émoussée",
    icon: "†",
    quantity: 1,
    rarity: "common",
    description: "Une arme modeste, mais suffisante pour les premières chasses.",
    requiredRank: "E",
    equippable: true,
    canEquip: true,
    stats: [{ label: "Corps-à-corps", value: "+1" }],
  },
  {
    id: "tunique-aventurier",
    name: "Tunique d’aventurier",
    icon: "♜",
    quantity: 1,
    rarity: "common",
    description: "Une tunique renforcée distribuée aux nouveaux aventuriers.",
    requiredRank: "E",
    equippable: true,
    canEquip: true,
    stats: [{ label: "Défense", value: "+1" }],
  },
  {
    id: "bottes-aventurier",
    name: "Bottes d’aventurier",
    icon: "⌁",
    quantity: 1,
    rarity: "common",
    description: "Des bottes souples qui facilitent les longues expéditions.",
    requiredRank: "E",
    equippable: true,
    canEquip: true,
    stats: [{ label: "Énergie", value: "+1" }],
  },
];

const initialEquipment: HudEquipmentSlot[] = [
  { id: "head", label: "Coiffe", icon: "♕", item: null },
  { id: "weapon", label: "Arme", icon: "†", item: null },
  { id: "armor", label: "Armure", icon: "♜", item: null },
  { id: "boots", label: "Bottes", icon: "⌁", item: null },
];

const initialStats: HudStatBreakdown[] = [
  { id: "melee", label: "Corps-à-corps", icon: "⚔", description: "Augmente les dégâts des attaques au corps à corps.", base: 1, training: 0, equipment: 0, total: 1, xp: 0, xpToNext: 50 },
  { id: "ranged", label: "Distance", icon: "➶", description: "Augmente les dégâts des attaques à distance.", base: 1, training: 0, equipment: 0, total: 1, xp: 0, xpToNext: 50 },
  { id: "magic", label: "Magie", icon: "✦", description: "Augmente la puissance des sorts magiques.", base: 1, training: 0, equipment: 0, total: 1, xp: 0, xpToNext: 50 },
  { id: "defense", label: "Défense", icon: "🛡", description: "Réduit les dégâts reçus au combat.", base: 1, training: 0, equipment: 0, total: 1, xp: 0, xpToNext: 50 },
  { id: "energy", label: "Énergie", icon: "⚡", description: "Renforce les réserves de vie et de mana.", base: 1, training: 0, equipment: 0, total: 1 },
];

export default function GameShell() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [hud, setHud] = useState({
    hp: 117,
    maxHp: 117,
    mp: 35,
    maxMp: 35,
    xp: 0,
    maxXp: 80,
    level: 1,
    rank: "E",
    power: 75,
    connectionStatus: "connecting" as HudConnectionStatus,
    playerName: "Aventurier",
    inventory: initialInventory,
    equipment: initialEquipment,
    stats: initialStats,
    rewards: [] as HudReward[],
    alive: true,
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
        onSkillActivate={(skillId) => dispatchToGame("ui:skill", { skillId })}
        onRespawn={() => dispatchToGame("ui:respawn", {})}
      />

      <div
        className="landscape-hint"
        aria-hidden="true"
        style={{
          position: "fixed",
          left: "50%",
          bottom: "calc(max(72px, env(safe-area-inset-bottom) + 72px))",
          zIndex: 40,
          transform: "translateX(-50%)",
          padding: "5px 10px",
          borderRadius: 999,
          color: "#d9ceb5",
          background: "rgba(12,16,22,.72)",
          fontSize: 10,
          pointerEvents: "none",
        }}
      >
        Tournez l’écran pour une vue plus large
      </div>
    </main>
  );
}
