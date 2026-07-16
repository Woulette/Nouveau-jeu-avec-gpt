import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  ADVENTURER_FRAME,
  ADVENTURER_LEFT_WALK_ASSET,
} from "./visualTypes";

describe("handcrafted adventurer assets", () => {
  it("keeps the left-walk sheet aligned to four 48x64 frames", () => {
    const assetPath = join(
      process.cwd(),
      "public",
      ADVENTURER_LEFT_WALK_ASSET.path.replace(/^\//, ""),
    );
    const png = readFileSync(assetPath);

    expect(png.subarray(1, 4).toString("ascii")).toBe("PNG");
    expect(png[25]).toBe(6); // PNG color type 6: RGBA with a real alpha channel.
    expect(png.readUInt32BE(16)).toBe(
      ADVENTURER_FRAME.width * ADVENTURER_LEFT_WALK_ASSET.frameCount,
    );
    expect(png.readUInt32BE(20)).toBe(ADVENTURER_FRAME.height);
  });
});
