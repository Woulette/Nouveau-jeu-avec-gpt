import type Phaser from "phaser";

import {
  ADVENTURER_ACTIONS,
  ADVENTURER_FRAME,
  ADVENTURER_FRAME_COUNTS,
  CARDINAL_DIRECTIONS,
  CREATURE_FRAME_COUNTS,
  CREATURE_KINDS,
  VISUAL_ANIMATIONS,
  VISUAL_KEYS,
  adventurerTextureKey,
  creatureTextureKey,
  portalTextureKey,
  type AdventurerAction,
  type CardinalDirection,
  type CreatureKind,
} from "./visualTypes";

type Graphics = Phaser.GameObjects.Graphics;

const C = {
  ink: 0x12131a,
  night: 0x1b2230,
  slate: 0x30384a,
  stone: 0x555e70,
  stoneLight: 0x8c96a5,
  grassDeep: 0x17281d,
  grass: 0x2f4930,
  grassLight: 0x536946,
  moss: 0x71805a,
  dirtDeep: 0x3e342b,
  dirt: 0x66503a,
  dirtLight: 0x967653,
  woodDeep: 0x3b2721,
  wood: 0x6b4230,
  woodLight: 0xa16a45,
  goldDeep: 0x6e4824,
  gold: 0xc08a3d,
  goldLight: 0xf0c56b,
  skinDeep: 0x754832,
  skin: 0xc88359,
  skinLight: 0xefbc83,
  hairDeep: 0x261c1b,
  hair: 0x5e3929,
  clothDeep: 0x263246,
  cloth: 0x3e5b70,
  clothLight: 0x6c8791,
  red: 0xc83e4d,
  blue: 0x2a9dd8,
  violetDeep: 0x241b52,
  violet: 0x7045d7,
  violetLight: 0xc16bff,
  warm: 0xffd27a,
  white: 0xf3e7cc,
} as const;

function block(
  graphics: Graphics,
  color: number,
  x: number,
  y: number,
  width: number,
  height: number,
  alpha = 1,
) {
  graphics.fillStyle(color, alpha);
  graphics.fillRect(Math.round(x), Math.round(y), Math.round(width), Math.round(height));
}

function pixelLine(
  graphics: Graphics,
  color: number,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  size = 1,
  alpha = 1,
) {
  let x = Math.round(startX);
  let y = Math.round(startY);
  const targetX = Math.round(endX);
  const targetY = Math.round(endY);
  const dx = Math.abs(targetX - x);
  const sx = x < targetX ? 1 : -1;
  const dy = -Math.abs(targetY - y);
  const sy = y < targetY ? 1 : -1;
  let error = dx + dy;

  for (;;) {
    block(graphics, color, x, y, size, size, alpha);
    if (x === targetX && y === targetY) break;
    const doubled = error * 2;
    if (doubled >= dy) {
      error += dy;
      x += sx;
    }
    if (doubled <= dx) {
      error += dx;
      y += sy;
    }
  }
}

function texture(
  scene: Phaser.Scene,
  key: string,
  width: number,
  height: number,
  draw: (graphics: Graphics) => void,
) {
  if (scene.textures.exists(key)) return;

  const graphics = scene.make.graphics({ x: 0, y: 0 }, false);
  draw(graphics);
  graphics.generateTexture(key, width, height);
  graphics.destroy();
}

function noise(
  graphics: Graphics,
  seed: number,
  colors: readonly number[],
  amount: number,
  width: number,
  height: number,
  inset = 0,
) {
  let state = seed >>> 0;
  for (let index = 0; index < amount; index += 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const x = inset + (state % Math.max(1, width - inset * 2));
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const y = inset + (state % Math.max(1, height - inset * 2));
    const color = colors[(state >>> 8) % colors.length];
    block(graphics, color, x, y, state % 5 === 0 ? 2 : 1, 1);
  }
}

