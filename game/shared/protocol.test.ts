import { describe, expect, it } from "vitest";

import { HEADQUARTERS_MASTER_ID } from "./awakening";
import { decodeClientMessage } from "./protocol";

describe("awakening client protocol", () => {
  it("accepts sequenced headquarters interaction and awakening commands", () => {
    expect(
      decodeClientMessage(JSON.stringify({
        type: "interact-npc",
        npcId: HEADQUARTERS_MASTER_ID,
        sequence: 4,
      })),
    ).toEqual({
      success: true,
      message: {
        type: "interact-npc",
        npcId: HEADQUARTERS_MASTER_ID,
        sequence: 4,
      },
    });

    for (const combatPath of ["melee", "ranged", "magic"] as const) {
      expect(
        decodeClientMessage(JSON.stringify({
          type: "awaken",
          npcId: HEADQUARTERS_MASTER_ID,
          combatPath,
          sequence: 5,
        })),
      ).toMatchObject({
        success: true,
        message: { type: "awaken", combatPath },
      });
    }
  });

  it("rejects Adventurer and arbitrary class names as awakening paths", () => {
    for (const combatPath of ["adventurer", "warrior", ""] as const) {
      expect(
        decodeClientMessage(JSON.stringify({
          type: "awaken",
          npcId: HEADQUARTERS_MASTER_ID,
          combatPath,
          sequence: 0,
        })),
      ).toMatchObject({ success: false, code: "INVALID_MESSAGE" });
    }
  });
});
