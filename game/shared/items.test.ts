import { describe, expect, it } from "vitest";
import {
  EQUIPMENT_SLOTS,
  ITEM_CATALOG,
  STARTER_INVENTORY,
  meetsItemRank,
} from "./items";

describe("authoritative item metadata", () => {
  it("exposes the six spatial equipment slots", () => {
    expect(EQUIPMENT_SLOTS).toEqual(["head", "weapon", "armor", "legs", "boots", "ring"]);
  });

  it("gives every item a stable inventory filter category", () => {
    expect(new Set(Object.values(ITEM_CATALOG).map((item) => item.category))).toEqual(
      new Set(["consumable", "resource", "equipment"]),
    );
  });

  it("lets rankless players use adventurer gear but blocks genuinely ranked gear", () => {
    const expectedStarterSlots = {
      head: "coiffe-aventurier",
      weapon: "dague-emoussee",
      armor: "tunique-aventurier",
      legs: "pantalon-aventurier",
      boots: "bottes-aventurier",
      ring: "anneau-cuivre",
    } as const;

    for (const slot of EQUIPMENT_SLOTS) {
      const itemId = expectedStarterSlots[slot];
      const item = ITEM_CATALOG[itemId];
      expect(STARTER_INVENTORY[itemId]).toBe(1);
      expect(item.equipmentSlot).toBe(slot);
      expect(item.requiredRank).toBeUndefined();
      expect(meetsItemRank(null, item.requiredRank)).toBe(true);
    }

    expect(meetsItemRank(null, "E")).toBe(false);
    expect(meetsItemRank("E", "E")).toBe(true);
    expect(meetsItemRank("E", "D")).toBe(false);
  });
});