function createTerrain(scene: Phaser.Scene) {
  texture(scene, VISUAL_KEYS.terrain.grass, 32, 32, (g) => {
    block(g, C.grass, 0, 0, 32, 32);
    noise(g, 0x51a7, [C.grassDeep, C.grassLight, C.moss], 26, 32, 32, 1);
    block(g, C.grassLight, 6, 8, 1, 3);
    block(g, C.grassDeep, 20, 21, 1, 3);
    block(g, C.moss, 25, 6, 2, 1);
  });

  texture(scene, VISUAL_KEYS.terrain.grassAlt, 32, 32, (g) => {
    block(g, 0x344f32, 0, 0, 32, 32);
    noise(g, 0x91f3, [C.grassDeep, C.grass, C.moss], 32, 32, 32, 1);
    block(g, C.moss, 12, 14, 1, 4);
    block(g, C.grassDeep, 23, 4, 2, 2);
    block(g, 0xb6a860, 4, 25, 1, 1);
  });

  texture(scene, VISUAL_KEYS.terrain.dirt, 32, 32, (g) => {
    block(g, C.dirt, 0, 0, 32, 32);
    noise(g, 0xd173, [C.dirtDeep, C.dirtLight, C.woodDeep], 31, 32, 32, 1);
    block(g, C.dirtLight, 4, 7, 4, 1);
    block(g, C.dirtDeep, 18, 23, 5, 1);
  });

  texture(scene, VISUAL_KEYS.terrain.path, 32, 32, (g) => {
    block(g, 0x705a43, 0, 0, 32, 32);
    noise(g, 0x8ab9, [C.dirtDeep, C.dirtLight, 0x80674b], 24, 32, 32, 1);
    block(g, 0xaa8960, 8, 5, 5, 1);
    block(g, C.dirtDeep, 21, 14, 6, 1);
    block(g, 0x4d4034, 2, 27, 4, 1);
  });

  texture(scene, VISUAL_KEYS.terrain.cobble, 32, 32, (g) => {
    block(g, 0x3b3c42, 0, 0, 32, 32);
    const rows = [0, 7, 15, 23, 31];
    for (const y of rows) block(g, C.ink, 0, y, 32, 1, 0.75);
    for (let row = 0; row < 4; row += 1) {
      const offset = row % 2 === 0 ? 4 : 12;
      for (let x = offset; x < 32; x += 16) block(g, C.ink, x, rows[row], 1, 8, 0.75);
    }
    noise(g, 0xc0bb, [C.stone, C.stoneLight, C.slate], 23, 32, 32, 1);
  });

  texture(scene, VISUAL_KEYS.terrain.water, 32, 32, (g) => {
    block(g, 0x17465e, 0, 0, 32, 32);
    block(g, 0x245f78, 2, 5, 11, 2);
    block(g, 0x2e7890, 8, 7, 12, 1);
    block(g, 0x133a53, 17, 15, 13, 2);
    block(g, 0x2e7890, 1, 24, 9, 1);
    block(g, 0x245f78, 20, 27, 10, 2);
  });

  texture(scene, VISUAL_KEYS.terrain.riftGround, 32, 32, (g) => {
    block(g, 0x222532, 0, 0, 32, 32);
    noise(g, 0x0f17, [C.ink, C.slate, C.violetDeep], 32, 32, 32, 1);
    block(g, C.violet, 3, 24, 7, 1, 0.8);
    block(g, C.violetLight, 8, 23, 1, 2, 0.8);
    block(g, C.violet, 22, 6, 1, 6, 0.65);
  });
}

