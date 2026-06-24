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
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MapView from "react-native-maps";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { useNavigation } from "@react-navigation/native";
import { useOnlineStatus } from "../context/OnlineContext";
import { playBreakingGlass } from "../utils/audio";
import { requestStatusChange } from "../utils/status";
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

const TAB_BAR_STYLE = {
  backgroundColor: "#1a1a1a",
  borderTopColor: "#2e2e2e",
  borderTopWidth: 1,
};

// ── Component ──────────────────────────────────────────────
export default function HomeScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { isOnline, setIsOnline, statusLabel, setStatusLabel } =
    useOnlineStatus();

  const mapRef = useRef(null); // persistent full-screen map
  const dashMapRef = useRef(null); // mini-map card inside dashboard

  const [viewMode, setViewMode] = useState("dashboard");
  const [isGoingOnline, setIsGoingOnline] = useState(false);
  const [isGoingOffline, setIsGoingOffline] = useState(false);
  const [deliveryRequest, setDeliveryRequest] = useState(null);

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
    addSocketListener("new_delivery_available", onNewDelivery);
    return () => removeSocketListener("new_delivery_available", onNewDelivery);
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
  async function handleGoOnline() {
    setIsGoingOnline(true);
    playBreakingGlass();

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

    requestStatusChange({
      socket: getSocket(),
      emitEvent: "go_offline",
      expectOnline: false,
      onConfirm: () => {
        Animated.timing(mapCtrlAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }).start(() => {
          setStatusLabel(null);
          setIsOnline(false);
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
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        initialRegion={INITIAL_REGION}
        showsUserLocation
        scrollEnabled
        zoomEnabled
        pitchEnabled
        rotateEnabled
        toolbarEnabled
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
          <Ionicons name="home-outline" size={22} color="#ffffff" />
        </TouchableOpacity>

        <View style={styles.earningsPill}>
          <Text style={styles.earningsText}>£0.00</Text>
        </View>

        <TouchableOpacity style={styles.mapCircleBtn} activeOpacity={0.8}>
          <Ionicons name="search" size={22} color="#ffffff" />
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
          <Ionicons name="shield-checkmark-outline" size={22} color="#4a90e2" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.floatingBtn} activeOpacity={0.8}>
          <Ionicons name="bar-chart-outline" size={22} color="#ffffff" />
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
            {isGoingOnline ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.goButtonText}>GO</Text>
            )}
          </TouchableOpacity>
        </Animated.View>
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
        onAccept={() => setDeliveryRequest(null)}
        onDecline={() => setDeliveryRequest(null)}
        onClose={() => setDeliveryRequest(null)}
      />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1a1a1a",
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
    backgroundColor: "#1a1a1a",
    alignItems: "center",
    justifyContent: "center",
    elevation: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
  },
  earningsPill: {
    backgroundColor: "#1a1a1a",
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 28,
    elevation: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
  },
  earningsText: {
    color: "#ffffff",
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
    backgroundColor: "#1a1a1a",
    alignItems: "center",
    justifyContent: "center",
    elevation: 6,
    shadowColor: "#000",
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
    backgroundColor: "#1a73e8",
    alignItems: "center",
    justifyContent: "center",
    elevation: 8,
    shadowColor: "#1a73e8",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
  },
  goButtonText: {
    color: "#ffffff",
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: 1,
  },
});
