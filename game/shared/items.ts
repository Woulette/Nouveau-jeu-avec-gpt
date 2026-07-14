import type { EquipmentSlot, PlayerRank } from "./types";

export const EQUIPMENT_SLOTS = [
  "head",
  "weapon",
  "armor",
  "legs",
  "boots",
  "ring",
] as const satisfies readonly EquipmentSlot[];

export const EQUIPMENT_SLOT_LABELS: Readonly<Record<EquipmentSlot, string>> = {
  head: "Coiffe",
  weapon: "Corps-à-corps",
  armor: "Armure",
  legs: "Pantalon",
  boots: "Bottes",
  ring: "Anneau",
};

export type ItemRarity = "common" | "uncommon" | "rare" | "epic";
export type ItemKind = "consumable" | "material" | "equipment";
/** Stable filter groups used by the inventory UI. */
export type ItemCategory = "consumable" | "resource" | "equipment";

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
  category: ItemCategory;
  rarity: ItemRarity;
  equipmentSlot?: EquipmentSlot;
  requiredRank?: PlayerRank;
  bonuses?: Readonly<ItemBonuses>;
  healAmount?: number;
}

const itemCatalog = {
  "starter-potion": {
    id: "starter-potion",
    name: "Petite potion",
    icon: "◉",
    description: "Une préparation simple qui restaure quelques points de vie.",
    kind: "consumable",
    category: "consumable",
    rarity: "common",
    healAmount: 35,
  },
  "coiffe-aventurier": {
    id: "coiffe-aventurier",
    name: "Coiffe d’aventurier",
    icon: "♕",
    description: "Une coiffe légère remise aux nouveaux aventuriers du Val d’Aube.",
    kind: "equipment",
    category: "equipment",
    rarity: "common",
    equipmentSlot: "head",
    bonuses: { defense: 1 },
  },
  "dague-emoussee": {
    id: "dague-emoussee",
    name: "Dague émoussée",
    icon: "†",
    description: "Une arme modeste, mais suffisante pour les premières chasses.",
    kind: "equipment",
    category: "equipment",
    rarity: "common",
    equipmentSlot: "weapon",
    bonuses: { melee: 1 },
  },
  "tunique-aventurier": {
    id: "tunique-aventurier",
    name: "Tunique d’aventurier",
    icon: "♜",
    description: "Une tunique renforcée distribuée aux nouveaux aventuriers.",
    kind: "equipment",
    category: "equipment",
    rarity: "common",
    equipmentSlot: "armor",
    bonuses: { defense: 1 },
  },
  "pantalon-aventurier": {
    id: "pantalon-aventurier",
    name: "Pantalon d’aventurier",
    icon: "♙",
    description: "Un pantalon solide conçu pour les premiers voyages hors de la ville.",
    kind: "equipment",
    category: "equipment",
    rarity: "common",
    equipmentSlot: "legs",
    bonuses: { defense: 1 },
  },
  "bottes-aventurier": {
    id: "bottes-aventurier",
    name: "Bottes d’aventurier",
    icon: "⌁",
    description: "Des bottes souples qui facilitent les longues expéditions.",
    kind: "equipment",
    category: "equipment",
    rarity: "common",
    equipmentSlot: "boots",
    bonuses: { energy: 1 },
  },
  "anneau-cuivre": {
    id: "anneau-cuivre",
    name: "Anneau de cuivre",
    icon: "○",
    description: "Un anneau sans rang qui renforce légèrement l’énergie de son porteur.",
    kind: "equipment",
    category: "equipment",
    rarity: "common",
    equipmentSlot: "ring",
    bonuses: { energy: 1 },
  },
  "gelee-claire": {
    id: "gelee-claire",
    name: "Gelée claire",
    icon: "◉",
    description: "Un composant visqueux récolté dans les prés.",
    kind: "material",
    category: "resource",
    rarity: "common",
  },
  "defense-de-sanglier": {
    id: "defense-de-sanglier",
    name: "Coiffe du Sanglier",
    icon: "♕",
    description: "Une coiffe robuste façonnée avec les défenses d’un sanglier moussu.",
    kind: "equipment",
    category: "equipment",
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
    category: "equipment",
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
    category: "equipment",
    rarity: "epic",
    equipmentSlot: "weapon",
    requiredRank: "D",
    bonuses: { melee: 12 },
  },
  "poussiere-dimensionnelle": {
    id: "poussiere-dimensionnelle",
    name: "Poussière dimensionnelle",
    icon: "✦",
    description: "Une ressource stable récupérée après la fermeture d’une faille de rang E.",
    kind: "material",
    category: "resource",
    rarity: "rare",
  },
} as const satisfies Readonly<Record<string, ItemDefinition>>;

export type ItemId = keyof typeof itemCatalog;

export const ITEM_CATALOG: Readonly<Record<ItemId, ItemDefinition>> = itemCatalog;

export const STARTER_INVENTORY: Readonly<Record<ItemId, number>> = {
  "starter-potion": 2,
  "coiffe-aventurier": 1,
  "dague-emoussee": 1,
  "tunique-aventurier": 1,
  "pantalon-aventurier": 1,
  "bottes-aventurier": 1,
  "anneau-cuivre": 1,
  "gelee-claire": 0,
  "defense-de-sanglier": 0,
  "croc-de-faille": 0,
  "fragment-de-faille": 0,
  "poussiere-dimensionnelle": 0,
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

export function meetsItemRank(
  rank: PlayerRank | null,
  requiredRank?: PlayerRank,
): boolean {
  if (requiredRank === undefined) return true;
  if (rank === null) return false;
  return RANK_INDEX[rank] >= RANK_INDEX[requiredRank];
}