function createProps(scene: Phaser.Scene) {
  texture(scene, VISUAL_KEYS.props.rock, 32, 32, (g) => {
    block(g, C.ink, 5, 24, 23, 4, 0.35);
    block(g, C.night, 6, 15, 22, 10);
    block(g, C.slate, 8, 10, 16, 16);
    block(g, C.stone, 10, 8, 11, 5);
    block(g, C.stoneLight, 11, 9, 6, 2);
    block(g, C.night, 21, 14, 5, 9);
    block(g, C.grassLight, 5, 25, 6, 2);
  });

  texture(scene, VISUAL_KEYS.props.bush, 48, 40, (g) => {
    block(g, C.ink, 7, 32, 34, 4, 0.35);
    block(g, C.grassDeep, 5, 18, 38, 16);
    block(g, 0x29452c, 8, 11, 30, 22);
    block(g, C.grassLight, 11, 8, 13, 9);
    block(g, 0x44633c, 23, 12, 14, 9);
    block(g, C.moss, 13, 10, 6, 4);
    block(g, 0xa48b5c, 30, 17, 2, 2);
  });

  texture(scene, VISUAL_KEYS.props.tree, 64, 96, (g) => {
    block(g, C.ink, 15, 86, 36, 5, 0.35);
    block(g, C.woodDeep, 27, 55, 12, 34);
    block(g, C.wood, 29, 54, 8, 31);
    block(g, C.woodLight, 30, 57, 2, 23);
    block(g, C.grassDeep, 7, 26, 50, 34);
    block(g, 0x24412b, 13, 13, 38, 46);
    block(g, 0x365839, 19, 6, 28, 42);
    block(g, C.grassLight, 14, 21, 20, 15);
    block(g, 0x66805a, 22, 10, 17, 11);
    block(g, C.grassDeep, 5, 38, 17, 15);
    block(g, C.ink, 19, 59, 7, 4, 0.5);
  });

  texture(scene, VISUAL_KEYS.props.pine, 64, 96, (g) => {
    block(g, C.ink, 15, 86, 35, 5, 0.35);
    block(g, C.woodDeep, 28, 57, 10, 31);
    block(g, C.wood, 30, 55, 6, 31);
    block(g, C.grassDeep, 8, 49, 48, 24);
    block(g, 0x24412b, 12, 33, 40, 29);
    block(g, 0x315236, 17, 17, 30, 31);
    block(g, C.grassLight, 22, 5, 20, 30);
    block(g, 0x69805b, 26, 7, 8, 13);
    block(g, C.ink, 14, 70, 10, 3, 0.55);
  });

  texture(scene, VISUAL_KEYS.props.fence, 32, 32, (g) => {
    block(g, C.ink, 3, 25, 27, 3, 0.3);
    block(g, C.woodDeep, 4, 6, 5, 23);
    block(g, C.wood, 5, 5, 3, 22);
    block(g, C.woodDeep, 24, 6, 5, 23);
    block(g, C.wood, 25, 5, 3, 22);
    block(g, C.woodDeep, 5, 12, 23, 5);
    block(g, C.woodLight, 7, 12, 19, 2);
    block(g, C.woodDeep, 5, 20, 23, 4);
  });

  texture(scene, VISUAL_KEYS.props.sign, 32, 48, (g) => {
    block(g, C.ink, 12, 41, 10, 3, 0.3);
    block(g, C.woodDeep, 15, 20, 5, 24);
    block(g, C.wood, 16, 19, 3, 23);
    block(g, C.woodDeep, 3, 9, 27, 16);
    block(g, C.wood, 5, 8, 23, 14);
    block(g, C.woodLight, 7, 10, 18, 2);
    block(g, C.goldLight, 13, 14, 8, 2);
    block(g, C.gold, 19, 12, 2, 6);
  });

  texture(scene, VISUAL_KEYS.props.lantern, 20, 40, (g) => {
    block(g, C.ink, 8, 8, 5, 30);
    block(g, C.wood, 9, 9, 3, 28);
    block(g, C.ink, 4, 8, 12, 3);
    block(g, C.goldDeep, 3, 11, 14, 16);
    block(g, C.gold, 5, 13, 10, 12);
    block(g, C.warm, 7, 15, 6, 8);
    block(g, C.white, 9, 16, 2, 5);
    block(g, C.ink, 5, 27, 10, 2);
  });

  texture(scene, VISUAL_KEYS.props.hqWall, 32, 32, (g) => {
    block(g, C.night, 0, 0, 32, 32);
    block(g, 0x454852, 1, 1, 30, 30);
    for (let y = 2; y < 32; y += 8) block(g, C.night, 0, y, 32, 1);
    for (let row = 0; row < 4; row += 1) {
      for (let x = row % 2 === 0 ? 7 : 15; x < 32; x += 16) block(g, C.night, x, row * 8, 1, 8);
    }
    block(g, C.stoneLight, 2, 2, 14, 1);
  });

  texture(scene, VISUAL_KEYS.props.hqRoof, 32, 32, (g) => {
    block(g, C.ink, 0, 0, 32, 32);
    block(g, 0x202a3b, 1, 1, 30, 30);
    for (let y = 3; y < 32; y += 6) {
      block(g, 0x111927, 1, y, 30, 2);
      for (let x = (y / 6) % 2 === 0 ? 4 : 10; x < 32; x += 12) block(g, C.slate, x, y - 2, 6, 1);
    }
    block(g, 0x4b5a70, 2, 2, 27, 1);
  });

  texture(scene, VISUAL_KEYS.props.hqDoor, 32, 48, (g) => {
    block(g, C.ink, 2, 3, 28, 45);
    block(g, C.stone, 3, 3, 26, 8);
    block(g, C.woodDeep, 6, 10, 20, 38);
    block(g, C.wood, 8, 12, 16, 36);
    block(g, C.woodLight, 10, 13, 2, 31);
    block(g, C.goldDeep, 7, 22, 18, 3);
    block(g, C.gold, 19, 29, 3, 3);
  });

  texture(scene, VISUAL_KEYS.props.hqWindow, 32, 32, (g) => {
    block(g, C.stone, 2, 2, 28, 30);
    block(g, C.ink, 6, 5, 20, 23);
    block(g, 0xb86b36, 8, 7, 16, 19);
    block(g, C.warm, 10, 9, 12, 15);
    block(g, C.white, 11, 10, 4, 10);
    block(g, C.ink, 15, 7, 2, 19);
    block(g, C.ink, 8, 15, 16, 2);
  });
}

