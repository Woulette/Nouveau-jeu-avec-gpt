import type { EquipmentSlot, PlayerRank } from "./types";

export const EQUIPMENT_SLOTS = ["head", "weapon", "armor", "boots"] as const satisfies readonly EquipmentSlot[];

export type ItemRarity = "common" | "uncommon" | "rare" | "epic";
export type ItemKind = "consumable" | "material" | "equipment";

export interface ItemBonuses {
  melee?: number;
  ranged?: number;
  magic?: number;
  defense?: number;
  energy?: number;
}

export interface ItemDefinition {
  id: string;
  name: string;
  icon: string;
  description: string;
  kind: ItemKind;
  rarity: ItemRarity;
  equipmentSlot?: EquipmentSlot;
  requiredRank?: PlayerRank;
  bonuses?: Readonly<ItemBonuses>;
}

const itemCatalog = {
  "starter-potion": {
    id: "starter-potion",
    name: "Petite potion",
    icon: "◉",
    description: "Une préparation simple qui restaure quelques points de vie.",
    kind: "consumable",
    rarity: "common",
  },
  "coiffe-aventurier": {
    id: "coiffe-aventurier",
    name: "Coiffe d’aventurier",
    icon: "♕",
    description: "Une coiffe légère remise aux nouveaux aventuriers du Val d’Aube.",
    kind: "equipment",
    rarity: "common",
    equipmentSlot: "head",
    requiredRank: "E",
    bonuses: { defense: 1 },
  },
  "dague-emoussee": {
    id: "dague-emoussee",
    name: "Dague émoussée",
    icon: "†",
    description: "Une arme modeste, mais suffisante pour les premières chasses.",
    kind: "equipment",
    rarity: "common",
    equipmentSlot: "weapon",
    requiredRank: "E",
    bonuses: { melee: 1 },
  },
  "tunique-aventurier": {
    id: "tunique-aventurier",
    name: "Tunique d’aventurier",
    icon: "♜",
    description: "Une tunique renforcée distribuée aux nouveaux aventuriers.",
    kind: "equipment",
    rarity: "common",
    equipmentSlot: "armor",
    requiredRank: "E",
    bonuses: { defense: 1 },
  },
  "bottes-aventurier": {
    id: "bottes-aventurier",
    name: "Bottes d’aventurier",
    icon: "⌁",
    description: "Des bottes souples qui facilitent les longues expéditions.",
    kind: "equipment",
    rarity: "common",
    equipmentSlot: "boots",
    requiredRank: "E",
    bonuses: { energy: 1 },
  },
  "gelee-claire": {
    id: "gelee-claire",
    name: "Gelée claire",
    icon: "◉",
    description: "Un composant visqueux récolté dans les prés.",
    kind: "material",
    rarity: "common",
  },
  "defense-de-sanglier": {
    id: "defense-de-sanglier",
    name: "Coiffe du Sanglier",
    icon: "♕",
    description: "Une coiffe robuste façonnée avec les défenses d’un sanglier moussu.",
    kind: "equipment",
    rarity: "uncommon",
    equipmentSlot: "head",
    requiredRank: "E",
    bonuses: { defense: 3 },
  },
  "croc-de-faille": {
    id: "croc-de-faille",
    name: "Lame-croc de faille",
    icon: "†",
    description: "Une lame courte traversée par une lueur violette.",
    kind: "equipment",
    rarity: "rare",
    equipmentSlot: "weapon",
    requiredRank: "E",
    bonuses: { melee: 4 },
  },
  "fragment-de-faille": {
    id: "fragment-de-faille",
    name: "Éclat du Gardien",
    icon: "◆",
    description: "Un fragment instable arraché au Gardien fissuré.",
    kind: "equipment",
    rarity: "epic",
    equipmentSlot: "weapon",
    requiredRank: "D",
    bonuses: { melee: 12 },
  },
} as const satisfies Readonly<Record<string, ItemDefinition>>;

export type ItemId = keyof typeof itemCatalog;

export const ITEM_CATALOG: Readonly<Record<ItemId, ItemDefinition>> = itemCatalog;

export const STARTER_INVENTORY: Readonly<Record<ItemId, number>> = {
  "starter-potion": 2,
  "coiffe-aventurier": 1,
  "dague-emoussee": 1,
  "tunique-aventurier": 1,
  "bottes-aventurier": 1,
  "gelee-claire": 0,
  "defense-de-sanglier": 0,
  "croc-de-faille": 0,
  "fragment-de-faille": 0,
};

const RANK_INDEX: Readonly<Record<PlayerRank, number>> = {
  E: 0,
  D: 1,
  C: 2,
  B: 3,
  A: 4,
  S: 5,
  SS: 6,
  SSS: 7,
  OMEGA: 8,
};

export function isKnownItem(itemId: string): itemId is ItemId {
  return Object.hasOwn(ITEM_CATALOG, itemId);
}

export function meetsItemRank(rank: PlayerRank, requiredRank: PlayerRank = "E"): boolean {
  return RANK_INDEX[rank] >= RANK_INDEX[requiredRank];
}
