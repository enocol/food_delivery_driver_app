import { API_URL } from "@env";

// Retryable statuses: the server is unreachable, overloaded, or asking us to
// back off. Any other 4xx means this payload will be rejected just as hard next
// time, so retrying it only burns battery.
function isRetryableStatus(status) {
  return status >= 500 || status === 408 || status === 429;
}

// Returns { ok, retryable } so the caller can decide whether another attempt
// could plausibly succeed. `firebaseUser` is the React Native Firebase
// currentUser; `payload` comes from registerForPushNotificationsAsync().
export async function registerPushToken(firebaseUser, payload) {
  if (!firebaseUser || !payload?.fcm_token) {
    return { ok: false, retryable: false };
  }

  let idToken;
  try {
    idToken = await firebaseUser.getIdToken();
  } catch {
    // Minting an ID token can hit the network, so this is worth another go.
    return { ok: false, retryable: true };
  }

  const endpoint = `${API_URL.replace(/\/+$/, "")}/api/push-tokens`;
  const requestBody = {
    firebase_uid: payload.firebase_uid,
    token: payload.fcm_token,
    platform: payload.platform,
    device_id: payload.device_id,
    app_version: payload.app_version,
    locale: payload.locale,
    is_active: payload.is_active,
  };

  try {
    let response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (response.status === 401) {
      const refreshedToken = await firebaseUser.getIdToken(true);
      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${refreshedToken}`,
        },
        body: JSON.stringify(requestBody),
      });
    }

    if (!response.ok) {
      return { ok: false, retryable: isRetryableStatus(response.status) };
    }

    return { ok: true };
  } catch {
    // fetch only rejects on a genuine network failure, which is exactly the
    // case we want to keep retrying.
    return { ok: false, retryable: true };
  }
}
