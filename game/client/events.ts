export type EquipmentSlot = "weapon" | "armor" | "boots";

export interface InventoryItem {
  id: string;
  name: string;
  icon: string;
  quantity: number;
  slot?: EquipmentSlot;
  requiredRank?: string;
  power?: number;
  defense?: number;
  energy?: number;
  description: string;
}

export interface StatLine {
  label: string;
  base: number;
  trained: number;
  equipment: number;
  total: number;
}

export interface HudState {
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  xp: number;
  xpNeeded: number;
  level: number;
  rank: string;
  powerScore: number;
  connection: "local" | "connecting" | "online" | "reconnecting";
  inventory: InventoryItem[];
  equipment: Partial<Record<EquipmentSlot, InventoryItem>>;
  stats: StatLine[];
  hint?: string;
}

export const initialHudState: HudState = {
  hp: 105,
  maxHp: 105,
  mp: 42,
  maxMp: 42,
  xp: 0,
  xpNeeded: 80,
  level: 1,
  rank: "E",
  powerScore: 18,
  connection: "connecting",
  inventory: [
    {
      id: "potion-starter",
      name: "Petite potion",
      icon: "🧪",
      quantity: 2,
      description: "Restaure un peu de vie.",
    },
  ],
  equipment: {},
  stats: [
    { label: "Corps-à-corps", base: 1, trained: 0, equipment: 0, total: 1 },
    { label: "Distance", base: 1, trained: 0, equipment: 0, total: 1 },
    { label: "Magie", base: 1, trained: 0, equipment: 0, total: 1 },
    { label: "Défense", base: 1, trained: 0, equipment: 0, total: 1 },
    { label: "Énergie", base: 1, trained: 0, equipment: 0, total: 1 },
  ],
};

export const GAME_EVENT = {
  HUD: "game:hud",
  READY: "game:ready",
  EQUIP: "ui:equip",
  USE_ITEM: "ui:use-item",
  PANEL: "ui:panel",
} as const;
