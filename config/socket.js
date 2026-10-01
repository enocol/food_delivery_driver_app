import { io } from "socket.io-client";
import { API_URL } from "@env";
import { auth } from "./firebase";

let _socket = null;
// Last connection error surfaced by the server/engine (e.g. auth rejection),
// so callers can show an accurate reason instead of a generic timeout.
let _lastConnectError = null;

// Registry of persistent listeners that survive socket replacement
const _registry = []; // [{ event, handler }]

/**
 * Resolve a fresh Firebase ID token for the current user.
 * socket.io invokes this callback on the initial connect AND on every
 * reconnection, so the token is never stale — the previous implementation
 * baked a single token in at creation time, which expired after ~1h and
 * caused all reconnects to fail with "Invalid or expired token".
 */
function authProvider(cb) {
  const user = auth.currentUser;
  if (!user) {
    cb({ role: "driver" });
    return;
  }
  user
    .getIdToken()
    .then((token) => cb({ token, role: "driver" }))
    .catch(() => cb({ role: "driver" }));
}

/**
 * Connect (or reconnect) the socket. A fresh Firebase ID token is fetched
 * for every connection attempt via the auth callback above.
 * Safe to call multiple times — disconnects any existing socket first.
 * Re-attaches all registered listeners to the new socket instance.
 */
export function connectSocket() {
  if (_socket) {
    _socket.disconnect();
  }
  _lastConnectError = null;
  _socket = io(API_URL, {
    auth: authProvider,
    transports: ["websocket"],
    reconnectionAttempts: 5,
    timeout: 8000,
  });

  _socket.on("connect", () => {
    _lastConnectError = null;
  });
  // Surface connection failures (auth rejection, unreachable server, …)
  // instead of letting them fail silently as a downstream timeout.
  _socket.on("connect_error", (err) => {
    _lastConnectError = err?.message || "Connection error";
    console.warn("[socket] connect_error:", _lastConnectError);
  });

  // Re-attach all registered listeners to the new socket
  _registry.forEach(({ event, handler }) => _socket.on(event, handler));
  return _socket;
}

export function disconnectSocket() {
  if (_socket) {
    _socket.disconnect();
    _socket = null;
  }
  _lastConnectError = null;
}

/** Returns the current socket instance (may be null). */
export function getSocket() {
  return _socket;
}

/** True when a socket exists and is currently connected. */
export function isSocketConnected() {
  return !!_socket?.connected;
}

/** Last connection error message, or null if none/connected. */
export function getSocketError() {
  return _lastConnectError;
}

/**
 * Register a persistent event listener.
 * Attaches immediately if a socket exists, and survives reconnections.
 */
export function addSocketListener(event, handler) {
  _registry.push({ event, handler });
  if (_socket) _socket.on(event, handler);
}

/**
 * Remove a previously registered persistent listener.
 */
export function removeSocketListener(event, handler) {
  const idx = _registry.findIndex(
    (l) => l.event === event && l.handler === handler,
  );
  if (idx !== -1) _registry.splice(idx, 1);
  if (_socket) _socket.off(event, handler);
}