function drawSword(
  graphics: Graphics,
  direction: CardinalDirection,
  action: AdventurerAction,
  frame: number,
) {
  let from: [number, number];
  let to: [number, number];

  if (action !== "attack") {
    if (direction === "up") {
      from = [15, 39];
      to = [9, 20];
    } else if (direction === "left") {
      from = [16, 38];
      to = [7, 45];
    } else if (direction === "right") {
      from = [32, 38];
      to = [41, 45];
    } else {
      from = [33, 35];
      to = [38, 50];
    }
  } else if (direction === "down") {
    const positions: Array<[[number, number], [number, number]]> = [
      [[29, 28], [41, 14]],
      [[30, 35], [43, 39]],
      [[27, 40], [21, 55]],
    ];
    [from, to] = positions[frame % positions.length];
  } else if (direction === "up") {
    const positions: Array<[[number, number], [number, number]]> = [
      [[18, 31], [8, 39]],
      [[22, 27], [24, 7]],
      [[29, 31], [40, 38]],
    ];
    [from, to] = positions[frame % positions.length];
  } else {
    const facing = direction === "right" ? 1 : -1;
    const base = direction === "right" ? 31 : 17;
    const offsets: Array<[number, number]> = [
      [8 * facing, -15],
      [17 * facing, -1],
      [10 * facing, 12],
    ];
    from = [base, 34];
    to = [base + offsets[frame % offsets.length][0], 34 + offsets[frame % offsets.length][1]];
  }

  pixelLine(graphics, C.ink, from[0] - 1, from[1] - 1, to[0] - 1, to[1] - 1, 3);
  pixelLine(graphics, C.stoneLight, from[0], from[1], to[0], to[1], 1);
  block(graphics, C.white, to[0], to[1], 2, 2);
  block(graphics, C.gold, from[0] - 3, from[1] - 1, 7, 3);
  block(graphics, C.wood, from[0] - 1, from[1] + 2, 3, 5);
}

