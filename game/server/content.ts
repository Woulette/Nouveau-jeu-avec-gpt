// Kept as a compatibility entry point for server imports. The source of truth
// lives in game/shared/world.ts so the renderer and simulation cannot diverge.
export {
  STARTER_LANDMARKS,
  STARTER_MAP,
  STARTER_MONSTERS,
  WORLD_HEIGHT,
  WORLD_TILE_SIZE,
  WORLD_WIDTH,
  type MonsterDefinition,
  type WorldLandmark,
  type WorldLandmarkKind,
} from "../shared/world";
