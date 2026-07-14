"use client";

import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
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

export interface HudReward {
  id: string;
  name: string;
  icon: string;
  quantity?: number;
  rarity?: HudItemRarity;
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
  rank: string;
  power: number;
  connectionStatus: HudConnectionStatus;
  playerName?: string;
  skillSlots?: HudSkillSlot[];
  inventory?: HudInventoryItem[];
  inventoryCapacity?: number;
  equipment?: HudEquipmentSlot[];
  stats?: HudStatBreakdown[];
  rewards?: HudReward[];
  alive?: boolean;
  activePanel?: HudPanel;
  onPanelChange?: (panel: HudPanel) => void;
  onPanelClose?: (panel: Exclude<HudPanel, null>) => void;
  onEquip?: (itemId: string) => void;
  onUnequip?: (slotId: string) => void;
  onSkillActivate?: (skillId: string) => void;
  onRespawn?: () => void;
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
  { id: "boots", label: "Bottes", icon: "⌁", className: "equipmentSlotBoots" },
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
  inventory,
  onEquip,
  onUnequip,
}: {
  slots: HudEquipmentSlot[];
  inventory: HudInventoryItem[];
  onEquip?: (itemId: string) => void;
  onUnequip?: (slotId: string) => void;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const slotById = new Map(slots.map((slot) => [slot.id.toLowerCase(), slot]));
  const placedSlotIds = new Set<string>();
  const layoutSlots = EQUIPMENT_LAYOUT.map((layout) => {
    const aliases =
      layout.id === "head"
        ? ["head", "helmet", "coiffe"]
        : layout.id === "armor"
          ? ["armor", "armour", "chest", "torso"]
          : layout.id === "boots"
            ? ["boots", "feet", "shoes"]
            : ["weapon", "mainhand", "main-hand"];
    const slot = aliases.map((alias) => slotById.get(alias)).find(Boolean);
    if (slot) {
      placedSlotIds.add(slot.id);
    }
    return {
      ...layout,
      slot: slot ?? { id: layout.id, label: layout.label, icon: layout.icon, item: null },
    };
  });
  const extraSlots = slots.filter((slot) => !placedSlotIds.has(slot.id));
  const equippableItems = inventory.filter((item) => item.equippable !== false);

  return (
    <div className={styles.equipmentPanelBody}>
      <div
        className={styles.equipmentStage}
        aria-label="Équipement porté par le personnage"
        ref={stageRef}
      >
        <div className={styles.mannequin} aria-hidden="true">
          <span className={styles.mannequinHead} />
          <span className={styles.mannequinBody} />
          <span className={styles.mannequinArmLeft} />
          <span className={styles.mannequinArmRight} />
          <span className={styles.mannequinLegLeft} />
          <span className={styles.mannequinLegRight} />
          <span className={styles.mannequinAura} />
          {layoutSlots.map(({ id, slot }) =>
            slot.item ? (
              <span
                className={`${styles.mannequinEquipped} ${styles[`mannequinEquipped_${id}`]}`}
                key={`worn-${id}`}
              >
                {slot.item.icon ?? slot.icon ?? "◆"}
              </span>
            ) : null,
          )}
        </div>

        {layoutSlots.map(({ className, slot }) => {
          const item = slot.item;
          return (
            <button
              type="button"
              className={`${styles.equipmentSlotCard} ${styles[className]}`}
              key={slot.id}
              disabled={!item}
              onClick={() => item && onUnequip?.(slot.id)}
              aria-label={item ? `${slot.label} : ${item.name}. Toucher pour retirer.` : `${slot.label} vide`}
            >
              <span className={styles.equipmentSlotLabel}>{slot.label}</span>
              <span className={styles.equipmentSlotIcon} aria-hidden="true">
                {item?.icon ?? slot.icon ?? "◇"}
              </span>
              <strong>{item?.name ?? "Vide"}</strong>
              {item ? <small>Toucher pour retirer</small> : <small>Emplacement libre</small>}
            </button>
          );
        })}
      </div>

      {extraSlots.length ? (
        <div className={styles.extraEquipmentSlots}>
          {extraSlots.map((slot) => (
            <button
              type="button"
              className={styles.extraEquipmentSlot}
              key={slot.id}
              disabled={!slot.item}
              onClick={() => slot.item && onUnequip?.(slot.id)}
            >
              <span aria-hidden="true">{slot.item?.icon ?? slot.icon ?? "◇"}</span>
              <span>{slot.label}</span>
              <strong>{slot.item?.name ?? "Vide"}</strong>
            </button>
          ))}
        </div>
      ) : null}

      <section className={styles.equipmentInventory} aria-labelledby="equippable-items-title">
        <div className={styles.sectionHeading}>
          <span id="equippable-items-title">Objets équipables</span>
          <span className={styles.capacity}>{equippableItems.length}</span>
        </div>
        {equippableItems.length ? (
          <div className={styles.equipmentInventoryGrid}>
            {equippableItems.map((item) => (
              <button
                type="button"
                key={item.id}
                className={`${styles.equipmentInventoryItem} ${styles[`rarity_${item.rarity ?? "common"}`]}`}
                disabled={item.equipped || item.canEquip === false}
                onClick={() => {
                  onEquip?.(item.id);
                  stageRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                aria-label={
                  item.equipped
                    ? `${item.name}, déjà équipé`
                    : item.canEquip === false
                      ? `${item.name}, rang insuffisant`
                      : `Équiper ${item.name}`
                }
              >
                <span aria-hidden="true">{item.icon ?? "◆"}</span>
                <span className={styles.equipmentInventoryCopy}>
                  <strong>{item.name}</strong>
                  <small>
                    {item.equipped ? "Équipé" : item.canEquip === false ? "Rang insuffisant" : "Toucher pour équiper"}
                  </small>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className={styles.panelHint}>Aucun équipement dans le sac pour le moment.</p>
        )}
      </section>
    </div>
  );
}

function StatsPanel({ stats, rank }: { stats: HudStatBreakdown[]; rank: string }) {
  if (!stats.length) {
    return <p className={styles.emptyState}>Les statistiques seront disponibles prochainement.</p>;
  }

  return (
    <div className={styles.statsList}>
      <aside className={styles.rankBonus} aria-label={`Bonus du rang ${rank}`}>
        <span>
          <small>Bonus permanent du rang {rank}</small>
          Dégâts · PV · Défense
        </span>
        <strong>+{RANK_BONUSES[rank.toUpperCase()] ?? 0}%</strong>
      </aside>
      {stats.map((stat) => {
        const hasTraining = typeof stat.xp === "number" && typeof stat.xpToNext === "number";
        const presentation = STAT_PRESENTATION[stat.id.toLowerCase()];
        return (
          <article className={styles.statCard} key={stat.id}>
            <div className={styles.statTopline}>
              <span className={styles.statIcon} aria-hidden="true">
                {presentation?.icon ?? stat.icon ?? "✦"}
              </span>
              <div className={styles.statIdentity}>
                <strong>{stat.label}</strong>
                <p>{stat.description ?? presentation?.description ?? "Améliore votre efficacité en combat."}</p>
              </div>
              <span className={styles.statTotal} aria-label={`${stat.label} totale : ${formatCompact(stat.total)}`}>
                <small>Total</small>
                {formatCompact(stat.total)}
              </span>
            </div>
            <div className={styles.statBreakdown}>
              <span><small>Base</small>{formatCompact(stat.base)}</span>
              <span><small>Combat</small>+{formatCompact(stat.training ?? 0)}</span>
              <span><small>Équipement</small>+{formatCompact(stat.equipment ?? 0)}</span>
            </div>
            {hasTraining ? (
              <div className={styles.trainingRow} aria-label={`Progression de ${stat.label}`}>
                <div className={styles.trainingLabel}>
                  <span>Progression au combat</span>
                  <small>
                    {formatCompact(stat.xp ?? 0)} / {formatCompact(stat.xpToNext ?? 0)} XP
                  </small>
                </div>
                <div className={styles.trainingTrack} style={meterStyle(stat.xp ?? 0, stat.xpToNext ?? 0)}>
                  <span />
                </div>
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
  rewards = [],
  alive = true,
  activePanel,
  onPanelChange,
  onPanelClose,
  onEquip,
  onUnequip,
  onSkillActivate,
  onRespawn,
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

  return (
    <div
      className={`${styles.hud} ${panel ? styles.hudPanelOpen : ""}`}
      aria-label="Interface du jeu"
    >
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

          <div className={styles.panelScroller} key={panel}>
            {panel === "inventory" ? (
              <InventoryPanel items={inventory} capacity={inventoryCapacity} onEquip={onEquip} />
            ) : null}
            {panel === "equipment" ? (
              <EquipmentPanel slots={equipment} inventory={inventory} onEquip={onEquip} onUnequip={onUnequip} />
            ) : null}
            {panel === "stats" ? <StatsPanel stats={stats} rank={rank} /> : null}
          </div>
        </HudSurface>
      ) : null}

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
