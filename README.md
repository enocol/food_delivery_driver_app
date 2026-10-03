# Food Delivery Driver App

A React Native (Expo) mobile application for food delivery drivers. Drivers can go online, receive real-time delivery requests from the backend, view order details on a map, accept a job, and follow in-app navigation to pickup — all powered by Socket.io and Firebase (React Native Firebase for native phone authentication).

> **Requires a development build.** This app uses React Native Firebase, which includes custom native code and **cannot run in Expo Go**. See [Native Setup](#native-setup-react-native-firebase).

---

## Table of Contents

- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Screens](#screens)
- [Prerequisites](#prerequisites)
- [Environment Variables](#environment-variables)
- [Installation](#installation)
- [Native Setup](#native-setup-react-native-firebase)
- [Running the App](#running-the-app)
- [Backend API](#backend-api)
- [Socket.io Events](#socketio-events)
- [Key Features](#key-features)
- [Notes for Developers](#notes-for-developers)

---

## Overview

This is the **driver-facing** mobile app in a food delivery platform. It connects to a Node.js backend over both Socket.io (real-time) and HTTP (REST). When a driver goes online, the server joins them to the `available_drivers` room. When an order is ready for pickup, the backend emits a `new_delivery_available` event and this app shows a delivery request sheet. Once accepted, the app streams the driver's live location back to the server and opens turn-by-turn navigation to the pickup.

---

## Tech Stack

| Technology                 | Version  | Purpose                                    |
| -------------------------- | -------- | ------------------------------------------ |
| Expo                       | ~57.0.0  | Build toolchain & native APIs              |
| React Native               | 0.86.3   | UI framework                               |
| React                      | 19.2.3   | UI runtime                                 |
| React Native Firebase      | ^26.4.0  | Phone number authentication (native SDK)   |
| Socket.io Client           | ^4.8.3   | Real-time server communication             |
| expo-location              | ~57.0.20 | GPS, geocoding, live location tracking     |
| expo-audio                 | ~57.0.5  | Sound playback                             |
| expo-maps                  | ~57.0.3  | Native Apple Maps (iOS) and Google Maps (Android); alpha |
| react-native-webview       | 13.16.1  | In-app navigation (Google Maps directions) |
| @expo/vector-icons         | ^15.0.2  | Ionicons UI icons                          |
| react-native-safe-area-context | ~5.7.0 | Safe-area insets                         |
| React Navigation           | ^7.0.0   | Bottom tab navigation                      |
| expo-dev-client            | ~57.0.19 | Development build runtime (native modules) |
| expo-build-properties      | ~57.0.22 | Native build config (iOS frameworks)       |
| react-native-dotenv        | ^3.4.11  | Environment variable injection (`@env`)    |

---

## Project Structure

```
Deliver_driver_app/
├── App.js                        # Root component: auth state, socket lifecycle, tab navigation
├── index.js                      # Entry point — registers the root component
├── app.json                      # Expo config (icons, plugins, orientation)
├── babel.config.js               # Babel config (includes react-native-dotenv)
├── metro.config.js               # Metro bundler config (package-exports resolver)
├── .env                          # Environment variables (not committed)
├── config/
│   ├── firebase.js               # React Native Firebase auth instance (getAuth)
│   └── socket.js                 # Socket.io client — connect/disconnect + persistent listener registry
├── context/
│   └── OnlineContext.js          # Shared online/offline state (isOnline, statusLabel)
├── constants/
│   └── map.js                    # Shared map defaults (INITIAL_REGION)
├── hooks/
│   ├── useBottomSheet.js         # Drag-to-expand/collapse bottom sheet (PanResponder)
│   └── useScreenTransition.js    # Dashboard ↔ map cross-fade animations
├── screens/
│   ├── AuthScreen.js             # Phone OTP login (React Native Firebase) + backend session sync
│   ├── HomeScreen.js             # Persistent map with dashboard/map overlay modes
│   ├── EarningsScreen.js         # Driver earnings (placeholder)
│   ├── InboxScreen.js            # Notifications / messages (placeholder)
│   └── ProfileScreen.js          # Driver profile + logout (shown as the "Profile" tab)
├── components/
│   ├── ActionBar.js              # Persistent map-mode bottom bar + status line
│   ├── DashboardOverlay.js       # Dark scrollable home surface
│   ├── DeliveryRequestModal.js   # New-delivery bottom sheet (accept/decline)
│   ├── GoOnlineButton.js         # "Go online" button (dashboard, offline)
│   ├── MiniMapCard.js            # Non-interactive dashboard map preview
│   └── SlidingSheet.js           # Map-mode sliding sheet (go offline, etc.)
├── utils/
│   ├── audio.js                  # Go-online / go-offline sound playback (expo-audio)
│   ├── orders.js                 # acceptDelivery REST call
│   └── status.js                 # Server-gated online/offline transition helper
└── assets/
    └── sounds/
        ├── online.wav            # Chime played when going online
        └── offline.wav           # Note played when going offline
```

---

## Screens

The signed-in app uses a bottom tab navigator with four tabs: **Home**, **Earnings**, **Inbox**, and **Profile** (ProfileScreen).

### AuthScreen

Phone number authentication using React Native Firebase. Defaults to a Cameroon (`+237`) number and sends an OTP SMS via `signInWithPhoneNumber`. Verification is handled by native app verification (Play Integrity on Android, silent APNs on iOS), with Firebase's own reCAPTCHA fallback if that can't complete — no reCAPTCHA modal is wired into the app. On success it POSTs a driver session to the backend, and `onAuthStateChanged` in `App.js` switches to the tab navigator.

### HomeScreen

The core driver screen — a single **persistent MapView that never unmounts**, with two animated overlay modes:

- `dashboard` — a dark, scrollable home surface (mini-map card, "Go online" button, earnings/opportunities rows).
- `map` — a full-screen map with a persistent action bar and a drag-to-expand bottom sheet.

Responsibilities:

- Centres the map on the driver's GPS position on mount.
- **Go Online** — emits `go_online` and only flips to online after the server echoes `status_updated`.
- **Go Offline** — reachable from the sliding sheet; emits `go_offline`, gated the same way.
- Streams live location (`update_location`) while online.
- Listens for `new_delivery_available` and shows the delivery request modal.
- On accept: confirms with the backend, then opens in-app Google Maps navigation (WebView) to the pickup, with a "Resume Nav" button while a trip is active.

### EarningsScreen / InboxScreen

Placeholder screens — ready for implementation.

### ProfileScreen

Shown as the **Profile** tab. Currently exposes logout (`signOut`), which returns the user to AuthScreen.

---

## Prerequisites

- Node.js >= 22.13 (required by Expo SDK 57)
- npm or yarn
- Expo CLI (use `npx expo`)
- A Firebase project with **Phone Authentication** enabled, and an **Android and/or iOS app registered** whose ID matches the bundle identifier in `app.json`
- `google-services.json` and/or `GoogleService-Info.plist` downloaded from the Firebase console (see [Native Setup](#native-setup-react-native-firebase))
- A **development build** toolchain (Android Studio / Xcode, or an EAS account) — Expo Go is not supported
- A running backend server that supports the REST endpoints and Socket.io events listed below

---

## Environment Variables

Create a `.env` file in the project root. This file is **not committed** to version control.

```env
API_URL=http://your-backend-server:PORT
```

`API_URL` is injected at build time via `react-native-dotenv` and imported from `@env` (see `babel.config.js`). Import it from `@env` — do **not** read it via `process.env`.

> Firebase credentials are **no longer** provided through `.env`. React Native Firebase reads them from the native `google-services.json` / `GoogleService-Info.plist` files instead (see [Native Setup](#native-setup-react-native-firebase)).

---

## Installation

```bash
git clone <repo-url>
cd Deliver_driver_app
npm install
```

---

## Native Setup (React Native Firebase)

React Native Firebase includes custom native code and a **development build is required** — it will not run in Expo Go.

1. **Register apps in Firebase.** In the Firebase console, add an Android app and/or iOS app whose IDs match `app.json`:
   - `android.package` → `com.mbolotechnologies.delivery_driver_app` (Android forbids hyphens)
   - `ios.bundleIdentifier` → `com.mbolotechnologies.delivery-driver-app` (Apple forbids underscores)

   Change these in `app.json` if your Firebase project uses different IDs.
2. **Download the config files** and place them in the project root:
   - `google-services.json` (Android)
   - `GoogleService-Info.plist` (iOS)

   These are referenced by `android.googleServicesFile` / `ios.googleServicesFile` in `app.json` and are required at build time. They are **not** committed to version control.
3. **Android phone auth** also requires your app's **SHA-1 / SHA-256** signing fingerprints to be added to the Firebase Android app (for Play Integrity / SMS verification).
4. **Create a development build:**

   ```bash
   # Local (requires Android Studio / Xcode)
   npx expo run:android
   npx expo run:ios

   # or with EAS Build
   eas build --profile development --platform android
   ```

5. **Configure Google Maps for Android.** Enable **Maps SDK for Android** in Google Cloud, create an API key restricted to this app's Android package and signing certificate, and set `GOOGLE_MAPS_API_KEY` in the build environment (or in the local `.env` file). `app.config.js` passes this key into the native Expo config. Rebuild after changing the key. Apple Maps on iOS does not require a maps API key.

   The config plugins (`@react-native-firebase/app`, `@react-native-firebase/auth`, `expo-build-properties`) are applied automatically during prebuild.

---

## Running the App

First complete [Native Setup](#native-setup-react-native-firebase) and install a development build on your device or emulator. Then start Metro and open the app from your **development build** (not Expo Go):

```bash
# Start the Metro dev server
npm start

# Build & launch on a device/emulator
npm run android   # expo start --android
npm run ios       # expo start --ios
```

> **Note:** This project uses native modules (React Native Firebase, maps, location, audio) and **cannot run in Expo Go**. Install a development build first (see Native Setup).

---

## Backend API

Alongside Socket.io, the app calls the backend over HTTP. The base URL comes from `API_URL`, and requests are authenticated with the Firebase ID token as `Authorization: Bearer <token>`.

| Method & Path                                   | When                          | Body                                                                     |
| ----------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------ |
| `POST /api/drivers/session`                     | After OTP verification (login) | `{ firebase_uid, phone, is_online, status, current_location }`           |
| `POST /api/drivers/deliveries/:orderId/accept`  | When a delivery is accepted    | _(none)_                                                                 |

The session sync is best-effort — if it fails, authentication still succeeds and the driver proceeds.

---

## Socket.io Events

### Handshake auth

The socket connects with (see `config/socket.js`):

```js
io(API_URL, {
  auth: {
    token: firebaseIdToken, // Firebase ID token for server-side auth
    role: "driver",
  },
  transports: ["websocket"],
  reconnectionAttempts: 5,
  timeout: 8000,
});
```

### Emitted by the driver app → server

| Event             | Payload                                                                                  | Description                                                                                                                                     |
| ----------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `go_online`       | `{ latitude, longitude }`                                                                | Driver goes online; server joins them to `available_drivers` and echoes `status_updated`.                                                       |
| `go_offline`      | _(none)_                                                                                 | Driver goes offline; server removes them from the room and echoes `status_updated`.                                                             |
| `update_location` | `{ latitude, longitude, orderId, reason, accuracy, speed, heading, timestamp }`          | Live location stream while online. `reason` ∈ `tracking_start`, `movement`, `heartbeat`, `reconnect`, `going_offline`, `pickup_arrived`, `delivery_arrived`. |

### Received by the driver app ← server

| Event                    | Payload                                                            | Description                                                                                             |
| ------------------------ | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `status_updated`         | `{ isOnline, status }`                                            | Confirms an online/offline change. The app only updates its UI after this echo (see `utils/status.js`). |
| `new_delivery_available` | `{ orderId, restaurantName, pickupAddress, deliveryAddress, fee }` | New order ready for pickup; triggers the delivery request modal. Address fields may be `{ latitude, longitude }` objects or strings. |

---

## Key Features

- **Persistent map with overlay modes** — a single `MapView` never unmounts; the dashboard and full-screen map cross-fade over it (`HomeScreen.js`, `useScreenTransition.js`).
- **Server-gated status changes** — going online/offline only takes effect after the server echoes `status_updated`, with a 10s timeout and failure handling (`utils/status.js`).
- **Live location tracking** — while online, foreground GPS is streamed via `update_location`, throttled by a ~30 m movement threshold plus a 10 s heartbeat, with one-shot pickup/delivery arrival pings (`HomeScreen.js`).
- **Persistent socket listeners** — `addSocketListener` / `removeSocketListener` register handlers in a registry that survives socket replacement on reconnect (`config/socket.js`).
- **Socket reconnect on foreground** — `App.js` listens to `AppState` and reconnects with a fresh Firebase token whenever the app becomes active.
- **Accept-delivery flow** — reverse-geocodes the pickup for a readable address, confirms the assignment with the backend, then opens in-app Google Maps directions in a WebView (`DeliveryRequestModal.js`, `utils/orders.js`, `HomeScreen.js`).
- **Audio feedback** — a confirmation chime plays when the driver goes online and a short note when they go offline (`utils/audio.js`).

---

## Notes for Developers

- The socket module (`config/socket.js`) holds a single module-level `_socket` instance. Always use `getSocket()` to access it — never import the instance directly.
- Do not call `socket.on(...)` directly in components. Use `addSocketListener(event, handler)` so the listener survives socket replacement on reconnect.
- Firebase auth is handled by React Native Firebase (`@react-native-firebase/auth`) via its **modular API** (`getAuth`, `onAuthStateChanged`, `signInWithPhoneNumber`, `signOut`). Auth state is persisted natively, so the driver stays logged in across app restarts with no AsyncStorage setup.
- Environment variables are read via the `@env` import (react-native-dotenv), not `process.env`.
- Location tracking is currently **foreground-only** (`Location.watchPositionAsync` while the app is active). There is no background location task; adding one would require a background-task package plus a **native build** (`npx expo run:android` / `npx expo run:ios`).