function drawAdventurer(
  graphics: Graphics,
  direction: CardinalDirection,
  action: AdventurerAction,
  frame: number,
) {
  const bob = action === "walk" && frame % 2 === 1 ? -1 : action === "idle" && frame === 1 ? -1 : 0;
  const stride = action === "walk" ? (frame % 4 < 2 ? 2 : -2) : 0;

  block(graphics, C.ink, 13, 53, 23, 5, 0.38);
  block(graphics, C.night, 16 + stride, 43 + bob, 6, 11);
  block(graphics, C.ink, 15 + stride, 51 + bob, 8, 4);
  block(graphics, C.night, 26 - stride, 43 + bob, 6, 11);
  block(graphics, C.ink, 25 - stride, 51 + bob, 8, 4);

  if (direction === "left" || direction === "right") {
    const right = direction === "right";
    const mirrorX = (x: number, width: number) => (right ? x : ADVENTURER_FRAME.width - x - width);
    const side = (color: number, x: number, y: number, width: number, height: number, alpha = 1) =>
      block(graphics, color, mirrorX(x, width), y, width, height, alpha);

    side(C.ink, 15, 28 + bob, 18, 18);
    side(C.clothDeep, 16, 29 + bob, 15, 16);
    side(C.cloth, 19, 29 + bob, 12, 15);
    side(C.clothLight, 21, 30 + bob, 3, 9);
    side(C.woodDeep, 15, 40 + bob, 18, 4);
    side(C.ink, 18, 15 + bob, 16, 16);
    side(C.skin, 20, 17 + bob, 13, 13);
    side(C.skinLight, 27, 20 + bob, 6, 5);
    side(C.hairDeep, 18, 14 + bob, 15, 7);
    side(C.hair, 20, 15 + bob, 12, 4);
    side(C.hairDeep, 18, 19 + bob, 5, 8);
    side(C.ink, 31, 22 + bob, 2, 2);
    side(C.skinDeep, 29, 27 + bob, 4, 1);
    side(C.ink, 28, 31 + bob, 7, 11);
    side(C.skin, 29, 32 + bob, 5, 8);
  } else {
    block(graphics, C.ink, 14, 28 + bob, 20, 18);
    block(graphics, C.clothDeep, 16, 29 + bob, 16, 16);
    block(graphics, C.cloth, 18, 29 + bob, 12, 15);
    block(graphics, C.clothLight, direction === "down" ? 19 : 27, 31 + bob, 3, 8);
    block(graphics, C.woodDeep, 15, 40 + bob, 18, 4);
    block(graphics, C.gold, 23, 40 + bob, 3, 3);
    block(graphics, C.ink, 10, 30 + bob, 6, 13);
    block(graphics, C.skin, 11, 32 + bob, 4, 9);
    block(graphics, C.ink, 33, 30 + bob, 6, 13);
    block(graphics, C.skin, 34, 32 + bob, 4, 9);
    block(graphics, C.ink, 16, 14 + bob, 17, 17);
    block(graphics, C.skin, 18, 16 + bob, 13, 14);
    block(graphics, C.hairDeep, 16, 13 + bob, 17, 8);
    block(graphics, C.hair, 18, 14 + bob, 13, 5);
    block(graphics, C.hairDeep, 16, 19 + bob, 4, 8);
    block(graphics, C.hairDeep, 29, 18 + bob, 4, 7);
    if (direction === "down") {
      block(graphics, C.ink, 20, 22 + bob, 2, 2);
      block(graphics, C.ink, 27, 22 + bob, 2, 2);
      block(graphics, C.skinDeep, 23, 27 + bob, 4, 1);
    } else {
      block(graphics, C.hair, 21, 19 + bob, 8, 5);
      block(graphics, C.clothLight, 19, 27 + bob, 11, 2);
    }
  }

  drawSword(graphics, direction, action, frame);
}

function createAdventurer(scene: Phaser.Scene) {
  for (const direction of CARDINAL_DIRECTIONS) {
    for (const action of ADVENTURER_ACTIONS) {
      for (let frame = 0; frame < ADVENTURER_FRAME_COUNTS[action]; frame += 1) {
        texture(
          scene,
          adventurerTextureKey(direction, action, frame),
          ADVENTURER_FRAME.width,
          ADVENTURER_FRAME.height,
          (graphics) => drawAdventurer(graphics, direction, action, frame),
        );
      }
    }
  }
}

function drawSlime(graphics: Graphics, frame: number) {
  const squash = frame === 1 ? 2 : frame === 2 ? -1 : 0;
  block(graphics, C.ink, 5, 26, 23, 4, 0.35);
  block(graphics, 0x102518, 6 - squash, 15 + squash, 21 + squash * 2, 12 - squash);
  block(graphics, 0x397f45, 7 - squash, 12 + squash, 19 + squash * 2, 14 - squash);
  block(graphics, 0x5fae55, 10 - squash, 9 + squash, 13 + squash * 2, 9 - squash);
  block(graphics, 0x8ccc66, 12, 10 + squash, 6, 3);
  block(graphics, C.ink, 11, 18 + squash, 3, 3);
  block(graphics, C.ink, 21, 18 + squash, 3, 3);
  block(graphics, 0x1f4b2b, 15, 23 + squash, 5, 2);
  block(graphics, C.white, 11, 18 + squash, 1, 1);
}

