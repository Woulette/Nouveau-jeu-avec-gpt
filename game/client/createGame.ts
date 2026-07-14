import * as Phaser from "phaser";

import type { GameHudUpdate } from "@/components/GameShell";

import { WorldScene } from "./WorldScene";

export interface CreateMmoGameOptions {
  onReady(): void;
  onHud(update: GameHudUpdate): void;
}

export function createMmoGame(container: HTMLDivElement, options: CreateMmoGameOptions) {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: container,
    width: Math.max(320, container.clientWidth || window.innerWidth),
    height: Math.max(320, container.clientHeight || window.innerHeight),
    backgroundColor: "#10151b",
    pixelArt: true,
    antialias: false,
    antialiasGL: false,
    roundPixels: true,
    render: {
      pixelArt: true,
      antialias: false,
      roundPixels: true,
      powerPreference: "high-performance",
    },
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      parent: container,
      width: "100%",
      height: "100%",
    },
    input: {
      activePointers: 2,
      touch: { capture: true },
    },
    scene: [new WorldScene(options)],
  });

  return () => game.destroy(true);
}
