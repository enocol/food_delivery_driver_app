/**
 * HomeScreen — single persistent MapView with animated overlay modes.
 *
 * viewMode:
 *   'dashboard' — dark scrollable home screen
 *   'map'       — full-screen map, tab bar hidden, persistent bottom sheet
 *
 * The MapView NEVER unmounts. Overlays animate in/out on top of it.
 */
import React, { useRef, useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  ActivityIndicator,
  Alert,
  Linking,
  AppState,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import NativeMap from "../components/NativeMap";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { useNavigation } from "@react-navigation/native";
import { useOnlineStatus } from "../context/OnlineContext";
import { playOnline, playOffline } from "../utils/audio";
import { requestStatusChange } from "../utils/status";
import { getCurrentOffer, declineDelivery } from "../utils/orders";
import { subscribeOffer } from "../utils/offerBridge";
import {
  startBackgroundLocation,
  stopBackgroundLocation,
} from "../utils/locationTask";
import { saveOnline, loadOnline } from "../utils/onlineStorage";
import { INITIAL_REGION } from "../constants/map";
import { useBottomSheet } from "../hooks/useBottomSheet";
import { useScreenTransition } from "../hooks/useScreenTransition";
import SlidingSheet from "../components/SlidingSheet";
import ActionBar from "../components/ActionBar";
import DashboardOverlay from "../components/DashboardOverlay";
import DeliveryRequestModal from "../components/DeliveryRequestModal";
import {
  getSocket,
  addSocketListener,
  removeSocketListener,
} from "../config/socket";
import * as colors from "../utils/colors";

const TAB_BAR_STYLE = {
  backgroundColor: colors.bg,
  borderTopColor: colors.border,
  borderTopWidth: 1,
};

// Added: thresholds for movement-triggered and heartbeat location updates.
const MOVE_THRESHOLD_METERS = 30;
const HEARTBEAT_MS = 10000;
const MIN_EMIT_GAP_MS = 2000;
const ARRIVAL_THRESHOLD_METERS = 35;

// Added: calculate distance between two coordinates in meters.
function haversineMeters(a, b) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);

  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

// Added: normalize coordinate objects from payloads with {lat,lng} or {latitude,longitude}.
function extractCoords(value) {
  if (!value || typeof value !== "object") return null;
  const latitude =
    typeof value.latitude === "number"
      ? value.latitude
      : typeof value.lat === "number"
        ? value.lat
        : null;
  const longitude =
    typeof value.longitude === "number"
      ? value.longitude
      : typeof value.lng === "number"
        ? value.lng
        : null;
  if (latitude == null || longitude == null) return null;
  return { latitude, longitude };
}

