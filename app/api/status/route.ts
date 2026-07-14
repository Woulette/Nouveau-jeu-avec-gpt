import { REALM_SNAPSHOT_RATE, REALM_TICK_RATE } from "@/game/server/realm";
import { STARTER_MAP } from "@/game/shared/world";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    ok: true,
    transport: "vercel-websocket-beta",
    persistence: "instance-memory",
    zone: STARTER_MAP.id,
    world: { width: STARTER_MAP.width, height: STARTER_MAP.height },
    tickRate: REALM_TICK_RATE,
    snapshotRate: REALM_SNAPSHOT_RATE,
  });
}
