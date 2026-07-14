import {
  experimental_upgradeWebSocket,
  type WebSocketData,
} from "@vercel/functions";
import { getRealm } from "@/game/server/realm-singleton";
import { decodeClientMessage, encodeServerMessage } from "@/game/shared/protocol";
import type { ServerMessage } from "@/game/shared/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  return experimental_upgradeWebSocket(
    (socket) => {
      const realm = getRealm();
      const peerId = crypto.randomUUID();
      let closed = false;

      const send = (message: ServerMessage): void => {
        socket.send(encodeServerMessage(message));
      };

      const disconnect = (): void => {
        if (closed) return;
        closed = true;
        realm.disconnectPeer(peerId);
      };

      realm.registerPeer(peerId, send);

      socket.on("message", (data: WebSocketData) => {
        const decoded = decodeClientMessage(data);
        if (!decoded.success) {
          send({ type: "error", code: decoded.code, message: decoded.message });
          return;
        }

        if (decoded.message.type === "join") {
          realm.joinPeer(peerId, decoded.message);
          return;
        }

        realm.handleMessage(peerId, decoded.message);
      });
      socket.on("close", disconnect);
      socket.on("error", disconnect);
    },
    { maxPayload: 16 * 1024 },
  );
}
