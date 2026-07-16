import { describe, expect, it } from "vitest";

import { selectOfflineAssetUrls } from "./offlineCache";

describe("selectOfflineAssetUrls", () => {
  it("keeps Next chunks and local game assets but excludes API and foreign requests", () => {
    expect(
      selectOfflineAssetUrls(
        [
          "https://game.test/_next/static/chunks/phaser.js",
          "https://game.test/_next/static/chunks/realm.js?v=1",
          "https://game.test/_next/static/chunks/phaser.js",
          "https://game.test/assets/characters/adventurier-marche-gauche.png",
          "https://game.test/api/status",
          "https://elsewhere.test/_next/static/chunks/foreign.js",
          "https://elsewhere.test/assets/characters/foreign.png",
        ],
        "https://game.test",
      ),
    ).toEqual([
      "/_next/static/chunks/phaser.js",
      "/_next/static/chunks/realm.js?v=1",
      "/assets/characters/adventurier-marche-gauche.png",
    ]);
  });
});
