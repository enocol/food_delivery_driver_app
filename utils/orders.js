import { API_URL } from "@env";
import { auth } from "../config/firebase";

export async function acceptDelivery(orderId) {
  if (!orderId) {
    throw new Error("Missing order ID.");
  }

  const currentUser = auth.currentUser;
  const idToken = currentUser ? await currentUser.getIdToken() : null;
  const baseUrl = API_URL.replace(/\/$/, "");

  const response = await fetch(
    `${baseUrl}/api/drivers/deliveries/${orderId}/accept`,

    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
      },
    },
  );

  if (!response.ok) {
    let message = "Failed to update order status.";
    try {
      const data = await response.json();
      message = data?.message || data?.error || message;
    } catch {
      // Ignore non-JSON error responses.
    }
    throw new Error(message);
  }

  return response;
}

// Declines the offer currently extended to this driver so the backend can
// reassign it immediately (and so it stops coming back on the next resync).
// Best-effort: if it doesn't reach the server, the offer expires on its own.
export async function declineDelivery(orderId) {
  if (!orderId) {
    return;
  }

  const currentUser = auth.currentUser;
  const idToken = currentUser ? await currentUser.getIdToken() : null;
  const baseUrl = API_URL.replace(/\/$/, "");

  try {
    await fetch(`${baseUrl}/api/drivers/deliveries/${orderId}/decline`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
      },
    });
  } catch {
    // Ignore — the offer will expire server-side if the decline is lost.
  }
}

// Fetches the offer currently extended to this driver, if any. Used to rehydrate
// the request modal after a push tap (cold start) or when returning to the
// foreground, since the one-time socket emit may have been missed. Returns the
// offer object (same shape as the `delivery_offered` socket payload) or null.
export async function getCurrentOffer() {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    return null;
  }

  let idToken;
  try {
    idToken = await currentUser.getIdToken();
  } catch {
    return null;
  }

  const baseUrl = API_URL.replace(/\/$/, "");

  try {
    const response = await fetch(`${baseUrl}/api/drivers/offers/current`, {
      headers: { Authorization: `Bearer ${idToken}` },
    });
    if (!response.ok) {
      return null;
    }
    const data = await response.json().catch(() => null);
    return data?.offer ?? null;
  } catch {
    return null;
  }
}
