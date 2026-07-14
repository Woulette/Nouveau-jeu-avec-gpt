import {
  persistedRiftWorldStateSchema,
  type PersistedRiftWorldState,
} from "../shared/rift-persistence";

export const RIFT_WORLD_STORAGE_KEY = "nouveau-mmo-rift-world-v1";

export function loadSavedRiftWorldState(): PersistedRiftWorldState | undefined {
  try {
    const raw = window.localStorage.getItem(RIFT_WORLD_STORAGE_KEY);
    if (!raw) return undefined;
    const parsed = persistedRiftWorldStateSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}
export function saveRiftWorldState(state: PersistedRiftWorldState): void {
  try {
    const validated = persistedRiftWorldStateSchema.parse(state);
    window.localStorage.setItem(RIFT_WORLD_STORAGE_KEY, JSON.stringify(validated));
  } catch {
    // Disabled/full storage must not stop the local simulation.
  }
}
