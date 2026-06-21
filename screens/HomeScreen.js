/**
 * HomeScreen — single persistent MapView with animated overlay modes.
 *
 * viewMode:
 *   'dashboard' — dark scrollable home screen
 *   'map'       — full-screen map, tab bar hidden, persistent bottom sheet
 *
 * The MapView NEVER unmounts. Overlays animate in/out on top of it.
 *
 * Bottom sheet (map mode only):
 *   Collapsed — action bar (options | hand-circle | search) always visible at bottom
 *   Expanded  — content slides up above action bar (drag-to-collapse, tap-to-expand)
 */
import React, { useRef, useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Modal,
  ActivityIndicator,
  ScrollView,
  PanResponder,
  Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MapView from "react-native-maps";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { useNavigation } from "@react-navigation/native";
import { createAudioPlayer, setAudioModeAsync } from "expo-audio";
import { useOnlineStatus } from "../context/OnlineContext";
import {
  getSocket,
  addSocketListener,
  removeSocketListener,
} from "../config/socket";

// ── Audio ──────────────────────────────────────────────────
const GLASS_SOUND = require("../assets/sounds/breaking-glass.mp3");
async function playBreakingGlass() {
  try {
    await setAudioModeAsync({
      playsInSilentMode: true,
      interruptionMode: "mixWithOthers",
    });
    const player = createAudioPlayer(GLASS_SOUND);
    player.play();
    player.addListener("playbackStatusUpdate", (s) => {
      if (s.didJustFinish) player.remove();
    });
  } catch {
    // never block going online
  }
}

// ── Screen / sheet constants ───────────────────────────────
const { height: SCREEN_HEIGHT } = Dimensions.get("window");

// Height of the always-visible action bar (without device insets)
const ACTION_BAR_BASE_H = 64;

// Height of the sliding content panel (everything above the action bar)
const CONTENT_H = SCREEN_HEIGHT * 0.55;

// Sheet translateY: fully off-screen (collapsed) vs 0 (expanded).
// Collapsed distance = sheet height (CONTENT_H + action bar); refined at runtime with insets.
const SHEET_COLLAPSED_INIT = CONTENT_H + ACTION_BAR_BASE_H + 60;
const SHEET_EXPANDED = 0;

// ── Other constants ────────────────────────────────────────
const INITIAL_REGION = {
  latitude: 37.7749,
  longitude: -122.4194,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

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

  // dashAnim=1 → dashboard visible; mapCtrlAnim=1 → map controls visible
  const dashAnim = useRef(new Animated.Value(1)).current;
  const mapCtrlAnim = useRef(new Animated.Value(0)).current;

  // ── Bottom sheet ──────────────────────────────────────
  const sheetExpanded = useRef(false);
  const sheetY = useRef(new Animated.Value(SHEET_COLLAPSED_INIT)).current;
  const collapsedYRef = useRef(SHEET_COLLAPSED_INIT);

  // Total action bar height (incl. inset) + fully-collapsed sheet offset.
  // Expanded sheet covers ~90% — top edge sits just below the phone status bar.
  const actionBarH = ACTION_BAR_BASE_H + insets.bottom;
  const SHEET_TOP_GAP = 10; // small margin so the phone status bar stays visible
  const sheetHeight = SCREEN_HEIGHT - insets.top - SHEET_TOP_GAP;
  const sheetCollapsedY = sheetHeight;
  collapsedYRef.current = sheetCollapsedY;

  const contentPan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, { dy }) => Math.abs(dy) > 8,
      onPanResponderMove: (_, { dy }) => {
        const collapsed = collapsedYRef.current;
        const base = sheetExpanded.current ? SHEET_EXPANDED : collapsed;
        sheetY.setValue(
          Math.max(SHEET_EXPANDED, Math.min(collapsed, base + dy)),
        );
      },
      onPanResponderRelease: (_, { dy, vy }) => {
        if (sheetExpanded.current) {
          dy > 60 || vy > 0.5 ? collapseSheet() : expandSheet();
        } else {
          dy < -60 || vy < -0.5 ? expandSheet() : collapseSheet();
        }
      },
    }),
  ).current;

  function expandSheet() {
    sheetExpanded.current = true;
    Animated.spring(sheetY, {
      toValue: SHEET_EXPANDED,
      useNativeDriver: true,
      tension: 65,
      friction: 11,
    }).start();
  }

  function collapseSheet() {
    sheetExpanded.current = false;
    Animated.spring(sheetY, {
      toValue: collapsedYRef.current,
      useNativeDriver: true,
      tension: 65,
      friction: 11,
    }).start();
  }

  // ── Tab bar sync ──────────────────────────────────────
  useEffect(() => {
    navigation.setOptions({
      tabBarStyle: viewMode === "map" ? { display: "none" } : TAB_BAR_STYLE,
    });
  }, [viewMode]);

  // Reset sheet whenever we leave map mode
  useEffect(() => {
    if (viewMode !== "map") {
      sheetExpanded.current = false;
      sheetY.setValue(collapsedYRef.current);
    }
  }, [viewMode]);

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

  // ── Transition helpers ────────────────────────────────
  function animToDashboard() {
    Animated.parallel([
      Animated.timing(mapCtrlAnim, {
        toValue: 0,
        duration: 320,
        useNativeDriver: true,
      }),
      Animated.timing(dashAnim, {
        toValue: 1,
        duration: 420,
        useNativeDriver: true,
      }),
    ]).start();
  }

  function animToMap() {
    Animated.parallel([
      Animated.timing(dashAnim, {
        toValue: 0,
        duration: 320,
        useNativeDriver: true,
      }),
      Animated.timing(mapCtrlAnim, {
        toValue: 1,
        duration: 450,
        useNativeDriver: true,
      }),
    ]).start();
  }

  function handleExpandMap() {
    setViewMode("map");
    animToMap();
  }

  // ── Go Online ─────────────────────────────────────────
  async function handleGoOnline() {
    setIsGoingOnline(true);
    playBreakingGlass();

    if (viewMode === "dashboard") {
      setViewMode("map");
      animToMap();
    }

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === "granted") {
        const loc = await Location.getCurrentPositionAsync({});
        const socket = getSocket();
        socket?.emit("go_online", {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        });

        socket?.once("status_updated", ({ isOnline: online, status: s }) => {
          if (online) {
            setStatusLabel(s ?? "Online");
            setIsOnline(true);
            setIsGoingOnline(false);
          }
        });

        const { latitude, longitude } = loc.coords;
        setTimeout(() => {
          mapRef.current?.animateToRegion(
            {
              latitude,
              longitude,
              latitudeDelta: 0.002,
              longitudeDelta: 0.002,
            },
            700,
          );
        }, 150);
        setTimeout(() => {
          mapRef.current?.animateToRegion(
            {
              latitude,
              longitude,
              latitudeDelta: 0.015,
              longitudeDelta: 0.015,
            },
            900,
          );
        }, 1050);
      } else {
        setIsOnline(true);
        setIsGoingOnline(false);
        setStatusLabel("Online");
      }
    } catch {
      setIsOnline(true);
      setIsGoingOnline(false);
      setStatusLabel("Online");
    }
  }

  // ── Home button: map → dashboard ──────────────────────
  function handleHomePress() {
    sheetExpanded.current = false;
    sheetY.setValue(collapsedYRef.current);
    setViewMode("dashboard");
    animToDashboard();
  }

  // ── Go Offline ────────────────────────────────────────
  function handleGoOffline() {
    collapseSheet();
    setIsGoingOffline(true);
    const socket = getSocket();
    socket?.emit("go_offline");
    socket?.once("status_updated", () => {
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
    });
  }

  // ── Animated derived styles ───────────────────────────
  const mapOpacity = mapCtrlAnim;
  const mapTopY = mapCtrlAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-30, 0],
  });
  const actionBarY = mapCtrlAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [80, 0],
  });
  const dashOpacity = dashAnim;
  const dashScale = dashAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.97, 1],
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
          { bottom: actionBarH + 16, opacity: mapOpacity },
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
          Positioned directly above the action bar.
          translateY = SHEET_COLLAPSED → off-screen below
          translateY = 0               → fully expanded above bar
      ──────────────────────────────────────────────── */}
      <Animated.View
        pointerEvents={viewMode === "map" ? "auto" : "none"}
        style={[
          styles.sheetContent,
          {
            bottom: 0,
            height: sheetHeight,
            opacity: mapOpacity,
            transform: [{ translateY: sheetY }],
          },
        ]}
        {...contentPan.panHandlers}
      >
        {/* Header row — drag handle + title + list icon */}
        <View style={styles.sheetHeader}>
          <TouchableOpacity
            style={styles.sheetHeaderBtn}
            onPress={collapseSheet}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-down" size={22} color="#ffffff" />
          </TouchableOpacity>

          <TouchableOpacity
            style={{ flex: 1, alignItems: "center" }}
            onPress={collapseSheet}
            activeOpacity={1}
          >
            <Text style={styles.sheetHeaderTitle}>Recommended for you</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.sheetHeaderBtn}
            activeOpacity={0.7}
            onPress={collapseSheet}
          >
            <Ionicons name="list-outline" size={22} color="#ffffff" />
          </TouchableOpacity>
        </View>

        <View style={styles.sheetDivider} />

        {/* Expandable content */}
        <Text style={styles.sheetSectionLabel}>Later today</Text>

        <View style={styles.sheetCard}>
          <TouchableOpacity style={styles.sheetCardRow} activeOpacity={0.7}>
            <Ionicons
              name="bar-chart-outline"
              size={22}
              color="#9e9e9e"
              style={styles.sheetCardIcon}
            />
            <Text style={styles.sheetCardText}>See earnings trends</Text>
          </TouchableOpacity>
          <View style={styles.sheetCardInnerDivider} />
          <TouchableOpacity style={styles.sheetCardRow} activeOpacity={0.7}>
            <Ionicons
              name="star-outline"
              size={22}
              color="#9e9e9e"
              style={styles.sheetCardIcon}
            />
            <Text style={styles.sheetCardText}>See upcoming opportunities</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.waybillLink} activeOpacity={0.7}>
          <Text style={styles.waybillText}>Waybill</Text>
        </TouchableOpacity>

        {/* Spacer pushes the action row to the bottom of the sheet */}
        <View style={{ flex: 1 }} />

        {/* Bottom row — options | hand-circle | search */}
        <View
          style={[styles.sheetActionRow, { paddingBottom: insets.bottom + 8 }]}
        >
          <TouchableOpacity style={styles.actionBarBtn} activeOpacity={0.7}>
            <Ionicons name="options-outline" size={24} color="#ffffff" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionBarCenter}
            onPress={isOnline ? handleGoOffline : collapseSheet}
            disabled={isGoingOffline || isGoingOnline}
            activeOpacity={0.85}
          >
            <View
              style={[
                styles.handCircle,
                isOnline ? styles.handCircleOnline : styles.handCircleOffline,
              ]}
            >
              {isGoingOffline ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Ionicons
                  name="hand-left-outline"
                  size={30}
                  color={isOnline ? "#ffffff" : "#888888"}
                />
              )}
            </View>
            <Text
              style={[
                styles.handLabel,
                isOnline ? styles.handLabelOnline : styles.handLabelOffline,
              ]}
            >
              {isOnline ? "GO OFFLINE" : "OFFLINE"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionBarBtn} activeOpacity={0.7}>
            <Ionicons name="search" size={24} color="#ffffff" />
          </TouchableOpacity>
        </View>
      </Animated.View>

      {/* ──────────────────────────────────────────────────
          MAP MODE — persistent action bar
          Always at screen bottom. Tapping circle expands
          sheet (offline) or goes offline (online).
      ──────────────────────────────────────────────── */}
      <Animated.View
        pointerEvents={viewMode === "map" ? "box-none" : "none"}
        style={[
          styles.actionBar,
          {
            paddingBottom: insets.bottom + 8,
            opacity: mapOpacity,
            transform: [{ translateY: actionBarY }],
          },
        ]}
        {...contentPan.panHandlers}
      >
        <TouchableOpacity style={styles.actionBarBtn} activeOpacity={0.7}>
          <Ionicons name="options-outline" size={24} color="#ffffff" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.statusCenter}
          onPress={expandSheet}
          activeOpacity={0.7}
        >
          <Text style={styles.statusText}>
            {isOnline ? `You're ${statusLabel || "online"}` : "You're offline"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionBarBtn}
          activeOpacity={0.7}
          onPress={expandSheet}
        >
          <Ionicons name="list-outline" size={24} color="#ffffff" />
        </TouchableOpacity>
      </Animated.View>

      {/* ──────────────────────────────────────────────────
          DASHBOARD OVERLAY — dark scrollable home screen
      ──────────────────────────────────────────────── */}
      <Animated.View
        pointerEvents={viewMode === "dashboard" ? "auto" : "none"}
        style={[
          StyleSheet.absoluteFillObject,
          styles.dashOverlay,
          { opacity: dashOpacity, transform: [{ scale: dashScale }] },
        ]}
      >
        <View style={{ paddingTop: insets.top }}>
          {isOnline && (
            <TouchableOpacity
              style={styles.onlineBanner}
              onPress={handleExpandMap}
              activeOpacity={0.85}
            >
              <View style={styles.onlineDot} />
              {statusLabel ? (
                <Text style={styles.onlineBannerText}>
                  You're {statusLabel}
                </Text>
              ) : (
                <ActivityIndicator
                  size="small"
                  color="#ffffff"
                  style={{ marginRight: 4 }}
                />
              )}
              <Ionicons name="chevron-forward" size={16} color="#ffffff" />
            </TouchableOpacity>
          )}
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.dashScroll,
            { paddingBottom: insets.bottom + 120 },
          ]}
        >
          {/* Top-right icons */}
          <View style={styles.dashTopRow}>
            <View style={{ flex: 1 }} />
            <TouchableOpacity style={styles.darkCircleBtn} activeOpacity={0.8}>
              <Ionicons name="shield-outline" size={20} color="#ffffff" />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.darkCircleBtn, { marginLeft: 10 }]}
              activeOpacity={0.8}
            >
              <Ionicons name="options-outline" size={20} color="#ffffff" />
            </TouchableOpacity>
          </View>

          {/* Heading */}
          <Text style={styles.dashHeading}>
            {isOnline ? `You're ${statusLabel || "online"}` : "You're offline"}
          </Text>
          {!isOnline && <Text style={styles.dashSubtitle}>Ready to go?</Text>}

          {/* Mini map card */}
          <View style={styles.miniMapContainer}>
            <MapView
              ref={dashMapRef}
              style={StyleSheet.absoluteFillObject}
              initialRegion={INITIAL_REGION}
              showsUserLocation
              scrollEnabled={false}
              zoomEnabled={false}
              pitchEnabled={false}
              rotateEnabled={false}
            />
            <View style={styles.miniMapTint} pointerEvents="none" />
            <TouchableOpacity
              style={styles.mapOverlayBtnLeft}
              onPress={handleExpandMap}
              activeOpacity={0.8}
            >
              <Ionicons name="expand-outline" size={20} color="#ffffff" />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.mapOverlayBtnRight}
              activeOpacity={0.8}
            >
              <Ionicons name="search" size={20} color="#ffffff" />
            </TouchableOpacity>
          </View>

          {/* Discover opportunities */}
          <View style={styles.sectionRow}>
            <Text style={styles.sectionTitle}>Discover opportunities</Text>
            <TouchableOpacity
              style={styles.sectionArrowBtn}
              activeOpacity={0.8}
            >
              <Ionicons name="arrow-forward" size={18} color="#ffffff" />
            </TouchableOpacity>
          </View>

          {/* Earnings row */}
          <TouchableOpacity style={styles.earningsRow} activeOpacity={0.8}>
            <Ionicons name="bar-chart-outline" size={20} color="#ffffff" />
            <Text style={styles.earningsRowText}>Earnings</Text>
            <Ionicons name="chevron-forward" size={18} color="#666666" />
          </TouchableOpacity>
        </ScrollView>

        {/* Go Online button — fixed just above the tab bar (offline only) */}
        {!isOnline && (
          <View
            style={[
              styles.fixedGoOnlineWrap,
              { paddingBottom: insets.bottom + 12 },
            ]}
          >
            <TouchableOpacity
              style={styles.bigGoOnlineBtn}
              onPress={handleGoOnline}
              disabled={isGoingOnline}
              activeOpacity={0.85}
            >
              {isGoingOnline ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <>
                  <Ionicons
                    name="navigate-circle-outline"
                    size={26}
                    color="#ffffff"
                    style={{ marginRight: 10 }}
                  />
                  <Text style={styles.bigGoOnlineText}>Go online</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
      </Animated.View>

      {/* ──────────────────────────────────────────────────
          DELIVERY REQUEST MODAL
      ──────────────────────────────────────────────── */}
      <Modal
        visible={!!deliveryRequest}
        animationType="slide"
        transparent
        onRequestClose={() => setDeliveryRequest(null)}
      >
        <View style={styles.sheetOverlay}>
          <TouchableOpacity
            style={styles.sheetBackdrop}
            activeOpacity={1}
            onPress={() => setDeliveryRequest(null)}
          />
          <View style={[styles.modalPanel, styles.deliverySheetPanel]}>
            <Text style={styles.deliverySheetTitle}>New Delivery Request</Text>
            {[
              ["Order ID", deliveryRequest?.orderId],
              ["Restaurant", deliveryRequest?.restaurantName],
              ["Pickup", deliveryRequest?.pickupAddress],
              ["Delivery", deliveryRequest?.deliveryAddress],
            ].map(([label, value]) => (
              <View key={label} style={styles.deliveryRow}>
                <Text style={styles.deliveryLabel}>{label}</Text>
                <Text style={styles.deliveryValue}>{value}</Text>
              </View>
            ))}
            <View style={styles.deliveryRow}>
              <Text style={styles.deliveryLabel}>Fee</Text>
              <Text style={[styles.deliveryValue, styles.deliveryFee]}>
                £{deliveryRequest?.fee?.toFixed(2)}
              </Text>
            </View>
            <View style={styles.deliveryActions}>
              <TouchableOpacity
                style={[styles.deliveryBtn, styles.deliveryBtnDecline]}
                onPress={() => setDeliveryRequest(null)}
                activeOpacity={0.85}
              >
                <Text style={styles.deliveryBtnText}>Decline</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.deliveryBtn, styles.deliveryBtnAccept]}
                onPress={() => setDeliveryRequest(null)}
                activeOpacity={0.85}
              >
                <Text style={styles.deliveryBtnText}>Accept</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
    width: 72,
    height: 72,
    borderRadius: 36,
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
  sheetContent: {
    position: "absolute",
    left: 0,
    right: 0,
    backgroundColor: "#1a1a1a",
    // borderTopLeftRadius: 16,
    // borderTopRightRadius: 16,
    zIndex: 14,
    // shadow on top edge
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  sheetHeaderBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetHeaderTitle: {
    color: "#ffffff",
    fontSize: 17,
    fontWeight: "700",
  },
  sheetDivider: {
    height: 1,
    backgroundColor: "#2e2e2e",
  },
  sheetSectionLabel: {
    color: "#666666",
    fontSize: 13,
    textAlign: "center",
    paddingVertical: 14,
  },
  sheetCard: {
    marginHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#2e2e2e",
    overflow: "hidden",
    backgroundColor: "#0d0d0d",
  },
  sheetCardRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 18,
  },
  sheetCardIcon: {
    marginRight: 14,
  },
  sheetCardText: {
    color: "#9e9e9e",
    fontSize: 16,
  },
  sheetCardInnerDivider: {
    height: 1,
    backgroundColor: "#2e2e2e",
  },
  waybillLink: {
    alignItems: "center",
    paddingVertical: 20,
  },
  waybillText: {
    color: "#1a73e8",
    fontSize: 16,
    fontWeight: "600",
  },

  // ── Persistent action bar ─────────────────────────────
  actionBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#1a1a1a",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 30,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#2e2e2e",
    zIndex: 13,
  },
  actionBarBtn: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  statusCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  statusText: {
    color: "#ffffff",
    fontSize: 17,
    fontWeight: "700",
  },
  sheetActionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 30,
    paddingTop: 8,
  },
  actionBarCenter: {
    alignItems: "center",
  },
  handCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  handCircleOffline: {
    backgroundColor: "#2e2e2e",
  },
  handCircleOnline: {
    backgroundColor: "#c0392b",
    borderWidth: 3,
    borderColor: "#e53935",
  },
  handLabel: {
    fontSize: 11,
    fontWeight: "700",
    marginTop: 4,
    letterSpacing: 0.5,
  },
  handLabelOffline: {
    color: "#666666",
  },
  handLabelOnline: {
    color: "#e53935",
  },

  // ── Dashboard overlay ─────────────────────────────────
  dashOverlay: {
    backgroundColor: "#1a1a1a",
    zIndex: 20,
  },
  onlineBanner: {
    backgroundColor: "#1a73e8",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#ffffff",
    marginRight: 10,
  },
  onlineBannerText: {
    flex: 1,
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  dashScroll: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  dashTopRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
  },
  darkCircleBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#2e2e2e",
    alignItems: "center",
    justifyContent: "center",
  },
  dashHeading: {
    color: "#ffffff",
    fontSize: 34,
    fontWeight: "800",
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  dashSubtitle: {
    color: "#9e9e9e",
    fontSize: 17,
    marginBottom: 22,
  },
  miniMapContainer: {
    height: 220,
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 24,
    backgroundColor: "#333333",
  },
  miniMapTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(180, 100, 0, 0.15)",
  },
  mapOverlayBtnLeft: {
    position: "absolute",
    top: 12,
    left: 12,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.65)",
    alignItems: "center",
    justifyContent: "center",
  },
  mapOverlayBtnRight: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.65)",
    alignItems: "center",
    justifyContent: "center",
  },
  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  sectionTitle: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "700",
    flex: 1,
  },
  sectionArrowBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#2e2e2e",
    alignItems: "center",
    justifyContent: "center",
  },
  earningsRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#2e2e2e",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 20,
  },
  earningsRowText: {
    flex: 1,
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
    marginLeft: 12,
  },
  bigGoOnlineBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1a73e8",
    paddingVertical: 18,
    borderRadius: 50,
    marginTop: 4,
    elevation: 3,
    shadowColor: "#1a73e8",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
  },
  bigGoOnlineText: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  fixedGoOnlineWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingTop: 8,
    backgroundColor: "#1a1a1a",
  },

  // ── Delivery modal ────────────────────────────────────
  sheetOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  sheetBackdrop: {
    flex: 1,
  },
  modalPanel: {
    height: "70%",
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  deliverySheetPanel: {
    height: "auto",
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 36,
  },
  deliverySheetTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1a1a1a",
    marginBottom: 20,
    textAlign: "center",
  },
  deliveryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 14,
    gap: 12,
  },
  deliveryLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#666666",
    width: 100,
  },
  deliveryValue: {
    flex: 1,
    fontSize: 14,
    color: "#1a1a1a",
    textAlign: "right",
  },
  deliveryFee: {
    color: "#1a73e8",
    fontWeight: "700",
    fontSize: 16,
  },
  deliveryActions: {
    flexDirection: "row",
    gap: 14,
    marginTop: 24,
  },
  deliveryBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  deliveryBtnDecline: {
    backgroundColor: "#e53935",
  },
  deliveryBtnAccept: {
    backgroundColor: "#1a73e8",
  },
  deliveryBtnText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },
});