function drawWolf(graphics: Graphics, frame: number, corrupted: boolean) {
  const body = corrupted ? 0x3b304d : 0x58606b;
  const bodyLight = corrupted ? 0x6f3e88 : 0x89919a;
  const bodyDeep = corrupted ? 0x21172e : 0x303640;
  const step = frame % 2 === 0 ? 0 : 2;

  block(graphics, C.ink, 9, 39, 45, 4, 0.35);
  block(graphics, C.ink, 11, 21, 37, 15);
  block(graphics, bodyDeep, 10, 22, 39, 13);
  block(graphics, body, 15, 18, 30, 16);
  block(graphics, bodyLight, 19, 19, 18, 5);
  block(graphics, C.ink, 42, 15, 16, 17);
  block(graphics, bodyDeep, 43, 16, 14, 15);
  block(graphics, body, 44, 17, 11, 12);
  block(graphics, C.ink, 45, 9, 6, 10);
  block(graphics, C.ink, 52, 10, 6, 10);
  block(graphics, body, 46, 11, 4, 8);
  block(graphics, body, 53, 12, 3, 8);
  block(graphics, C.ink, 54, 23, 8, 5);
  block(graphics, bodyLight, 55, 23, 5, 3);
  block(graphics, corrupted ? C.violetLight : 0xe6ba68, 51, 19, 2, 2);
  block(graphics, C.ink, 13 + step, 31, 6, 10);
  block(graphics, bodyDeep, 14 + step, 32, 4, 8);
  block(graphics, C.ink, 37 - step, 31, 6, 10);
  block(graphics, bodyDeep, 38 - step, 32, 4, 8);
  pixelLine(graphics, C.ink, 12, 25, 3, 15, 4);
  pixelLine(graphics, bodyDeep, 13, 25, 4, 15, 2);

  if (corrupted) {
    block(graphics, C.violet, 20, 15, 4, 8);
    block(graphics, C.violetLight, 21, 13, 2, 6);
    block(graphics, C.violetDeep, 31, 25, 7, 7);
    block(graphics, C.violet, 34, 22, 3, 8);
    block(graphics, C.violetLight, 35, 21, 1, 5);
    block(graphics, C.violet, 5, 13, 3, 5);
  }
}

function drawBoar(graphics: Graphics, frame: number) {
  const step = frame % 2 === 0 ? 0 : 2;
  block(graphics, C.ink, 7, 40, 50, 4, 0.38);
  block(graphics, C.ink, 8, 19, 42, 19);
  block(graphics, 0x4a342d, 10, 18, 38, 19);
  block(graphics, 0x725041, 14, 16, 29, 17);
  block(graphics, 0x9a7258, 18, 17, 19, 5);
  block(graphics, C.ink, 40, 15, 17, 20);
  block(graphics, 0x4a342d, 42, 16, 14, 18);
  block(graphics, 0x725041, 45, 18, 10, 13);
  block(graphics, C.ink, 52, 25, 10, 8);
  block(graphics, 0xb78a68, 53, 26, 8, 6);
  block(graphics, C.ink, 57, 28, 2, 2);
  block(graphics, C.ink, 47, 19, 2, 2);
  block(graphics, 0xf2dfb1, 51, 32, 3, 7);
  block(graphics, 0xf2dfb1, 57, 31, 3, 7);
  block(graphics, C.ink, 42, 9, 7, 10);
  block(graphics, 0x725041, 43, 11, 5, 7);
  block(graphics, C.ink, 13 + step, 32, 8, 10);
  block(graphics, 0x4a342d, 15 + step, 33, 5, 8);
  block(graphics, C.ink, 35 - step, 32, 8, 10);
  block(graphics, 0x4a342d, 37 - step, 33, 5, 8);
  block(graphics, C.ink, 8, 21, 5, 4);
  block(graphics, 0x725041, 5, 19, 6, 3);
}

function drawBoss(graphics: Graphics, frame: number) {
  const pulse = frame === 1 ? 2 : frame === 2 ? -1 : 0;
  block(graphics, C.ink, 15, 78, 67, 8, 0.42);
  block(graphics, C.ink, 13, 42, 66, 31);
  block(graphics, 0x20182c, 15, 40, 62, 31);
  block(graphics, 0x49315b, 21, 34, 50, 34);
  block(graphics, 0x6c3e7c, 26, 35, 35, 12);
  block(graphics, C.ink, 63, 29, 25, 31);
  block(graphics, 0x251a31, 65, 30, 21, 28);
  block(graphics, 0x593367, 67, 33, 17, 22);
  block(graphics, C.ink, 69, 17, 8, 18);
  block(graphics, C.ink, 80, 19, 8, 17);
  block(graphics, C.violet, 71, 19, 4, 14);
  block(graphics, C.violet, 82, 21, 4, 13);
  block(graphics, C.violetLight, 78, 40, 3 + pulse, 3 + pulse);
  block(graphics, C.white, 79, 40, 1, 1);
  block(graphics, C.ink, 83, 48, 11, 7);
  block(graphics, 0x8c577f, 84, 49, 7, 4);
  block(graphics, C.white, 87, 54, 2, 5);
  block(graphics, C.white, 91, 53, 2, 5);

  const legOffset = frame === 1 ? 3 : 0;
  for (const x of [22 + legOffset, 42, 61 - legOffset]) {
    block(graphics, C.ink, x, 64, 10, 17);
    block(graphics, 0x2a1c35, x + 2, 65, 6, 14);
    block(graphics, C.violet, x + 1, 78, 10, 3);
  }

  pixelLine(graphics, C.ink, 19, 47, 4, 25, 6);
  pixelLine(graphics, 0x2a1c35, 20, 47, 5, 25, 3);
  block(graphics, C.violet, 29, 25, 6, 16);
  block(graphics, C.violetLight, 31, 21 - pulse, 3, 15 + pulse);
  block(graphics, C.violet, 44, 27, 7, 12);
  block(graphics, C.violetLight, 47, 23 + pulse, 3, 13);
  block(graphics, C.violetDeep, 52, 51, 9, 10);
}

