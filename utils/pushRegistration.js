import { AppState } from "react-native";
import { auth } from "../config/firebase";
import { registerPushToken } from "./pushTokenApi";
import {
  PUSH_PERMISSION_DENIED,
  registerForPushNotificationsAsync,
} from "./pushNotifications";

// Registering a push token is a network round trip on a market where
// connectivity drops constantly, and a lost token fails silently and forever —
// the device simply never receives a delivery offer again. So a failed attempt
// is retried with exponential backoff until it lands. The delay is capped
// rather than the attempt count; the loop exits on success, on sign-out, and on
// any failure another attempt could not fix.

const FIRST_RETRY_DELAY_MS = 5_000;
const MAX_RETRY_DELAY_MS = 5 * 60 * 1_000;

// Bumped on every start/stop so callbacks from an abandoned run can detect that
// they are stale and do nothing.
let runToken = 0;
let attemptNumber = 0;
let isRegistered = false;
// runToken of the attempt currently executing, or 0. An attempt can sit a long
// time on the permission dialog; this stops a foreground event from kicking off
// a second, concurrent attempt behind it.
let inFlightToken = 0;
let retryTimer = null;
let appStateSub = null;

function clearRetryTimer() {
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
}

function teardown() {
  clearRetryTimer();
  if (appStateSub) {
    appStateSub.remove();
    appStateSub = null;
  }
}

function scheduleRetry(myToken) {
  const delay = Math.min(
    FIRST_RETRY_DELAY_MS * 2 ** (attemptNumber - 1),
    MAX_RETRY_DELAY_MS,
  );

  clearRetryTimer();
  retryTimer = setTimeout(() => {
    retryTimer = null;
    attemptNumber += 1;
    runAttempt(myToken);
  }, delay);
}

async function runAttempt(myToken) {
  if (myToken !== runToken || inFlightToken === runToken) {
    return;
  }

  inFlightToken = myToken;
  try {
    if (!auth.currentUser) {
      // Signed out between attempts — there is nobody to register for.
      teardown();
      return;
    }

    const permission = await registerForPushNotificationsAsync();
    if (myToken !== runToken) {
      return;
    }

    if (!permission.ok) {
      if (permission.reason === PUSH_PERMISSION_DENIED) {
        // No amount of retrying grants permission; only a trip to system
        // settings does. The timer stops, but the foreground listener stays
        // subscribed so returning from Settings picks it straight up.
        clearRetryTimer();
        return;
      }

      scheduleRetry(myToken);
      return;
    }

    // Re-read rather than reusing the user captured before the await above: the
    // dialog may have been open a while, and the uid and ID token on the
    // request have to come from the same account.
    const user = auth.currentUser;
    if (!user) {
      teardown();
      return;
    }

    const result = await registerPushToken(user, {
      firebase_uid: user.uid,
      ...permission.payload,
    });
    if (myToken !== runToken) {
      return;
    }

    if (result.ok) {
      isRegistered = true;
      teardown();
      return;
    }

    if (!result.retryable) {
      clearRetryTimer();
      return;
    }

    scheduleRetry(myToken);
  } finally {
    // Only clear it if a newer run has not already claimed the slot.
    if (inFlightToken === myToken) {
      inFlightToken = 0;
    }
  }
}

function handleAppStateChange(nextState) {
  if (nextState !== "active" || isRegistered || inFlightToken === runToken) {
    return;
  }

  // Coming back to the foreground is the best free signal we get that
  // connectivity may have returned (and the only way to notice permission being
  // granted in Settings), so skip the remaining backoff and try now.
  clearRetryTimer();
  attemptNumber += 1;
  runAttempt(runToken);
}

// Call after sign-in. Idempotent: a second call supersedes the first.
export function startPushRegistration() {
  runToken += 1;
  const myToken = runToken;

  clearRetryTimer();
  attemptNumber = 1;
  isRegistered = false;

  if (!appStateSub) {
    appStateSub = AppState.addEventListener("change", handleAppStateChange);
  }

  runAttempt(myToken);
}

// Call on sign-out. Stops retries and foreground listeners.
export function stopPushRegistration() {
  runToken += 1;
  isRegistered = false;
  inFlightToken = 0;
  teardown();
}
