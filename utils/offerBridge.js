// Bridges a push-notification tap (handled at the app root in App.js) to the
// HomeScreen delivery-request modal. On a cold start the tap is handled before
// HomeScreen has mounted and subscribed, so when there are no listeners yet the
// offer is cached and handed to the first subscriber that appears.

let listeners = new Set();
let pendingOffer = null;

export function emitOffer(offer) {
  if (!offer) return;
  if (listeners.size === 0) {
    pendingOffer = offer;
    return;
  }
  listeners.forEach((fn) => {
    try {
      fn(offer);
    } catch {
      // A broken listener must not stop the others from being notified.
    }
  });
}

export function subscribeOffer(fn) {
  listeners.add(fn);

  // Hand a late subscriber any offer that arrived before it mounted (one-shot).
  if (pendingOffer) {
    const offer = pendingOffer;
    pendingOffer = null;
    try {
      fn(offer);
    } catch {
      // Ignore — the caller will resync on next foreground anyway.
    }
  }

  return () => listeners.delete(fn);
}