function createCreatures(scene: Phaser.Scene) {
  for (const kind of CREATURE_KINDS) {
    for (let frame = 0; frame < CREATURE_FRAME_COUNTS[kind]; frame += 1) {
      const size = kind === "slime" ? [32, 32] : kind === "boss" ? [96, 96] : [64, 48];
      texture(scene, creatureTextureKey(kind, frame), size[0], size[1], (graphics) => {
        if (kind === "slime") drawSlime(graphics, frame);
        else if (kind === "boar") drawBoar(graphics, frame);
        else if (kind === "boss") drawBoss(graphics, frame);
        else drawWolf(graphics, frame, kind === "corrupted");
      });
    }
  }
}

function createEffects(scene: Phaser.Scene) {
  texture(scene, VISUAL_KEYS.effects.selection, 48, 24, (g) => {
    block(g, C.ink, 8, 4, 32, 2, 0.55);
    block(g, C.ink, 4, 7, 6, 2, 0.55);
    block(g, C.ink, 38, 7, 6, 2, 0.55);
    block(g, C.ink, 2, 10, 5, 4, 0.55);
    block(g, C.ink, 41, 10, 5, 4, 0.55);
    block(g, C.ink, 6, 16, 8, 2, 0.55);
    block(g, C.ink, 34, 16, 8, 2, 0.55);
    block(g, C.ink, 14, 19, 20, 2, 0.55);
    block(g, C.goldLight, 9, 3, 30, 2);
    block(g, C.gold, 5, 6, 6, 2);
    block(g, C.gold, 37, 6, 6, 2);
    block(g, C.goldLight, 3, 9, 3, 4);
    block(g, C.goldLight, 42, 9, 3, 4);
    block(g, C.gold, 7, 15, 8, 2);
    block(g, C.gold, 33, 15, 8, 2);
    block(g, C.goldLight, 15, 18, 18, 2);
  });

  texture(scene, VISUAL_KEYS.effects.destination, 32, 16, (g) => {
    block(g, C.blue, 5, 3, 7, 2, 0.85);
    block(g, C.blue, 20, 3, 7, 2, 0.85);
    block(g, C.blue, 2, 6, 3, 5, 0.85);
    block(g, C.blue, 27, 6, 3, 5, 0.85);
    block(g, C.blue, 5, 12, 7, 2, 0.85);
    block(g, C.blue, 20, 12, 7, 2, 0.85);
    block(g, 0x8ee6ff, 9, 7, 14, 2, 0.6);
  });

  texture(scene, VISUAL_KEYS.effects.hit, 32, 32, (g) => {
    pixelLine(g, C.white, 15, 4, 17, 27, 2);
    pixelLine(g, C.goldLight, 5, 15, 27, 17, 2);
    pixelLine(g, C.red, 8, 8, 24, 24, 2);
    pixelLine(g, C.red, 23, 8, 8, 24, 2);
    block(g, C.white, 14, 14, 5, 5);
  });

  texture(scene, VISUAL_KEYS.effects.loot, 20, 20, (g) => {
    block(g, C.ink, 4, 16, 13, 3, 0.4);
    block(g, C.violetDeep, 6, 7, 9, 10);
    block(g, C.violet, 7, 4, 7, 12);
    block(g, C.violetLight, 9, 2, 4, 11);
    block(g, C.white, 10, 4, 1, 5);
    block(g, C.gold, 5, 15, 11, 2);
  });
}

