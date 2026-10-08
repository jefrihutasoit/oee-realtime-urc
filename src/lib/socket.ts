import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;

/** Without NEXT_PUBLIC_WS_URL the socket connects to the page's own host, where Next proxies /socket.io. */
export function getSocket(): Socket {
  if (!socket) {
    const url = process.env.NEXT_PUBLIC_WS_URL;
    const opts = { transports: ["websocket"] };
    socket = url ? io(url, opts) : io(opts);
  }
  return socket;
}
