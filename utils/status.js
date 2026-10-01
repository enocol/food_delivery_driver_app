import { getSocketError } from "../config/socket";

/**
 * requestStatusChange — server-gated online/offline transition.
 *
 * Emits `emitEvent` and waits for the server to echo `status_updated`
 * with the expected `isOnline` value before resolving. Guards against
 * double-resolution, cleans up its listener, and fails after a timeout.
 *
 * @param {object}   opts
 * @param {object}   opts.socket        Active socket (may be null/undefined).
 * @param {string}   opts.emitEvent     Event to emit (e.g. "go_online").
 * @param {*}        [opts.payload]     Optional payload for the emit.
 * @param {boolean}  opts.expectOnline  isOnline value that confirms success.
 * @param {number}   [opts.timeoutMs]   Time to wait before failing (default 10s).
 * @param {(data:object)=>void} [opts.onConfirm]
 * @param {(message:string|null)=>void} [opts.onFail]
 * @returns {{ cancel: () => void }}
 */
export function requestStatusChange({
  socket,
  emitEvent,
  payload,
  expectOnline,
  timeoutMs = 10000,
  onConfirm,
  onFail,
}) {
  let settled = false;
  let timeoutId;

  // Fail fast if we aren't connected: socket.io would otherwise buffer the
  // emit and the caller would wait the full timeout for a reply that can
  // never arrive. Surface the real reason (e.g. an auth rejection) if known.
  if (!socket || !socket.connected) {
    const reason = getSocketError();
    onFail?.(
      reason
        ? `Can't reach the server (${reason}). Please try again.`
        : "Not connected to the server. Please check your connection and try again.",
    );
    return { cancel: () => {} };
  }

  function cleanup() {
    clearTimeout(timeoutId);
    socket?.off("status_updated", onStatus);
  }

  function fail(message) {
    if (settled) return;
    settled = true;
    cleanup();
    onFail?.(message);
  }

  function onStatus(data) {
    if (settled) return;
    if (data?.isOnline !== expectOnline) {
      fail(
        expectOnline
          ? "The server did not confirm you are online."
          : "The server did not confirm you are offline.",
      );
      return;
    }
    settled = true;
    cleanup();
    onConfirm?.(data);
  }

  socket?.on("status_updated", onStatus);
  timeoutId = setTimeout(
    () => fail("No response from server. Please try again."),
    timeoutMs,
  );
  socket?.emit(emitEvent, payload);

  return { cancel: () => fail(null) };
}
