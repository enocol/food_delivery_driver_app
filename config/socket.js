import { io } from "socket.io-client";
import { API_URL } from "@env";

let _socket = null;

// Registry of persistent listeners that survive socket replacement
const _registry = []; // [{ event, handler }]

/**
 * Connect (or reconnect) the socket with a fresh Firebase ID token.
 * Safe to call multiple times — disconnects any existing socket first.
 * Re-attaches all registered listeners to the new socket instance.
 */
export function connectSocket(token) {
  if (_socket) {
    _socket.disconnect();
  }
  _socket = io(API_URL, {
    auth: { token, role: "driver" },
    transports: ["websocket"],
    reconnectionAttempts: 5,
    timeout: 8000,
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
}

/** Returns the current socket instance (may be null). */
export function getSocket() {
  return _socket;
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
