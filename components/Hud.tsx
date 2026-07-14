"use client";

import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from "react";

import styles from "./Hud.module.css";

export type HudConnectionStatus = "connected" | "connecting" | "local" | "offline";
export type HudPanel = "inventory" | "equipment" | "stats" | null;
export type HudItemRarity = "common" | "uncommon" | "rare" | "epic" | "legendary";

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
}

export interface HudEquipmentSlot {
  id: string;
  label: string;
  icon?: string;
  item?: HudInventoryItem | null;
}

export interface HudStatBreakdown {
  id: string;
  label: string;
  icon?: string;
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
  rank: string;
  power: number;
  connectionStatus: HudConnectionStatus;
  playerName?: string;
  skillSlots?: HudSkillSlot[];
  inventory?: HudInventoryItem[];
  inventoryCapacity?: number;
  equipment?: HudEquipmentSlot[];
  stats?: HudStatBreakdown[];
  activePanel?: HudPanel;
  onPanelChange?: (panel: HudPanel) => void;
  onPanelClose?: (panel: Exclude<HudPanel, null>) => void;
  onEquip?: (itemId: string) => void;
  onUnequip?: (slotId: string) => void;
  onSkillActivate?: (skillId: string) => void;
}

type MeterTone = "health" | "mana" | "xp";

const PANEL_LABELS: Record<Exclude<HudPanel, null>, string> = {
  inventory: "Inventaire",
  equipment: "Équipement",
  stats: "Statistiques",
};

const PANEL_ICONS: Record<Exclude<HudPanel, null>, string> = {
  inventory: "◇",
  equipment: "♜",
  stats: "✦",
};

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

