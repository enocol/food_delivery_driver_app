import { API_URL } from "@env";
import { auth } from "../config/firebase";

// The socket server rejects any driver that has no row in the `drivers` table
// ("Driver account not found"), and that row is created by POST
// /api/drivers/session. The app must therefore guarantee the row exists on
// every authenticated start — not only on OTP verify — before the socket
// authenticates. Returns true once the row is confirmed to exist.
export async function ensureDriverSession() {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    return false;
  }

  const baseUrl = API_URL.replace(/\/$/, "");
  const body = JSON.stringify({
    phone: currentUser.phoneNumber ?? null,
    status: "Offline",
    is_online: false,
  });

  // A cold (free-tier) backend can take a while to wake, so retry a few times
  // with a short backoff rather than leaving the driver with no row — which
  // would block them from ever going online.
  const MAX_ATTEMPTS = 3;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    let idToken = null;
    try {
      // Force a token refresh on retries in case the first was stale.
      idToken = await currentUser.getIdToken(attempt > 1);
    } catch {
      // Minting the token needs the network; fall through and retry.
    }

    try {
      const response = await fetch(`${baseUrl}/api/drivers/session`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        },
        body,
      });
      if (response.ok) {
        return true;
      }
    } catch {
      // Network failure — retry below.
    }

    if (attempt < MAX_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 2000));
    }
  }

  return false;
}
