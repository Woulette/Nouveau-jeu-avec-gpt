import type { HudState } from "./events";

const SAVE_KEY = "nouveau-mmo-rpg-save-v1";

export interface LocalSave {
  playerId: string;
  name: string;
  tileX: number;
  tileY: number;
  hud: Pick<
    HudState,
    "hp" | "maxHp" | "mp" | "maxMp" | "xp" | "xpNeeded" | "level" | "rank" | "inventory" | "equipment" | "stats"
  >;
}

function randomId() {
  return "p-" + crypto.randomUUID().slice(0, 8);
}

export function loadSave(): LocalSave | null {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    return raw ? (JSON.parse(raw) as LocalSave) : null;
  } catch {
    return null;
  }
}

export function createSave(hud: HudState): LocalSave {
  return {
    playerId: randomId(),
    name: "Aventurier-" + Math.floor(100 + Math.random() * 900),
    tileX: 10,
    tileY: 15,
    hud: {
      hp: hud.hp,
      maxHp: hud.maxHp,
      mp: hud.mp,
      maxMp: hud.maxMp,
      xp: hud.xp,
      xpNeeded: hud.xpNeeded,
      level: hud.level,
      rank: hud.rank,
      inventory: hud.inventory,
      equipment: hud.equipment,
      stats: hud.stats,
    },
  };
}

export function saveLocal(save: LocalSave) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    // The game remains playable when storage is disabled.
  }
}