// ── Component ──────────────────────────────────────────────
export default function HomeScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { isOnline, setIsOnline, statusLabel, setStatusLabel } =
    useOnlineStatus();

  const mapRef = useRef(null); // persistent full-screen map
  const dashMapRef = useRef(null); // mini-map card inside dashboard
  const goPulse = useRef(new Animated.Value(0)).current; // "GO" button pulse

  const [viewMode, setViewMode] = useState("dashboard");
  const [isGoingOnline, setIsGoingOnline] = useState(false);
  const [isGoingOffline, setIsGoingOffline] = useState(false);
  const [deliveryRequest, setDeliveryRequest] = useState(null);
  // Added: active accepted delivery used to gate location tracking.
  const [activeDelivery, setActiveDelivery] = useState(null);
  // Added: in-app navigation modal state and current route URL.

  // Added: refs for live-tracking subscriptions and throttling state.
  const locationSubRef = useRef(null);
  const heartbeatTimerRef = useRef(null);
  const lastSentRef = useRef(null);
  const lastSentAtRef = useRef(0);
  const arrivalFlagsRef = useRef({ pickup: false, delivery: false });

  const {
    dashAnim,
    mapCtrlAnim,
    animToDashboard,
    animToMap,
    mapOpacity,
    mapTopY,
    actionBarY,
    dashOpacity,
    dashScale,
  } = useScreenTransition();

  const {
    sheetY,
    sheetHeight,
    actionBarH,
    panHandlers,
    expandSheet,
    collapseSheet,
    resetSheet,
  } = useBottomSheet(insets);

  // Indeterminate status line (online only) — slides left↔right
  const lineAnim = useRef(new Animated.Value(0)).current;
  const [lineTrackW, setLineTrackW] = useState(0);

  // Added: destination coordinates for pickup/dropoff arrival checks.
  const pickupCoords = extractCoords(activeDelivery?.pickupAddress);
  const deliveryCoords = extractCoords(activeDelivery?.deliveryAddress);

  // Added: emit location to backend over socket using the update_location event.
  function emitLocationUpdate(coords, meta = {}) {
    if (!coords) return;
    const socket = getSocket();
    socket?.emit("update_location", {
      latitude: coords.latitude,
      longitude: coords.longitude,
      orderId: activeDelivery?.orderId ?? null,
      reason: meta.reason ?? "movement",
      accuracy: meta.accuracy ?? null,
      speed: meta.speed ?? null,
      heading: meta.heading ?? null,
      timestamp: Date.now(),
    });
  }

  // Added: open turn-by-turn navigation to pickup once a request is accepted.
  async function navigateToPickup(request) {
    const pickupCoordsValue = extractCoords(request?.pickupAddress);
    const pickupAddressText =
      typeof request?.pickupAddress === "string"
        ? request.pickupAddress
        : typeof request?.pickupAddress?.address === "string"
          ? request.pickupAddress.address
          : null;

    let destination = pickupCoordsValue;

    if (!destination && pickupAddressText) {
      try {
        const geocoded = await Location.geocodeAsync(pickupAddressText);
        if (geocoded?.length) {
          destination = {
            latitude: geocoded[0].latitude,
            longitude: geocoded[0].longitude,
          };
        }
      } catch {
        // Keep destination null and show a user-friendly message below.
      }
    }

    if (!destination) {
      Alert.alert(
        "Navigation unavailable",
        "Couldn't resolve the pickup location for navigation.",
      );
      return;
    }

    mapRef.current?.animateToRegion(
      {
        latitude: destination.latitude,
        longitude: destination.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      },
      700,
    );

    const destinationParam = encodeURIComponent(
      `${destination.latitude},${destination.longitude}`,
    );
    // Omit origin so Google Maps navigates from the driver's live location.
    const url = `https://www.google.com/maps/dir/?api=1&destination=${destinationParam}&travelmode=driving`;
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert(
        "Navigation unavailable",
        "Couldn't open Google Maps for navigation.",
      );
    }
  }

  // Added: emit one-time final pings when reaching pickup or delivery proximity.
  function maybeEmitArrivalUpdates(coords, meta = {}) {
    if (!coords) return;

    if (pickupCoords && !arrivalFlagsRef.current.pickup) {
      const toPickup = haversineMeters(coords, pickupCoords);
      if (toPickup <= ARRIVAL_THRESHOLD_METERS) {
        emitLocationUpdate(coords, {
          ...meta,
          reason: "pickup_arrived",
        });
        arrivalFlagsRef.current.pickup = true;
      }
    }

    if (deliveryCoords && !arrivalFlagsRef.current.delivery) {
      const toDelivery = haversineMeters(coords, deliveryCoords);
      if (toDelivery <= ARRIVAL_THRESHOLD_METERS) {
        emitLocationUpdate(coords, {
          ...meta,
          reason: "delivery_arrived",
        });
        arrivalFlagsRef.current.delivery = true;
      }
    }
  }

  // Added: movement/heartbeat throttle and filtering before emitting updates.
  function maybeEmitMovementUpdate(location, reason = "movement") {
    const coords = {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
    };
    const now = Date.now();
    const last = lastSentRef.current;
    const moved = last
      ? haversineMeters(last, coords)
      : Number.POSITIVE_INFINITY;
    const forceEmit =
      reason === "heartbeat" ||
      reason === "reconnect" ||
      reason === "tracking_start" ||
      reason === "going_offline";

    if (!forceEmit && now - lastSentAtRef.current < MIN_EMIT_GAP_MS) return;
    if (!forceEmit && reason === "movement" && moved < MOVE_THRESHOLD_METERS)
      return;

    emitLocationUpdate(coords, {
      reason,
      accuracy: location.coords.accuracy ?? null,
      speed: location.coords.speed ?? null,
      heading: location.coords.heading ?? null,
    });
    lastSentRef.current = coords;
    lastSentAtRef.current = now;
    maybeEmitArrivalUpdates(coords, {
      accuracy: location.coords.accuracy ?? null,
      speed: location.coords.speed ?? null,
      heading: location.coords.heading ?? null,
    });
  }

  // ── Tab bar sync ──────────────────────────────────────
  useEffect(() => {
    navigation.setOptions({
      tabBarStyle: viewMode === "map" ? { display: "none" } : TAB_BAR_STYLE,
    });
  }, [viewMode]);

  // Reset sheet whenever we leave map mode
  useEffect(() => {
    if (viewMode !== "map") resetSheet();
  }, [viewMode]);

  // Run the indeterminate status line while online
  useEffect(() => {
    if (!isOnline) {
      lineAnim.stopAnimation();
      lineAnim.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(lineAnim, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(lineAnim, {
          toValue: 0,
          duration: 600,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [isOnline]);

  // Start/stop live location updates while the driver is online.
  useEffect(() => {
    let cancelled = false;

    async function startTracking() {
      if (!isOnline) return;

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        return;
      }

      const initial = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      if (cancelled) return;
      maybeEmitMovementUpdate(initial, "tracking_start");

      const sub = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 5000,
          distanceInterval: 20,
        },
        (location) => {
          if (!cancelled) maybeEmitMovementUpdate(location, "movement");
        },
      );

      if (cancelled) {
        sub.remove();
        return;
      }
      locationSubRef.current = sub;

      heartbeatTimerRef.current = setInterval(async () => {
        if (!isOnline) return;
        try {
          const latest = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          if (!cancelled) maybeEmitMovementUpdate(latest, "heartbeat");
        } catch {
          // Ignore transient location failures.
        }
      }, HEARTBEAT_MS);
    }

    startTracking();

    return () => {
      cancelled = true;
      if (heartbeatTimerRef.current) {
        clearInterval(heartbeatTimerRef.current);
        heartbeatTimerRef.current = null;
      }
      if (locationSubRef.current) {
        locationSubRef.current.remove();
        locationSubRef.current = null;
      }
      lastSentRef.current = null;
      lastSentAtRef.current = 0;
      arrivalFlagsRef.current = { pickup: false, delivery: false };
    };
  }, [isOnline]);

  // When socket reconnects, immediately push a fresh location for fast resync.
  useEffect(() => {
    if (!isOnline) return;

    const onConnect = async () => {
      // A bare socket (re)connect does NOT restore the driver's online state on
      // the backend: status and socket_id are only written by go_online, and a
      // background disconnect leaves the DB Offline with socket_id NULL. Since
      // we still consider ourselves online here, re-assert go_online so the DB
      // flips back to Online and repopulates socket_id (go_online also refreshes
      // current_location, so this doubles as the fast location resync).
      try {
        const latest = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        getSocket()?.emit("go_online", {
          latitude: latest.coords.latitude,
          longitude: latest.coords.longitude,
        });
        maybeEmitMovementUpdate(latest, "reconnect");
      } catch {
        // Location unavailable — still re-assert online so the DB is corrected
        // (go_online keeps the existing current_location when none is sent).
        getSocket()?.emit("go_online", {});
      }
    };

    addSocketListener("connect", onConnect);
    // Restored online state (e.g. relaunch after a kill) can land after the
    // socket already connected — re-assert immediately in that case.
    if (getSocket()?.connected) onConnect();
    return () => removeSocketListener("connect", onConnect);
  }, [isOnline]);

  // ── Resume online after a relaunch (e.g. killed/force-quit app) ──
  // If the driver was online when the app was last killed, restore the Online UI
  // and re-assert it. Setting isOnline true drives the usual online effects (the
  // onConnect effect above re-emits go_online once the socket is up); keep-alive
  // is restarted here. The backend's go_online handler then flips the DB back to
  // Online and repopulates socket_id.
  useEffect(() => {
    (async () => {
      const wasOnline = await loadOnline();
      if (!wasOnline) return;
      setStatusLabel("Online");
      setIsOnline(true);
      startBackgroundLocation();
    })();
    // Run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── "GO" button pulse ──────────────────────────────────
  // A white circle starts mid-radius and expands to the edge while fading out,
  // looping continuously to draw the eye to the Go-Online button.
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(goPulse, {
        toValue: 1,
        duration: 1800,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [goPulse]);

  // ── Socket: delivery requests ─────────────────────────
  useEffect(() => {
    function onNewDelivery({
      orderId,
      restaurantName,
      pickupAddress,
      deliveryAddress,
      fee,
    }) {
      setDeliveryRequest({
        orderId,
        restaurantName,
        pickupAddress,
        deliveryAddress,
        fee,
      });
    }
    addSocketListener("delivery_offered", onNewDelivery);
    return () => removeSocketListener("delivery_offered", onNewDelivery);
  }, []);

  // ── Offers via push tap + resync on foreground / mount ──
  // A push tap (background/cold start) is handled in App.js, which fetches the
  // current offer and hands it over through the offer bridge. We also resync on
  // every foreground in case the one-time socket emit was missed.
  useEffect(() => {
    const unsubscribe = subscribeOffer((offer) => setDeliveryRequest(offer));

    async function resync() {
      try {
        const offer = await getCurrentOffer();
        if (offer) setDeliveryRequest(offer);
      } catch {
        // Ignore — the socket and the next foreground will catch up.
      }
    }
    resync();

    const sub = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") resync();
    });

    return () => {
      unsubscribe();
      sub.remove();
    };
  }, []);

  // ── Center maps on mount ──────────────────────────────
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      const loc = await Location.getCurrentPositionAsync({});
      const region = {
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        latitudeDelta: 0.015,
        longitudeDelta: 0.015,
      };
      mapRef.current?.animateToRegion(region, 700);
      dashMapRef.current?.animateToRegion(
        { ...region, latitudeDelta: 0.04, longitudeDelta: 0.04 },
        700,
      );
    })();
  }, []);

  function handleExpandMap() {
    setViewMode("map");
    animToMap();
  }

  // ── Go Online ─────────────────────────────────────────
  // Strictly gated: the driver only goes online after the server
  // emits status_updated with { isOnline: true }.
  // ── Recenter the map on the driver's current location ──
  async function recenterMap() {
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== "granted") {
        const req = await Location.requestForegroundPermissionsAsync();
        if (req.status !== "granted") return;
      }
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      mapRef.current?.animateToRegion(
        {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        },
        600,
      );
    } catch {
      // Location unavailable — leave the map where it is.
    }
  }

  async function handleGoOnline() {
    setIsGoingOnline(true);

    if (viewMode === "dashboard") {
      setViewMode("map");
      animToMap();
    }

    function revertToDashboard(message) {
      setIsGoingOnline(false);
      setViewMode("dashboard");
      animToDashboard();
      if (message) Alert.alert("Couldn't go online", message);
    }

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        revertToDashboard("Location permission is required to go online.");
        return;
      }
      const loc = await Location.getCurrentPositionAsync({});
      const onlineCoords = {
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      };

      requestStatusChange({
        socket: getSocket(),
        emitEvent: "go_online",
        payload: onlineCoords,
        expectOnline: true,
        onConfirm: ({ status: s }) => {
          setStatusLabel(s ?? "Online");
          setIsOnline(true);
          setIsGoingOnline(false);
          saveOnline(true);
          playOnline();
          // Keep-alive needs "Allow all the time" location, which on Android 11+
          // can't be granted from a dialog — only in Settings. If it's missing,
          // explain why and offer a shortcut there.
          startBackgroundLocation().then((result) => {
            if (result === "no-background") {
              Alert.alert(
                "Stay online in the background",
                'To keep receiving delivery requests while the app is in the ' +
                  'background, set this app\'s location access to "Allow all ' +
                  'the time" in Settings.',
                [
                  { text: "Not now", style: "cancel" },
                  {
                    text: "Open Settings",
                    onPress: () => Linking.openSettings(),
                  },
                ],
              );
            }
          });
          setTimeout(() => {
            mapRef.current?.animateToRegion(
              { ...onlineCoords, latitudeDelta: 0.002, longitudeDelta: 0.002 },
              700,
            );
          }, 150);
          setTimeout(() => {
            mapRef.current?.animateToRegion(
              { ...onlineCoords, latitudeDelta: 0.015, longitudeDelta: 0.015 },
              900,
            );
          }, 1050);
        },
        onFail: revertToDashboard,
      });
    } catch {
      revertToDashboard("Something went wrong getting your location.");
    }
  }

  // ── Home button: map → dashboard ──────────────────────
  function handleHomePress() {
    resetSheet();
    setViewMode("dashboard");
    animToDashboard();
  }

  // ── Go Offline ────────────────────────────────────────
  // Strictly gated: the driver only goes offline after the server
  // emits status_updated with { isOnline: false }.
  function handleGoOffline() {
    collapseSheet();
    setIsGoingOffline(true);

    // Added: send a final location update before transitioning offline.
    if (activeDelivery) {
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
        .then((loc) => {
          emitLocationUpdate(
            {
              latitude: loc.coords.latitude,
              longitude: loc.coords.longitude,
            },
            {
              reason: "going_offline",
              accuracy: loc.coords.accuracy ?? null,
              speed: loc.coords.speed ?? null,
              heading: loc.coords.heading ?? null,
            },
          );
        })
        .catch(() => {});
    }

    requestStatusChange({
      socket: getSocket(),
      emitEvent: "go_offline",
      expectOnline: false,
      onConfirm: () => {
        playOffline();
        stopBackgroundLocation();
        saveOnline(false);
        Animated.timing(mapCtrlAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }).start(() => {
          setStatusLabel(null);
          setIsOnline(false);
          setActiveDelivery(null);
          setIsGoingOffline(false);
          setViewMode("dashboard");
          Animated.timing(dashAnim, {
            toValue: 1,
            duration: 420,
            useNativeDriver: true,
          }).start();
        });
      },
      onFail: (message) => {
        setIsGoingOffline(false);
        if (message) Alert.alert("Couldn't go offline", message);
      },
    });
  }

  // ── Animated derived styles ───────────────────────────
  // Travel distance for the status line segment (20% wide)
  const lineTranslate = lineAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, lineTrackW * 0.8],
  });

  // ── Render ────────────────────────────────────────────
  return (
    <View style={styles.container}>
      {/* ──────────────────────────────────────────────────
          Persistent MapView — never unmounts
      ──────────────────────────────────────────────── */}
      <NativeMap
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={INITIAL_REGION}
        showsUserLocation
      />

      {/* ──────────────────────────────────────────────────
          MAP MODE — top bar
      ──────────────────────────────────────────────── */}
      <Animated.View
        pointerEvents={viewMode === "map" ? "box-none" : "none"}
        style={[
          styles.topBar,
          {
            paddingTop: insets.top + 12,
            opacity: mapOpacity,
            transform: [{ translateY: mapTopY }],
          },
        ]}
      >
        <TouchableOpacity
          style={styles.mapCircleBtn}
          onPress={handleHomePress}
          activeOpacity={0.8}
        >
          <Ionicons name="home-outline" size={22} color={colors.white} />
        </TouchableOpacity>

        <View style={styles.earningsPill}>
          <Text style={styles.earningsText}>£0.00</Text>
        </View>

        <TouchableOpacity style={styles.mapCircleBtn} activeOpacity={0.8}>
          <Ionicons name="search" size={22} color={colors.white} />
        </TouchableOpacity>
      </Animated.View>

      {/* ──────────────────────────────────────────────────
          MAP MODE — floating buttons (above action bar)
      ──────────────────────────────────────────────── */}
      <Animated.View
        pointerEvents={viewMode === "map" ? "box-none" : "none"}
        style={[
          styles.floatingBtns,
          { bottom: actionBarH + 25, opacity: mapOpacity },
        ]}
      >
        <TouchableOpacity style={styles.floatingBtn} activeOpacity={0.8}>
          <Ionicons name="shield-checkmark-outline" size={22} color={colors.primary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.floatingBtn}
          onPress={recenterMap}
          activeOpacity={0.8}
        >
          <Ionicons name="locate" size={22} color={colors.white} />
        </TouchableOpacity>
      </Animated.View>

      {/* ──────────────────────────────────────────────────
          MAP MODE — GO button (offline only, above the sheet)
      ──────────────────────────────────────────────── */}
      {!isOnline && (
        <Animated.View
          pointerEvents={viewMode === "map" ? "box-none" : "none"}
          style={[
            styles.goButtonWrap,
            { bottom: actionBarH + 36, opacity: mapOpacity },
          ]}
        >
          <TouchableOpacity
            style={styles.goButton}
            onPress={handleGoOnline}
            disabled={isGoingOnline}
            activeOpacity={0.85}
          >
            <Animated.View
              pointerEvents="none"
              style={[
                styles.goPulse,
                {
                  opacity: goPulse.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.5, 0],
                  }),
                  transform: [
                    {
                      scale: goPulse.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.5, 1],
                      }),
                    },
                  ],
                },
              ]}
            />
            {isGoingOnline ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.goButtonText}>GO</Text>
            )}
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* ──────────────────────────────────────────────────
          RESUME NAVIGATION — available while an active delivery exists
      ──────────────────────────────────────────────── */}
      {!!activeDelivery && (
        <View
          pointerEvents="box-none"
          style={[
            styles.resumeNavWrap,
            {
              bottom:
                insets.bottom + (viewMode === "map" ? actionBarH + 18 : 18),
            },
          ]}
        >
          <TouchableOpacity
            style={styles.resumeNavBtn}
            onPress={() => navigateToPickup(activeDelivery)}
            activeOpacity={0.9}
          >
            <Ionicons name="navigate" size={18} color={colors.white} />
            <Text style={styles.resumeNavText}>Resume Nav</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ──────────────────────────────────────────────────
          MAP MODE — sliding sheet content
      ──────────────────────────────────────────────── */}
      <SlidingSheet
        viewMode={viewMode}
        sheetHeight={sheetHeight}
        sheetY={sheetY}
        mapOpacity={mapOpacity}
        panHandlers={panHandlers}
        bottomInset={insets.bottom}
        isOnline={isOnline}
        isGoingOnline={isGoingOnline}
        isGoingOffline={isGoingOffline}
        collapseSheet={collapseSheet}
        onGoOffline={handleGoOffline}
      />

      {/* ──────────────────────────────────────────────────
          MAP MODE — persistent action bar
      ──────────────────────────────────────────────── */}
      <ActionBar
        viewMode={viewMode}
        bottomInset={insets.bottom}
        mapOpacity={mapOpacity}
        actionBarY={actionBarY}
        panHandlers={panHandlers}
        isOnline={isOnline}
        statusLabel={statusLabel}
        expandSheet={expandSheet}
        lineTranslate={lineTranslate}
        onLineLayout={(e) => setLineTrackW(e.nativeEvent.layout.width)}
      />

      {/* ──────────────────────────────────────────────────
          DASHBOARD OVERLAY — dark scrollable home screen
      ──────────────────────────────────────────────── */}
      <DashboardOverlay
        viewMode={viewMode}
        insets={insets}
        isOnline={isOnline}
        statusLabel={statusLabel}
        dashMapRef={dashMapRef}
        dashOpacity={dashOpacity}
        dashScale={dashScale}
        isGoingOnline={isGoingOnline}
        onExpandMap={handleExpandMap}
        onGoOnline={handleGoOnline}
      />

      {/* ──────────────────────────────────────────────────
          DELIVERY REQUEST MODAL
      ──────────────────────────────────────────────── */}
      <DeliveryRequestModal
        request={deliveryRequest}
        // Added: promote accepted request to active trip so tracking can start.
        onAccept={(acceptedRequest) => {
          setActiveDelivery(acceptedRequest);
          setDeliveryRequest(null);
          navigateToPickup(acceptedRequest);
        }}
        onDecline={() => {
          if (deliveryRequest?.orderId) declineDelivery(deliveryRequest.orderId);
          setDeliveryRequest(null);
        }}
        onClose={() => {
          if (deliveryRequest?.orderId) declineDelivery(deliveryRequest.orderId);
          setDeliveryRequest(null);
        }}
      />

    </View>
  );
}

// ── Styles ────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },

  // ── Top bar ───────────────────────────────────────────
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    zIndex: 10,
  },
  mapCircleBtn: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
    elevation: 6,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
  },
  earningsPill: {
    backgroundColor: colors.bg,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 28,
    elevation: 6,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
  },
  earningsText: {
    color: colors.white,
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: 0.3,
  },

  // ── Floating buttons ──────────────────────────────────
  floatingBtns: {
    position: "absolute",
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    zIndex: 12,
  },
  floatingBtn: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
    elevation: 6,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
  },

  // ── GO button ─────────────────────────────────────────
  goButtonWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 13,
  },
  goButton: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    elevation: 8,
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
  },
  goButtonText: {
    color: colors.white,
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: 1,
  },
  goPulse: {
    position: "absolute",
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: colors.white,
  },

  // ── Resume navigation button ────────────────────────
  resumeNavWrap: {
    position: "absolute",
    right: 16,
    zIndex: 20,
  },
  resumeNavBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.accent,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 22,
    elevation: 7,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
  },
  resumeNavText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.2,
  },

});
