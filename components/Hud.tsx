"use client";

import {
  type CSSProperties,
  type HTMLAttributes,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import styles from "./Hud.module.css";

export type HudConnectionStatus = "connected" | "connecting" | "local" | "offline";
export type HudConnectionMode = "online" | "offline";
export type HudPanel = "inventory" | "equipment" | "stats" | "map" | null;
export type HudItemRarity = "common" | "uncommon" | "rare" | "epic" | "legendary";

export interface HudMapPosition {
  x: number;
  y: number;
}

export interface HudMapSize {
  width: number;
  height: number;
}

export interface HudRift {
  id: string;
  rank: string;
  x: number;
  y: number;
  spawnedAt: number;
  expiresAt: number;
  status: "open" | "boss-escaped";
  outsideBossAlive?: boolean;
}

export interface HudSkillSlot {
  id: string;
  name?: string;
  icon?: string;
  locked?: boolean;
  cooldown?: number;
  cooldownMax?: number;
}

export interface HudItemStat {
  label: string;
  value: string | number;
}

export interface HudInventoryItem {
  id: string;
  name: string;
  icon?: string;
  quantity?: number;
  rarity?: HudItemRarity;
  description?: string;
  requiredRank?: string;
  equipped?: boolean;
  equippable?: boolean;
  canEquip?: boolean;
  stats?: HudItemStat[];
  category?: "equipment" | "resource" | "consumable";
}

export interface HudEquipmentSlot {
  id: string;
  label: string;
  icon?: string;
  item?: HudInventoryItem | null;
}

export interface HudReward {
  id: string;
  name: string;
  icon: string;
  quantity?: number;
  rarity?: HudItemRarity;
}

export interface HudRiftCompletion {
  riftId: string;
  rank: string;
  elapsedMs: number;
  generalXp: number;
  items: HudReward[];
}

export interface HudStatBreakdown {
  id: string;
  label: string;
  icon?: string;
  description?: string;
  base: number;
  training?: number;
  equipment?: number;
  total: number;
  xp?: number;
  xpToNext?: number;
}

export interface HudProps {
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  xp: number;
  maxXp: number;
  level: number;
  rank: string | null;
  power: number;
  gold?: number;
  connectionStatus: HudConnectionStatus;
  playerName?: string;
  skillSlots?: HudSkillSlot[];
  inventory?: HudInventoryItem[];
  inventoryCapacity?: number;
  equipment?: HudEquipmentSlot[];
  stats?: HudStatBreakdown[];
  rewards?: HudReward[];
  riftCompletion?: HudRiftCompletion | null;
  rifts?: HudRift[];
  playerMapPosition?: HudMapPosition;
  mapSize?: HudMapSize;
  alive?: boolean;
  preferredConnectionMode?: HudConnectionMode;
  activePanel?: HudPanel;
  onPanelChange?: (panel: HudPanel) => void;
  onPanelClose?: (panel: Exclude<HudPanel, null>) => void;
  onEquip?: (itemId: string) => void;
  onUnequip?: (slotId: string) => void;
  onUseItem?: (itemId: string) => void;
  onSkillActivate?: (skillId: string) => void;
  onRespawn?: () => void;
  onConnectionModeChange?: (mode: HudConnectionMode) => void;
  onDismissRiftCompletion?: () => void;
}

type MeterTone = "health" | "mana" | "xp";

const PANEL_LABELS: Record<Exclude<HudPanel, null>, string> = {
  inventory: "Inventaire & équipement",
  equipment: "Équipement",
  stats: "Statistiques",
  map: "Carte des failles",
};

const QUICK_PANELS: ReadonlyArray<{ id: "inventory" | "stats" | "map"; label: string; icon: string }> = [
  { id: "inventory", label: "Inventaire", icon: "◇" },
  { id: "stats", label: "Statistiques", icon: "✦" },
  { id: "map", label: "Carte des failles", icon: "⌖" },
];

const CONNECTION_LABELS: Record<HudConnectionStatus, string> = {
  connected: "En ligne",
  connecting: "Connexion…",
  local: "Mode local",
  offline: "Hors ligne",
};

const RARITY_LABELS: Record<HudItemRarity, string> = {
  common: "Commun",
  uncommon: "Inhabituel",
  rare: "Rare",
  epic: "Épique",
  legendary: "Légendaire",
};

const RANK_BONUSES: Readonly<Record<string, number>> = {
  E: 5,
  D: 10,
  C: 15,
  B: 25,
  A: 35,
  S: 50,
  SS: 65,
  SSS: 80,
  OMEGA: 100,
  "Ω": 100,
};

const EQUIPMENT_LAYOUT = [
  { id: "head", label: "Coiffe", icon: "♢", className: "equipmentSlotHead" },
  { id: "weapon", label: "Arme", icon: "⚔", className: "equipmentSlotWeapon" },
  { id: "armor", label: "Armure", icon: "♜", className: "equipmentSlotArmor" },
  { id: "legs", label: "Jambes", icon: "♧", className: "equipmentSlotLegs" },
  { id: "boots", label: "Bottes", icon: "⌁", className: "equipmentSlotBoots" },
  { id: "ring", label: "Anneau", icon: "◉", className: "equipmentSlotRing" },
] as const;

const STAT_PRESENTATION: Record<string, { icon: string; description: string }> = {
  melee: {
    icon: "⚔",
    description: "Augmente les dégâts au corps à corps.",
  },
  ranged: {
    icon: "➶",
    description: "Augmente les dégâts des attaques à distance.",
  },
  magic: {
    icon: "✦",
    description: "Augmente la puissance des sorts magiques.",
  },
  defense: {
    icon: "🛡",
    description: "Réduit les dégâts reçus au combat.",
  },
  energy: {
    icon: "⚡",
    description: "Renforce les réserves de vie et de mana.",
  },
  speed: {
    icon: "➟",
    description: "Accélère les déplacements sur la carte.",
  },
  vitesse: {
    icon: "➟",
    description: "Accélère les déplacements sur la carte.",
  },
};

type InventoryFilter = "all" | "equipment" | "resource" | "consumable";

const INVENTORY_FILTERS: ReadonlyArray<{
  id: InventoryFilter;
  label: string;
  shortLabel: string;
  icon: string;
}> = [
  { id: "all", label: "Tout", shortLabel: "Tout", icon: "▦" },
  { id: "equipment", label: "Équipement", shortLabel: "Équip.", icon: "⚔" },
  { id: "consumable", label: "Consommable", shortLabel: "Conso.", icon: "✚" },
  { id: "resource", label: "Ressources", shortLabel: "Ress.", icon: "◆" },
];

function clampRatio(value: number, maximum: number) {
  if (!Number.isFinite(value) || !Number.isFinite(maximum) || maximum <= 0) {
    return 0;
  }

  return Math.min(1, Math.max(0, value / maximum));
}

function meterStyle(value: number, maximum: number) {
  return {
    "--meter-progress": `${clampRatio(value, maximum) * 100}%`,
  } as CSSProperties;
}

function formatCompact(value: number) {
  return new Intl.NumberFormat("fr-FR", {
    notation: value >= 10_000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(Math.max(0, Math.floor(value)));
}

function stopWorldPointer(event: ReactPointerEvent<HTMLElement>) {
  event.stopPropagation();
}

function HudSurface({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & { className: string; children: ReactNode }) {
  return (
    <div
      {...props}
      className={className}
      data-game-ui="true"
      onClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
      onPointerDown={stopWorldPointer}
      onPointerMove={stopWorldPointer}
      onPointerUp={stopWorldPointer}
    >
      {children}
    </div>
  );
}

function Meter({
  tone,
  value,
  maximum,
  label,
}: {
  tone: MeterTone;
  value: number;
  maximum: number;
  label: string;
}) {
  return (
    <div
      className={`${styles.meter} ${styles[`meter_${tone}`]}`}
      style={meterStyle(value, maximum)}
      aria-label={`${label} : ${formatCompact(value)} sur ${formatCompact(maximum)}`}
    >
      <span className={styles.meterFill} />
      <span className={styles.meterShine} />
      <span className={styles.meterText}>
        <span>{label}</span>
        <strong>
          {formatCompact(value)} / {formatCompact(maximum)}
        </strong>
      </span>
    </div>
  );
}

function getItemCategory(item: HudInventoryItem): Exclude<InventoryFilter, "all"> {
  if (item.category) return item.category;
  if (item.equippable !== false) return "equipment";
  if (/potion|élixir|elixir|consommable|food|nourriture/i.test(`${item.id} ${item.name}`)) {
    return "consumable";
  }
  return "resource";
}

function CombinedInventoryPanel({
  slots,
  items,
  capacity,
  gold,
  onEquip,
  onUnequip,
  onUseItem,
}: {
  slots: HudEquipmentSlot[];
  items: HudInventoryItem[];
  capacity: number;
  gold: number;
  onEquip?: (itemId: string) => void;
  onUnequip?: (slotId: string) => void;
  onUseItem?: (itemId: string) => void;
}) {
  const [filter, setFilter] = useState<InventoryFilter>("all");
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const slotById = new Map(slots.map((slot) => [slot.id.toLowerCase(), slot]));
  const layoutSlots = EQUIPMENT_LAYOUT.map((layout) => {
    const aliases =
      layout.id === "head"
        ? ["head", "helmet", "coiffe"]
        : layout.id === "armor"
          ? ["armor", "armour", "chest", "torso"]
          : layout.id === "legs"
            ? ["legs", "pants", "trousers", "pantalon"]
            : layout.id === "boots"
              ? ["boots", "feet", "shoes"]
              : layout.id === "ring"
                ? ["ring", "anneau", "jewel"]
                : ["weapon", "mainhand", "main-hand", "melee"];
    const slot = aliases.map((alias) => slotById.get(alias)).find(Boolean);
    return {
      ...layout,
      slot: slot ?? { id: layout.id, label: layout.label, icon: layout.icon, item: null },
    };
  });
  const allKnownItems = [...items, ...slots.flatMap((slot) => (slot.item ? [slot.item] : []))];
  const selectedItem = allKnownItems.find((item) => item.id === selectedItemId) ?? null;
  const equippedSlot = selectedItem
    ? slots.find((slot) => slot.item?.id === selectedItem.id) ?? null
    : null;
  const filteredItems = items.filter((item) => filter === "all" || getItemCategory(item) === filter);
  const visibleCapacity = Math.max(filteredItems.length, Math.min(Math.max(capacity, 20), 40));
  const emptySlots = Math.max(0, visibleCapacity - filteredItems.length);
  const equippedCount = slots.filter((slot) => slot.item).length;

  function countForFilter(filterId: InventoryFilter) {
    if (filterId === "all") return items.length;
    return items.filter((item) => getItemCategory(item) === filterId).length;
  }

  function selectFilter(nextFilter: InventoryFilter) {
    setFilter(nextFilter);
    if (
      selectedItem &&
      nextFilter !== "all" &&
      getItemCategory(selectedItem) !== nextFilter
    ) {
      setSelectedItemId(null);
    }
  }

  const selectedCategory = selectedItem ? getItemCategory(selectedItem) : null;

  return (
    <div className={styles.inventoryEquipmentLayout}>
      <section className={styles.equipmentColumn} aria-labelledby="equipment-title">
        <div className={styles.compactSectionHeading}>
          <span id="equipment-title">Équipement</span>
          <small>{equippedCount}/6 portés</small>
        </div>
        <div className={styles.combinedEquipmentStage} aria-label="Équipement porté par le personnage">
          <div className={styles.mannequin} aria-hidden="true">
            <span className={styles.mannequinHead} />
            <span className={styles.mannequinBody} />
            <span className={styles.mannequinArmLeft} />
            <span className={styles.mannequinArmRight} />
            <span className={styles.mannequinLegLeft} />
            <span className={styles.mannequinLegRight} />
            <span className={styles.mannequinAura} />
            {layoutSlots.map(({ id, icon, slot }) =>
              slot.item ? (
                <span
                  className={`${styles.mannequinEquipped} ${styles[`mannequinEquipped_${id}`]}`}
                  key={`worn-${id}`}
                >
                  {slot.item.icon ?? slot.icon ?? icon}
                </span>
              ) : null,
            )}
          </div>

          {layoutSlots.map(({ className, icon, label, slot }) => {
            const item = slot.item;
            return (
              <button
                type="button"
                className={`${styles.equipmentSlotCard} ${styles[className]} ${
                  item ? styles.equipmentSlotFilled : ""
                }`}
                key={slot.id}
                disabled={!item}
                onClick={() => item && setSelectedItemId(item.id)}
                aria-label={item ? `${slot.label} : ${item.name}. Toucher pour voir le détail.` : `${slot.label} vide`}
                title={item?.name ?? `${slot.label} vide`}
              >
                <span className={styles.equipmentSlotLabel}>{label}</span>
                <span className={styles.equipmentSlotIcon} aria-hidden="true">{item?.icon ?? slot.icon ?? icon}</span>
                {item ? <span className={styles.equipmentSlotCheck} aria-hidden="true">✓</span> : null}
              </button>
            );
          })}
        </div>
      </section>

      <section className={styles.inventoryColumn} aria-labelledby="inventory-title">
        <div className={styles.inventoryTitleRow}>
          <div>
            <strong id="inventory-title">Sac d’aventurier</strong>
            <small>Votre réserve de voyage</small>
          </div>
          <div className={styles.inventoryMeta}>
            <span className={styles.capacity} aria-label={`${items.length} emplacements utilisés sur ${capacity}`}>
              <small>Slots</small>
              <strong>{items.length}/{capacity}</strong>
            </span>
            <span className={styles.wallet} aria-label={`${formatCompact(gold)} pièces d’or`}>
              <i aria-hidden="true">●</i>
              <strong>{formatCompact(gold)}</strong>
              <small>Or</small>
            </span>
          </div>
        </div>

        <div className={styles.inventoryFilters} aria-label="Filtrer l’inventaire">
          {INVENTORY_FILTERS.map((entry) => (
            <button
              type="button"
              key={entry.id}
              className={filter === entry.id ? styles.activeFilter : ""}
              aria-label={`${entry.label} (${countForFilter(entry.id)})`}
              aria-pressed={filter === entry.id}
              onClick={() => selectFilter(entry.id)}
            >
              <span aria-hidden="true">{entry.icon}</span>
              <strong>
                <span className={styles.filterLabelFull}>{entry.label}</span>
                <span className={styles.filterLabelShort}>{entry.shortLabel}</span>
              </strong>
              <small>{countForFilter(entry.id)}</small>
            </button>
          ))}
        </div>

        <div className={styles.inventoryGridViewport}>
          <div className={styles.inventoryGrid} aria-label="Objets dans l’inventaire">
            {filteredItems.map((item) => {
              const rarity = item.rarity ?? "common";
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`${styles.itemSlot} ${styles[`rarity_${rarity}`]} ${
                    selectedItem?.id === item.id ? styles.itemSlotSelected : ""
                  }`}
                  aria-label={`${item.name}, ${RARITY_LABELS[rarity]}`}
                  aria-pressed={selectedItem?.id === item.id}
                  onClick={() => setSelectedItemId(item.id)}
                  title={item.name}
                >
                  <span className={styles.itemIcon} aria-hidden="true">{item.icon ?? "◆"}</span>
                  {(item.quantity ?? 1) > 1 ? <span className={styles.itemQuantity}>×{item.quantity}</span> : null}
                  {item.equipped ? <span className={styles.equippedMark} aria-label="Équipé">✓</span> : null}
                </button>
              );
            })}
            {Array.from({ length: emptySlots }, (_, index) => (
              <span className={`${styles.itemSlot} ${styles.emptyItemSlot}`} key={`empty-${index}`} />
            ))}
          </div>
          {!filteredItems.length ? <p className={styles.emptyFilter}>Aucun objet dans cette catégorie.</p> : null}
        </div>
      </section>

      <aside
        className={`${styles.itemDetails} ${selectedItem ? "" : styles.itemDetailsEmpty}`}
        aria-live="polite"
        aria-label={selectedItem ? `Détails de ${selectedItem.name}` : "Détail de l’objet sélectionné"}
      >
        {selectedItem ? (
          <>
            <button
              type="button"
              className={styles.detailClose}
              onClick={() => setSelectedItemId(null)}
              aria-label="Fermer les détails de l’objet"
            >×</button>
            <div className={styles.itemDetailsHeader}>
              <span className={`${styles.detailIcon} ${styles[`rarity_${selectedItem.rarity ?? "common"}`]}`}>
                {selectedItem.icon ?? "◆"}
              </span>
              <div>
                <h3>{selectedItem.name}</h3>
                <p className={styles.rarityLabel}>
                  {RARITY_LABELS[selectedItem.rarity ?? "common"]} · {
                    INVENTORY_FILTERS.find((entry) => entry.id === selectedCategory)?.label
                  } · ×{selectedItem.quantity ?? 1}
                </p>
              </div>
            </div>
            <p className={styles.itemDescription}>
              {selectedItem.description ?? "Aucune description disponible pour cet objet."}
            </p>
            {selectedItem.stats?.length ? (
              <dl className={styles.itemStats}>
                {selectedItem.stats.map((stat) => (
                  <div key={stat.label}><dt>{stat.label}</dt><dd>{stat.value}</dd></div>
                ))}
              </dl>
            ) : <p className={styles.noBonus}>Aucun bonus de statistique.</p>}
            {selectedItem.requiredRank ? (
              <p className={styles.requirement}>Rang requis : {selectedItem.requiredRank}</p>
            ) : null}
            {selectedItem.equippable !== false ? (
              <button
                type="button"
                className={styles.primaryAction}
                disabled={!equippedSlot && selectedItem.canEquip === false}
                onClick={() => {
                  if (equippedSlot) onUnequip?.(equippedSlot.id);
                  else onEquip?.(selectedItem.id);
                }}
              >
                {equippedSlot
                  ? "Retirer l’équipement"
                  : selectedItem.canEquip === false
                    ? "Conditions non remplies"
                    : "Équiper cet objet"}
              </button>
            ) : selectedCategory === "consumable" && onUseItem ? (
              <button
                type="button"
                className={styles.primaryAction}
                onClick={() => onUseItem?.(selectedItem.id)}
              >
                Utiliser cet objet
              </button>
            ) : null}
          </>
        ) : (
          <div className={styles.itemDetailsPlaceholder}>
            <span aria-hidden="true">◇</span>
            <strong>Détail de l’objet</strong>
            <p>Touchez un équipement ou un objet du sac pour consulter ses effets.</p>
          </div>
        )}
      </aside>
    </div>
  );
}

function StatsPanel({ stats, rank, level }: { stats: HudStatBreakdown[]; rank: string | null; level: number }) {
  const speedFromLevel = Math.min(300, 100 + Math.floor(Math.max(0, level) / 10));
  const hasSpeed = stats.some((stat) => ["speed", "vitesse"].includes(stat.id.toLowerCase()));
  const normalizedStats = (
    hasSpeed
      ? stats
      : [
          ...stats,
          {
            id: "speed",
            label: "Vitesse",
            description: "Augmente de 1 tous les 10 niveaux. Maximum : 300.",
            base: 100,
            training: speedFromLevel - 100,
            equipment: 0,
            total: speedFromLevel,
          },
        ]
  ).slice(0, 6);

  return (
    <div className={styles.statsList}>
      <aside className={styles.rankBonus} aria-label={rank ? `Bonus du rang ${rank}` : "Aucun rang attribué"}>
        {rank ? (
          <>
            <span><small>Bonus permanent du rang {rank}</small>Dégâts · PV · Défense</span>
            <strong>+{RANK_BONUSES[rank.toUpperCase()] ?? 0}%</strong>
          </>
        ) : (
          <>
            <span><small>Statut actuel</small>Aventurier · Aucun rang attribué</span>
            <em>QG au niveau 10</em>
          </>
        )}
      </aside>
      <div className={styles.statsMatrixHeader} aria-hidden="true">
        <span>Statistique</span>
        <span>Base</span>
        <span>Combat</span>
        <span>Équipement</span>
        <span>Total</span>
      </div>
      {normalizedStats.map((stat) => {
        const hasTraining = typeof stat.xp === "number" && typeof stat.xpToNext === "number";
        const statId = stat.id.toLowerCase();
        const isSpeed = ["speed", "vitesse"].includes(statId);
        const presentation = STAT_PRESENTATION[statId];
        return (
          <article
            className={styles.statCard}
            key={stat.id}
            aria-label={`${stat.label} : base ${formatCompact(stat.base)}, combat ${formatCompact(stat.training ?? 0)}, équipement ${formatCompact(stat.equipment ?? 0)}, total ${formatCompact(stat.total)}`}
            title={stat.description ?? presentation?.description}
          >
            <div className={styles.statTopline}>
              <span className={styles.statIcon} aria-hidden="true">
                {presentation?.icon ?? stat.icon ?? "✦"}
              </span>
              <div className={styles.statIdentity}>
                <strong>{stat.label}</strong>
                {hasTraining && !isSpeed ? (
                  <div className={styles.trainingRow} aria-label={`Progression de ${stat.label}`}>
                    <span className={styles.trainingTrack} style={meterStyle(stat.xp ?? 0, stat.xpToNext ?? 0)}>
                      <i />
                    </span>
                    <small className={styles.trainingLabel}>
                      {formatCompact(stat.xp ?? 0)}/{formatCompact(stat.xpToNext ?? 0)} XP
                    </small>
                  </div>
                ) : (
                  <small className={styles.levelOnly}>
                    {isSpeed ? "Progression par niveau · max 300" : "Progression par niveau général"}
                  </small>
                )}
              </div>
            </div>
            <span className={styles.statMetric}><small>Base</small><strong>{formatCompact(stat.base)}</strong></span>
            <span className={styles.statMetric}><small>Combat</small><strong>{formatCompact(stat.training ?? 0)}</strong></span>
            <span className={styles.statMetric}><small>Équipement</small><strong>{formatCompact(stat.equipment ?? 0)}</strong></span>
            <span className={`${styles.statMetric} ${styles.statTotal}`}>
              <small>Total</small><strong>{formatCompact(stat.total)}</strong>
            </span>
          </article>
        );
      })}
    </div>
  );
}

function formatRiftDuration(milliseconds: number) {
  if (!Number.isFinite(milliseconds)) return "--";
  const seconds = Math.max(0, Math.floor(milliseconds / 1_000));
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ${seconds % 60} s`;
  const hours = Math.floor(minutes / 60);
  return `${hours} h ${minutes % 60} min`;
}

function RiftMapPanel({
  rifts,
  playerPosition,
  mapSize,
}: {
  rifts: HudRift[];
  playerPosition: HudMapPosition;
  mapSize: HudMapSize;
}) {
  const [selectedRiftId, setSelectedRiftId] = useState<string | null>(null);
  const [journalOpen, setJournalOpen] = useState(false);
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const initialTimer = window.setTimeout(() => setNow(Date.now()), 0);
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
    };
  }, []);

  const selectedRift = rifts.find((rift) => rift.id === selectedRiftId) ?? null;
  const orderedRifts = [...rifts].sort((left, right) => {
    if (left.status !== right.status) return left.status === "open" ? -1 : 1;
    return left.expiresAt - right.expiresAt;
  });
  const journalRifts = orderedRifts.slice(0, 5);
  const hiddenRiftCount = Math.max(0, orderedRifts.length - journalRifts.length);
  const safeMapWidth = Math.max(1, mapSize.width);
  const safeMapHeight = Math.max(1, mapSize.height);
  const openCount = rifts.filter((rift) => rift.status === "open").length;
  const playerStyle = {
    "--map-x": `${4 + clampRatio(playerPosition.x, safeMapWidth) * 92}%`,
    "--map-y": `${6 + clampRatio(playerPosition.y, safeMapHeight) * 88}%`,
  } as CSSProperties;

  function selectRift(riftId: string) {
    setSelectedRiftId(riftId);
    setJournalOpen(false);
  }

  function riftTiming(rift: HudRift) {
    if (rift.status === "boss-escaped") {
      return rift.outsideBossAlive === false ? "Boss vaincu · à fermer" : "Boss échappé";
    }
    if (now === null) return "Calcul…";
    return `${formatRiftDuration(rift.expiresAt - now)} restante`;
  }

  return (
    <div className={styles.riftMapLayout}>
      <section className={styles.riftMapSurface} aria-label="Carte des failles actives">
        <div className={styles.mapGrid} aria-hidden="true" />
        <span className={styles.mapRegionLabel}>Région connue</span>
        <span className={styles.playerMapMarker} style={playerStyle} aria-label="Votre position">
          <span aria-hidden="true">▲</span>
          <small>Vous</small>
        </span>
        {rifts.map((rift) => {
          const markerStyle = {
            "--map-x": `${4 + clampRatio(rift.x, safeMapWidth) * 92}%`,
            "--map-y": `${6 + clampRatio(rift.y, safeMapHeight) * 88}%`,
          } as CSSProperties;
          const escaped = rift.status === "boss-escaped";
          return (
            <button
              type="button"
              className={`${styles.riftMarker} ${escaped ? styles.riftMarkerEscaped : ""} ${
                selectedRift?.id === rift.id ? styles.riftMarkerSelected : ""
              }`}
              data-rank={rift.rank.toUpperCase()}
              style={markerStyle}
              key={rift.id}
              aria-label={`Faille rang ${rift.rank}, ${riftTiming(rift)}`}
              aria-pressed={selectedRift?.id === rift.id}
              onClick={() => selectRift(rift.id)}
            >
              <span aria-hidden="true">{escaped ? "×" : "◇"}</span>
              <small>{rift.rank}</small>
            </button>
          );
        })}
        {!rifts.length ? (
          <div className={styles.noRifts}>
            <span aria-hidden="true">◇</span>
            <strong>Aucune faille détectée</strong>
            <small>Le journal se mettra à jour dès qu’une faille apparaîtra.</small>
          </div>
        ) : null}
        <div className={styles.mapLegend} aria-label="Légende">
          <span><i className={styles.legendPlayer} /> Joueur</span>
          <span><i className={styles.legendOpen} /> Ouverte</span>
          <span><i className={styles.legendEscaped} /> Échappé</span>
        </div>
      </section>

      <aside className={styles.riftSidebar} aria-label="Informations des failles">
        <header className={styles.riftSidebarHeader}>
          <span><small>Détections</small><strong>{openCount} ouverte{openCount > 1 ? "s" : ""}</strong></span>
          <button
            type="button"
            className={journalOpen ? styles.journalButtonActive : ""}
            aria-pressed={journalOpen}
            onClick={() => {
              setJournalOpen((isOpen) => !isOpen);
              setSelectedRiftId(null);
            }}
          >
            <span aria-hidden="true">☷</span> Journal
          </button>
        </header>

        {journalOpen ? (
          <div className={styles.riftJournal}>
            <div className={styles.journalLabels} aria-hidden="true">
              <span>Faille</span><span>Âge</span><span>État</span>
            </div>
            {journalRifts.map((rift) => (
              <button type="button" key={rift.id} onClick={() => selectRift(rift.id)}>
                <strong>Rang {rift.rank}</strong>
                <span>{now === null ? "--" : formatRiftDuration(now - rift.spawnedAt)}</span>
                <small className={rift.status === "boss-escaped" ? styles.escapedText : ""}>
                  {riftTiming(rift)}
                </small>
              </button>
            ))}
            {!journalRifts.length ? <p>Aucune entrée dans le journal.</p> : null}
            {hiddenRiftCount ? <small className={styles.hiddenRifts}>+{hiddenRiftCount} autre{hiddenRiftCount > 1 ? "s" : ""}</small> : null}
          </div>
        ) : selectedRift ? (
          <article className={styles.riftDetails}>
            <button
              type="button"
              className={styles.riftDetailClose}
              onClick={() => setSelectedRiftId(null)}
              aria-label="Fermer le détail de la faille"
            >×</button>
            <span className={styles.riftDetailIcon} aria-hidden="true">
              {selectedRift.status === "boss-escaped" ? "×" : "◇"}
            </span>
            <div className={styles.riftDetailTitle}>
              <small>Faille détectée</small>
              <strong>Rang {selectedRift.rank}</strong>
            </div>
            <dl>
              <div><dt>État</dt><dd>{
                selectedRift.status === "open"
                  ? "Ouverte"
                  : selectedRift.outsideBossAlive === false
                    ? "Boss vaincu · intérieur à fermer"
                    : "Boss échappé"
              }</dd></div>
              <div><dt>Apparue il y a</dt><dd>{now === null ? "--" : formatRiftDuration(now - selectedRift.spawnedAt)}</dd></div>
              <div><dt>Temps restant</dt><dd>{riftTiming(selectedRift)}</dd></div>
              <div><dt>Position</dt><dd>{Math.round(selectedRift.x)} · {Math.round(selectedRift.y)}</dd></div>
            </dl>
          </article>
        ) : (
          <div className={styles.riftOverview}>
            <span aria-hidden="true">⌖</span>
            <strong>Sélectionnez une faille</strong>
            <p>Touchez un marqueur pour voir son rang, son âge et le temps restant.</p>
            <small>Le journal conserve aussi les boss ayant réussi à s’échapper.</small>
          </div>
        )}
      </aside>
    </div>
  );
}

export default function Hud({
  hp,
  maxHp,
  mp,
  maxMp,
  xp,
  maxXp,
  level,
  rank,
  power,
  gold = 0,
  connectionStatus,
  playerName = "Aventurier",
  skillSlots = [],
  inventory = [],
  inventoryCapacity = 20,
  equipment = [],
  stats = [],
  rewards = [],
  riftCompletion = null,
  rifts = [],
  playerMapPosition = { x: 0, y: 0 },
  mapSize = { width: 100, height: 100 },
  alive = true,
  preferredConnectionMode,
  activePanel,
  onPanelChange,
  onPanelClose,
  onEquip,
  onUnequip,
  onUseItem,
  onSkillActivate,
  onRespawn,
  onConnectionModeChange,
  onDismissRiftCompletion,
}: HudProps) {
  const [internalPanel, setInternalPanel] = useState<HudPanel>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousPanelRef = useRef<HudPanel>(null);
  const [internalConnectionMode, setInternalConnectionMode] = useState<HudConnectionMode>(() =>
    preferredConnectionMode ?? (connectionStatus === "local" || connectionStatus === "offline" ? "offline" : "online"),
  );
  const panel = activePanel === undefined ? internalPanel : activePanel;
  const displayedPanel = panel === "equipment" ? "inventory" : panel;
  const selectedConnectionMode = preferredConnectionMode ?? internalConnectionMode;

  const visibleSkillSlots = useMemo(
    () =>
      Array.from({ length: 4 }, (_, index): HudSkillSlot =>
        skillSlots[index] ?? {
          id: `locked-${index}`,
          locked: true,
        },
      ),
    [skillSlots],
  );

  function selectPanel(nextPanel: Exclude<HudPanel, null>) {
    if (activePanel === undefined) {
      setInternalPanel(nextPanel);
    }
    setMenuOpen(false);
    onPanelChange?.(nextPanel);
  }

  function selectConnectionMode(mode: HudConnectionMode) {
    setInternalConnectionMode(mode);
    onConnectionModeChange?.(mode);
  }

  function closePanel() {
    if (!panel) {
      return;
    }
    if (activePanel === undefined) {
      setInternalPanel(null);
    }
    onPanelClose?.(panel);
    onPanelChange?.(null);
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setMenuOpen(false);
      if (!panel) return;
      if (activePanel === undefined) setInternalPanel(null);
      onPanelClose?.(panel);
      onPanelChange?.(null);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activePanel, onPanelChange, onPanelClose, panel]);

  useEffect(() => {
    if (panel) {
      closeButtonRef.current?.focus();
    } else if (previousPanelRef.current) {
      menuButtonRef.current?.focus();
    }
    previousPanelRef.current = panel;
  }, [panel]);

  return (
    <div
      className={`${styles.hud} ${panel ? styles.hudPanelOpen : ""}`}
      aria-label="Interface du jeu"
    >
      <div
        className={styles.gameHudLayer}
        aria-hidden={panel ? true : undefined}
        inert={panel ? true : undefined}
      >
        <HudSurface className={styles.playerCard}>
        <div className={styles.identityRow}>
          <span className={styles.avatar} aria-hidden="true">
            A
          </span>
          <div className={styles.identityCopy}>
            <strong>{playerName}</strong>
            <span>{rank ? `Niveau ${level} · Rang ${rank}` : `Niveau ${level} · Non classé`}</span>
          </div>
          <span
            className={`${styles.connection} ${styles[`connection_${connectionStatus}`]}`}
            title={CONNECTION_LABELS[connectionStatus]}
            aria-label={CONNECTION_LABELS[connectionStatus]}
          />
        </div>
        <div className={styles.primaryMeters}>
          <Meter tone="health" value={hp} maximum={maxHp} label="PV" />
          <Meter tone="mana" value={mp} maximum={maxMp} label="PM" />
          <Meter tone="xp" value={xp} maximum={maxXp} label="XP" />
        </div>
        </HudSurface>

        <HudSurface className={styles.powerBadge}>
          <span>Puissance</span>
          <strong>{formatCompact(power)}</strong>
        </HudSurface>

        <HudSurface className={styles.skillBar}>
        {visibleSkillSlots.map((skill, index) => {
          const isEmpty = !skill.name;
          const isLocked = skill.locked ?? isEmpty;
          const cooldownRatio = clampRatio(skill.cooldown ?? 0, skill.cooldownMax ?? 0);
          return (
            <button
              type="button"
              className={`${styles.skillSlot} ${isLocked ? styles.skillLocked : ""}`}
              key={skill.id}
              disabled={isLocked}
              onClick={() => onSkillActivate?.(skill.id)}
              aria-label={isEmpty ? `Emplacement ${index + 1} verrouillé` : skill.name}
            >
              <span className={styles.skillIndex}>{index + 1}</span>
              <span className={styles.skillIcon} aria-hidden="true">
                {isEmpty ? "✧" : skill.icon ?? "✦"}
              </span>
              {isLocked ? <span className={styles.lockIcon}>◆</span> : null}
              {cooldownRatio > 0 ? (
                <span
                  className={styles.cooldown}
                  style={{ "--cooldown": `${cooldownRatio * 100}%` } as CSSProperties}
                />
              ) : null}
            </button>
          );
        })}
        </HudSurface>

        {rewards.length ? (
          <div className={styles.rewardFeed} aria-live="polite" aria-label="Butin récemment obtenu">
          {rewards.slice(-2).map((reward) => (
            <article
              className={`${styles.rewardCard} ${styles[`rarity_${reward.rarity ?? "common"}`]}`}
              key={reward.id}
            >
              <span className={styles.rewardIcon} aria-hidden="true">{reward.icon}</span>
              <span className={styles.rewardCopy}>
                <small>Butin obtenu</small>
                <strong>{reward.name}</strong>
              </span>
              <span className={styles.rewardQuantity}>×{reward.quantity ?? 1}</span>
            </article>
          ))}
          </div>
        ) : null}

        <HudSurface className={styles.menuDock}>
        {menuOpen ? (
          <nav className={styles.quickMenu} aria-label="Menu du personnage">
            <div className={styles.connectionModeControl} role="group" aria-label="Mode de connexion préféré">
              <small>Connexion</small>
              <div>
                <button
                  type="button"
                  className={selectedConnectionMode === "online" ? styles.connectionModeActive : ""}
                  aria-pressed={selectedConnectionMode === "online"}
                  onClick={() => selectConnectionMode("online")}
                >En ligne</button>
                <button
                  type="button"
                  className={selectedConnectionMode === "offline" ? styles.connectionModeActive : ""}
                  aria-pressed={selectedConnectionMode === "offline"}
                  onClick={() => selectConnectionMode("offline")}
                >Hors ligne</button>
              </div>
            </div>
            {QUICK_PANELS.map((entry) => (
              <button type="button" key={entry.id} onClick={() => selectPanel(entry.id)}>
                <span aria-hidden="true">{entry.icon}</span>
                {entry.label}
              </button>
            ))}
          </nav>
        ) : null}
        <button
          ref={menuButtonRef}
          type="button"
          className={`${styles.menuButton} ${menuOpen ? styles.menuButtonOpen : ""}`}
          aria-label={menuOpen ? "Fermer le menu" : "Ouvrir le menu"}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((isOpen) => !isOpen)}
        >
          <span aria-hidden="true" />
          <span aria-hidden="true" />
          <span aria-hidden="true" />
          <small>Menu</small>
        </button>
        </HudSurface>
      </div>

      {panel ? (
        <HudSurface
          className={`${styles.panel} ${
            displayedPanel === "stats"
              ? styles.statsPanel
              : displayedPanel === "map"
                ? styles.mapPanel
                : styles.inventoryPanel
          }`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="game-panel-title"
        >
          <header className={styles.panelHeader}>
            <div>
              <span className={styles.panelEyebrow}>{displayedPanel === "map" ? "Exploration" : "Personnage"}</span>
              <h2 id="game-panel-title">{displayedPanel ? PANEL_LABELS[displayedPanel] : "Personnage"}</h2>
            </div>
            <button
              ref={closeButtonRef}
              type="button"
              className={styles.closeButton}
              onClick={closePanel}
              aria-label="Fermer le panneau"
            >
              ×
            </button>
          </header>

          <div className={styles.panelScroller} key={displayedPanel}>
            {displayedPanel === "inventory" ? (
              <CombinedInventoryPanel
                slots={equipment}
                items={inventory}
                capacity={inventoryCapacity}
                gold={gold}
                onEquip={onEquip}
                onUnequip={onUnequip}
                onUseItem={onUseItem}
              />
            ) : null}
            {displayedPanel === "stats" ? <StatsPanel stats={stats} rank={rank} level={level} /> : null}
            {displayedPanel === "map" ? (
              <RiftMapPanel rifts={rifts} playerPosition={playerMapPosition} mapSize={mapSize} />
            ) : null}
          </div>
        </HudSurface>
      ) : null}

      {riftCompletion ? (
        <HudSurface className={styles.riftCompletionOverlay}>
          <section
            className={styles.riftCompletionCard}
            role="dialog"
            aria-modal="true"
            aria-labelledby="rift-completion-title"
          >
            <span className={styles.riftCompletionRune} aria-hidden="true">◇</span>
            <small>Brèche stabilisée</small>
            <h2 id="rift-completion-title">Portail rang {riftCompletion.rank} terminé</h2>
            <div className={styles.riftCompletionSummary}>
              <span><small>XP du portail</small><strong>+{formatCompact(riftCompletion.generalXp)}</strong></span>
              <span><small>Temps passé</small><strong>{formatRiftDuration(riftCompletion.elapsedMs)}</strong></span>
            </div>
            <div className={styles.riftCompletionLoot}>
              <small>Récompenses récupérées</small>
              <div>
                {riftCompletion.items.map((item) => (
                  <span key={item.id} className={styles[`rarity_${item.rarity ?? "common"}`]}>
                    <i aria-hidden="true">{item.icon}</i>
                    <strong>{item.name}</strong>
                    <b>×{item.quantity ?? 1}</b>
                  </span>
                ))}
              </div>
            </div>
            <button type="button" onClick={onDismissRiftCompletion}>Continuer l’aventure</button>
          </section>
        </HudSurface>
      ) : null}

      <div className={styles.orientationGate} role="status" aria-live="polite">
        <span className={styles.rotatePhone} aria-hidden="true">▯</span>
        <strong>Tournez votre téléphone</strong>
        <p>Le jeu se joue maintenant en mode paysage.</p>
      </div>

      {!alive ? (
        <HudSurface className={styles.deathOverlay}>
          <div className={styles.deathCard} role="dialog" aria-modal="true" aria-labelledby="death-title">
            <span className={styles.deathRune} aria-hidden="true">◇</span>
            <p>Votre aventure n’est pas terminée</p>
            <h2 id="death-title">Vous êtes tombé au combat</h2>
            <button type="button" onClick={onRespawn}>Réapparaître en ville</button>
          </div>
        </HudSurface>
      ) : null}
    </div>
  );
}