function HudSurface({ className, children }: { className: string; children: ReactNode }) {
  return (
    <div
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

function InventoryPanel({
  items,
  capacity,
  onEquip,
}: {
  items: HudInventoryItem[];
  capacity: number;
  onEquip?: (itemId: string) => void;
}) {
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const selectedItem = items.find((item) => item.id === selectedItemId) ?? null;
  const visibleCapacity = Math.max(items.length, Math.min(Math.max(capacity, 8), 40));
  const emptySlots = Math.max(0, visibleCapacity - items.length);

  return (
    <div className={styles.panelBody}>
      <div className={styles.sectionHeading}>
        <span>Sac d’aventurier</span>
        <span className={styles.capacity}>
          {items.length}/{capacity}
        </span>
      </div>

      <div className={styles.inventoryGrid} aria-label="Objets dans l’inventaire">
        {items.map((item) => {
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
            >
              <span className={styles.itemIcon} aria-hidden="true">
                {item.icon ?? "◆"}
              </span>
              {(item.quantity ?? 1) > 1 ? (
                <span className={styles.itemQuantity}>×{item.quantity}</span>
              ) : null}
              {item.equipped ? <span className={styles.equippedMark}>E</span> : null}
            </button>
          );
        })}
        {Array.from({ length: emptySlots }, (_, index) => (
          <span className={`${styles.itemSlot} ${styles.emptyItemSlot}`} key={`empty-${index}`} />
        ))}
      </div>

      {selectedItem ? (
        <article className={styles.itemDetails} aria-live="polite">
          <div className={styles.itemDetailsHeader}>
            <span className={`${styles.detailIcon} ${styles[`rarity_${selectedItem.rarity ?? "common"}`]}`}>
              {selectedItem.icon ?? "◆"}
            </span>
            <div>
              <h3>{selectedItem.name}</h3>
              <p className={styles.rarityLabel}>{RARITY_LABELS[selectedItem.rarity ?? "common"]}</p>
            </div>
          </div>
          {selectedItem.description ? <p className={styles.itemDescription}>{selectedItem.description}</p> : null}
          {selectedItem.stats?.length ? (
            <dl className={styles.itemStats}>
              {selectedItem.stats.map((stat) => (
                <div key={stat.label}>
                  <dt>{stat.label}</dt>
                  <dd>{stat.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          {selectedItem.requiredRank ? (
            <p className={styles.requirement}>Rang requis : {selectedItem.requiredRank}</p>
          ) : null}
          {selectedItem.equippable !== false ? (
            <button
              type="button"
              className={styles.primaryAction}
              disabled={selectedItem.canEquip === false || selectedItem.equipped}
              onClick={() => onEquip?.(selectedItem.id)}
            >
              {selectedItem.equipped
                ? "Déjà équipé"
                : selectedItem.canEquip === false
                  ? "Rang insuffisant"
                  : "Équiper"}
            </button>
          ) : null}
        </article>
      ) : (
        <p className={styles.panelHint}>Touchez un objet pour afficher ses détails.</p>
      )}
    </div>
  );
}

function EquipmentPanel({
  slots,
  onUnequip,
}: {
  slots: HudEquipmentSlot[];
  onUnequip?: (slotId: string) => void;
}) {
  if (!slots.length) {
    return <p className={styles.emptyState}>Aucun emplacement d’équipement disponible.</p>;
  }

  return (
    <div className={styles.equipmentList}>
      {slots.map((slot) => (
        <article className={styles.equipmentRow} key={slot.id}>
          <span className={styles.equipmentIcon} aria-hidden="true">
            {slot.item?.icon ?? slot.icon ?? "◇"}
          </span>
          <div className={styles.equipmentCopy}>
            <span className={styles.equipmentLabel}>{slot.label}</span>
            <strong>{slot.item?.name ?? "Emplacement vide"}</strong>
            {slot.item?.requiredRank ? <small>Rang {slot.item.requiredRank}</small> : null}
          </div>
          {slot.item ? (
            <button
              type="button"
              className={styles.ghostAction}
              onClick={() => onUnequip?.(slot.id)}
              aria-label={`Retirer ${slot.item.name}`}
            >
              Retirer
            </button>
          ) : null}
        </article>
      ))}
    </div>
  );
}

function StatsPanel({ stats }: { stats: HudStatBreakdown[] }) {
  if (!stats.length) {
    return <p className={styles.emptyState}>Les statistiques seront disponibles prochainement.</p>;
  }

  return (
    <div className={styles.statsList}>
      {stats.map((stat) => {
        const hasTraining = typeof stat.xp === "number" && typeof stat.xpToNext === "number";
        return (
          <article className={styles.statCard} key={stat.id}>
            <div className={styles.statTopline}>
              <span className={styles.statIcon} aria-hidden="true">
                {stat.icon ?? "✦"}
              </span>
              <strong>{stat.label}</strong>
              <span className={styles.statTotal}>{formatCompact(stat.total)}</span>
            </div>
            <div className={styles.statBreakdown}>
              <span>Base {formatCompact(stat.base)}</span>
              <span>Entraînement +{formatCompact(stat.training ?? 0)}</span>
              <span>Équipement +{formatCompact(stat.equipment ?? 0)}</span>
            </div>
            {hasTraining ? (
              <div className={styles.trainingRow}>
                <div className={styles.trainingTrack} style={meterStyle(stat.xp ?? 0, stat.xpToNext ?? 0)}>
                  <span />
                </div>
                <small>
                  {formatCompact(stat.xp ?? 0)} / {formatCompact(stat.xpToNext ?? 0)} XP
                </small>
              </div>
            ) : (
              <small className={styles.levelOnly}>Progression par niveau général</small>
            )}
          </article>
        );
      })}
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
  connectionStatus,
  playerName = "Aventurier",
  skillSlots = [],
  inventory = [],
  inventoryCapacity = 20,
  equipment = [],
  stats = [],
  activePanel,
  onPanelChange,
  onPanelClose,
  onEquip,
  onUnequip,
  onSkillActivate,
}: HudProps) {
  const [internalPanel, setInternalPanel] = useState<HudPanel>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const panel = activePanel === undefined ? internalPanel : activePanel;

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
      if (event.key === "Escape") {
        if (panel) {
          closePanel();
        } else {
          setMenuOpen(false);
        }
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  return (
    <div className={styles.hud} aria-label="Interface du jeu">
      <HudSurface className={styles.playerCard}>
        <div className={styles.identityRow}>
          <span className={styles.avatar} aria-hidden="true">
            A
          </span>
          <div className={styles.identityCopy}>
            <strong>{playerName}</strong>
            <span>
              Niveau {level} · Rang {rank}
            </span>
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

      <HudSurface className={styles.menuDock}>
        {menuOpen ? (
          <nav className={styles.quickMenu} aria-label="Menu du personnage">
            {(Object.keys(PANEL_LABELS) as Array<Exclude<HudPanel, null>>).map((panelId) => (
              <button type="button" key={panelId} onClick={() => selectPanel(panelId)}>
                <span aria-hidden="true">{PANEL_ICONS[panelId]}</span>
                {PANEL_LABELS[panelId]}
              </button>
            ))}
          </nav>
        ) : null}
        <button
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

      {panel ? (
        <HudSurface className={styles.panel}>
          <header className={styles.panelHeader}>
            <div>
              <span className={styles.panelEyebrow}>Personnage</span>
              <h2>{PANEL_LABELS[panel]}</h2>
            </div>
            <button type="button" className={styles.closeButton} onClick={closePanel} aria-label="Fermer le panneau">
              ×
            </button>
          </header>

          <nav className={styles.panelTabs} aria-label="Sections du personnage">
            {(Object.keys(PANEL_LABELS) as Array<Exclude<HudPanel, null>>).map((panelId) => (
              <button
                type="button"
                key={panelId}
                className={panel === panelId ? styles.activeTab : ""}
                aria-current={panel === panelId ? "page" : undefined}
                onClick={() => selectPanel(panelId)}
              >
                <span aria-hidden="true">{PANEL_ICONS[panelId]}</span>
                <small>{PANEL_LABELS[panelId]}</small>
              </button>
            ))}
          </nav>

          <div className={styles.panelScroller}>
            {panel === "inventory" ? (
              <InventoryPanel items={inventory} capacity={inventoryCapacity} onEquip={onEquip} />
            ) : null}
            {panel === "equipment" ? <EquipmentPanel slots={equipment} onUnequip={onUnequip} /> : null}
            {panel === "stats" ? <StatsPanel stats={stats} /> : null}
          </div>
        </HudSurface>
      ) : null}
    </div>
  );
}
