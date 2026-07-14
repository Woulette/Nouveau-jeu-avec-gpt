import {
  CONNECTION_MODE_STORAGE_KEY,
  PLAYER_SAVE_STORAGE_KEY,
  PLAYER_SAVE_VERSION,
  localPlayerSaveSchema,
  persistedPlayerProfileSchema,
  isProfileProgressRegression,
  profileFromPlayerSnapshot,
  type LocalPlayerSave,
  type PersistedPlayerProfile,
  type PreferredConnectionMode,
} from "../shared/save";
import type { PlayerSnapshot } from "../shared/types";

export function loadPlayerSave(): LocalPlayerSave | null {
  try {
    const raw = window.localStorage.getItem(PLAYER_SAVE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = localPlayerSaveSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function loadSavedProfile(): PersistedPlayerProfile | undefined {
  return loadPlayerSave()?.profile;
}

export function savePlayerSnapshot(player: PlayerSnapshot, savedAt = Date.now()): boolean {
  return savePlayerProfile(profileFromPlayerSnapshot(player), savedAt);
}

export function savePlayerProfile(profile: PersistedPlayerProfile, savedAt = Date.now()): boolean {
  try {
    const validatedProfile = persistedPlayerProfileSchema.parse(profile);
    const previous = loadPlayerSave();
    if (previous && isProfileProgressRegression(validatedProfile, previous.profile)) {
      return false;
    }
    const save = localPlayerSaveSchema.parse({
      version: PLAYER_SAVE_VERSION,
      savedAt,
      profile: validatedProfile,
    });
    window.localStorage.setItem(
      PLAYER_SAVE_STORAGE_KEY,
      JSON.stringify(save),
    );
    return true;
  } catch {
    // Private browsing and full/disabled storage must never make the game unplayable.
    return false;
  }
}

export function loadPreferredConnectionMode(): PreferredConnectionMode {
  try {
    return window.localStorage.getItem(CONNECTION_MODE_STORAGE_KEY) === "offline"
      ? "offline"
      : "online";
  } catch {
    return "online";
  }
}

export function savePreferredConnectionMode(mode: PreferredConnectionMode): void {
  try {
    window.localStorage.setItem(CONNECTION_MODE_STORAGE_KEY, mode);
  } catch {
    // The selected mode remains active for this page even if storage is disabled.
  }
}
