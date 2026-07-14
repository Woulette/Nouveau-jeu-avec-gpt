import { z } from "zod";
import { persistedPlayerProfileSchema } from "./save";
import type { ServerMessage } from "./types";

const positionSchema = z.object({
  x: z.number().int().min(0).max(4095),
  y: z.number().int().min(0).max(4095),
});

const sequenced = {
  sequence: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
};

export const clientMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("join"),
    name: z.string().trim().min(1).max(24),
    resumeToken: z.string().uuid().optional(),
    clientVersion: z.string().trim().max(32).optional(),
    savedProfile: persistedPlayerProfileSchema.optional(),
  }),
  z.object({ type: z.literal("move"), destination: positionSchema, ...sequenced }),
  z.object({ type: z.literal("target"), targetId: z.string().min(1).max(80), ...sequenced }),
  z.object({
    type: z.literal("cast"),
    slot: z.number().int().min(0).max(3),
    targetId: z.string().min(1).max(80).optional(),
    ...sequenced,
  }),
  z.object({ type: z.literal("respawn"), ...sequenced }),
  z.object({
    type: z.literal("rift"),
    action: z.enum(["enter", "leave"]),
    riftId: z.string().min(1).max(80),
    ...sequenced,
  }),
  z.object({
    type: z.literal("equip"),
    itemId: z.string().min(1).max(80),
    ...sequenced,
  }),
  z.object({
    type: z.literal("unequip"),
    slot: z.enum(["head", "weapon", "armor", "legs", "boots", "ring"]),
    ...sequenced,
  }),
  z.object({
    type: z.literal("use-item"),
    itemId: z.string().min(1).max(80),
    ...sequenced,
  }),
  z.object({
    type: z.literal("ping"),
    clientTime: z.number().finite(),
  }),
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;
export type JoinMessage = Extract<ClientMessage, { type: "join" }>;

export type DecodeResult =
  | { success: true; message: ClientMessage }
  | { success: false; code: "INVALID_JSON" | "INVALID_MESSAGE"; message: string };

function messageText(input: unknown): string | null {
  if (typeof input === "string") return input;
  if (input instanceof ArrayBuffer) return new TextDecoder().decode(new Uint8Array(input));
  if (ArrayBuffer.isView(input)) {
    return new TextDecoder().decode(new Uint8Array(input.buffer, input.byteOffset, input.byteLength));
  }
  return null;
}

export function decodeClientMessage(input: unknown): DecodeResult {
  const text = messageText(input);
  if (text === null || text.length > 16_384) {
    return { success: false, code: "INVALID_MESSAGE", message: "Message non pris en charge." };
  }

  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { success: false, code: "INVALID_JSON", message: "JSON invalide." };
  }

  const result = clientMessageSchema.safeParse(value);
  if (!result.success) {
    return { success: false, code: "INVALID_MESSAGE", message: "Commande de jeu invalide." };
  }

  return { success: true, message: result.data };
}

export function encodeServerMessage(message: ServerMessage): string {
  return JSON.stringify(message);
}