function drawPortal(graphics: Graphics, frame: number) {
  const pulse = [0, 2, 0, -2][frame % 4];
  block(graphics, C.ink, 14, 82, 68, 8, 0.45);
  block(graphics, C.violetDeep, 21, 74, 54, 8, 0.55);

  const rocks: Array<[number, number, number, number]> = [
    [12, 60, 11, 24],
    [20, 42, 10, 38],
    [29, 29, 9, 48],
    [61, 31, 9, 46],
    [70, 45, 10, 35],
    [80, 62, 8, 21],
  ];
  for (const [x, y, width, height] of rocks) {
    block(graphics, C.ink, x - 1, y - 1, width + 2, height + 2);
    block(graphics, C.night, x, y, width, height);
    block(graphics, C.slate, x + 2, y + 2, Math.max(2, width - 5), Math.max(3, height - 7));
    block(graphics, C.violet, x + width - 3, y + 5, 2, Math.max(3, height - 10), 0.6);
  }

  block(graphics, C.violetDeep, 33 - pulse, 19, 30 + pulse * 2, 57);
  block(graphics, 0x15102e, 37 - pulse, 22, 22 + pulse * 2, 50);
  block(graphics, 0x090a1a, 41 - pulse, 27, 14 + pulse * 2, 39);
  block(graphics, C.violet, 34 - pulse, 23, 3, 42, 0.9);
  block(graphics, C.violetLight, 38 - pulse, 25, 2, 34, 0.85);
  block(graphics, C.violet, 59 + pulse, 27, 3, 36, 0.9);
  block(graphics, C.white, 40 - pulse, 33 + frame, 1, 13, 0.85);

  const particles: Array<[number, number]> = [
    [24, 19],
    [71, 24],
    [17, 37],
    [77, 12],
    [52, 8],
    [85, 39],
  ];
  particles.forEach(([x, y], index) => {
    const offset = (frame + index) % 3;
    block(graphics, index % 2 ? C.violet : C.violetLight, x, y - offset * 2, 2, 2, 0.8);
  });
}

function createPortal(scene: Phaser.Scene) {
  for (let frame = 0; frame < 4; frame += 1) {
    texture(scene, portalTextureKey(frame), 96, 96, (graphics) => drawPortal(graphics, frame));
  }
}

function registerAnimation(
  scene: Phaser.Scene,
  key: string,
  frameKeys: string[],
  frameRate: number,
  repeat: number,
) {
  if (scene.anims.exists(key)) return;
  scene.anims.create({
    key,
    frames: frameKeys.map((textureKey) => ({ key: textureKey })),
    frameRate,
    repeat,
  });
}

/** Registers all looping creature/portal animations and directional player animations. */
export function createVisualAnimations(scene: Phaser.Scene) {
  for (const direction of CARDINAL_DIRECTIONS) {
    for (const action of ADVENTURER_ACTIONS) {
      const frameKeys = Array.from({ length: ADVENTURER_FRAME_COUNTS[action] }, (_, frame) =>
        adventurerTextureKey(direction, action, frame),
      );
      registerAnimation(
        scene,
        VISUAL_ANIMATIONS.adventurer(direction, action),
        frameKeys,
        action === "idle" ? 3 : action === "walk" ? 9 : 12,
        action === "attack" ? 0 : -1,
      );
    }
  }

  for (const kind of CREATURE_KINDS) {
    const frameKeys = Array.from({ length: CREATURE_FRAME_COUNTS[kind] }, (_, frame) =>
      creatureTextureKey(kind, frame),
    );
    registerAnimation(scene, VISUAL_ANIMATIONS.creature(kind), frameKeys, kind === "slime" ? 4 : 6, -1);
  }

  registerAnimation(
    scene,
    VISUAL_ANIMATIONS.portal,
    Array.from({ length: 4 }, (_, frame) => portalTextureKey(frame)),
    7,
    -1,
  );
}

/**
 * Creates the complete built-in pixel-art pack and its Phaser animations.
 * It is idempotent and safe to call from every world Scene's `create` method.
 */
export function createProceduralAssets(scene: Phaser.Scene) {
  createTerrain(scene);
  createProps(scene);
  createAdventurer(scene);
  createCreatures(scene);
  createEffects(scene);
  createPortal(scene);
  createVisualAnimations(scene);
}

export class AssetFactory {
  static create(scene: Phaser.Scene) {
    createProceduralAssets(scene);
  }

  static registerAnimations(scene: Phaser.Scene) {
    createVisualAnimations(scene);
  }
}

export type { AdventurerAction, CardinalDirection, CreatureKind };
