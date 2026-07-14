import * as Phaser from "phaser";

import type { GameHudUpdate } from "@/components/GameShell";

import { WorldScene } from "./WorldScene";

export interface CreateMmoGameOptions {
  onReady(): void;
  onHud(update: GameHudUpdate): void;
}

export function createMmoGame(container: HTMLDivElement, options: CreateMmoGameOptions) {
  const containerSize = () => {
    const bounds = container.getBoundingClientRect();
    const fallbackWidth = window.innerWidth || 320;
    const fallbackHeight = window.innerHeight || 320;
    return {
      width: Math.max(1, Math.round(bounds.width || fallbackWidth)),
      height: Math.max(1, Math.round(bounds.height || fallbackHeight)),
    };
  };
  const initialSize = containerSize();

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: container,
    width: initialSize.width,
    height: initialSize.height,
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
      width: initialSize.width,
      height: initialSize.height,
    },
    input: {
      activePointers: 2,
      touch: { capture: true },
    },
    scene: [new WorldScene(options)],
  });

  let resizeFrame = 0;
  const resizeTimers: number[] = [];
  const resizeGame = () => {
    window.cancelAnimationFrame(resizeFrame);
    resizeFrame = window.requestAnimationFrame(() => {
      if (!game.isBooted) return;
      const nextSize = containerSize();
      if (
        game.scale.gameSize.width !== nextSize.width ||
        game.scale.gameSize.height !== nextSize.height
      ) {
        game.scale.resize(nextSize.width, nextSize.height);
      }
    });
  };
  const settleOrientation = () => {
    resizeGame();
    resizeTimers.push(window.setTimeout(resizeGame, 90));
    resizeTimers.push(window.setTimeout(resizeGame, 280));
  };

  const resizeObserver = new ResizeObserver(resizeGame);
  resizeObserver.observe(container);
  window.addEventListener("orientationchange", settleOrientation);
  window.visualViewport?.addEventListener("resize", resizeGame);

  return () => {
    resizeObserver.disconnect();
    window.cancelAnimationFrame(resizeFrame);
    for (const timer of resizeTimers) window.clearTimeout(timer);
    window.removeEventListener("orientationchange", settleOrientation);
    window.visualViewport?.removeEventListener("resize", resizeGame);
    game.destroy(true);
  };
}
