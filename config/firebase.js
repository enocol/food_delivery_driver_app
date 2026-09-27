import { getAuth } from "@react-native-firebase/auth";

// React Native Firebase initialises the default app natively at build time
// from google-services.json (Android) and GoogleService-Info.plist (iOS),
// so no JS-side firebase config object is required. Auth state is persisted
// automatically by the native SDK.
export const auth = getAuth();
