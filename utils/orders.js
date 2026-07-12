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
