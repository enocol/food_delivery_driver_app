import React, { useRef, useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ActivityIndicator,
} from "react-native";
import MapView from "react-native-maps";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Location from "expo-location";
import { useOnlineStatus } from "../context/OnlineContext";
import { playBreakingGlass } from "../utils/audio";
import { INITIAL_REGION } from "../constants/map";
import DeliveryRequestModal from "../components/DeliveryRequestModal";
import {
  getSocket,
  addSocketListener,
  removeSocketListener,
} from "../config/socket";

export default function OnlineMapScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { isOnline, setIsOnline, statusLabel, setStatusLabel } =
    useOnlineStatus();
  const mapRef = useRef(null);
  const [isGoingOnline, setIsGoingOnline] = useState(false);
  const [isGoingOffline, setIsGoingOffline] = useState(false);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [deliveryRequest, setDeliveryRequest] = useState(null);

  // Listen for incoming delivery requests
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

  // Go online on mount (only if not already online from a previous session)
  useEffect(() => {
    if (!isOnline) {
      goOnline();
    } else {
      // Already online — just center the map
      centerOnUser();
    }
  }, []);

  async function centerOnUser() {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") return;
    const loc = await Location.getCurrentPositionAsync({});
    mapRef.current?.animateToRegion(
      {
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        latitudeDelta: 0.015,
        longitudeDelta: 0.015,
      },
      700,
    );
  }

  async function goOnline() {
    setIsGoingOnline(true);
    playBreakingGlass();
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

        // Zoom-in then zoom-back-out animation
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
      }
    } catch {
      setIsOnline(true);
      setIsGoingOnline(false);
    }
  }

  function handleGoOffline() {
    setSheetVisible(false);
    setIsGoingOffline(true);
    const socket = getSocket();
    socket?.emit("go_offline");
    socket?.once("status_updated", () => {
      setStatusLabel(null);
      setIsOnline(false);
      setIsGoingOffline(false);
      navigation.goBack();
    });
  }

  return (
    <View style={styles.container}>
      {/* Full-screen map */}
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

      {/* Loading overlay while going online */}
      {isGoingOnline && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#ffffff" />
          <Text style={styles.loadingText}>Going online…</Text>
        </View>
      )}

      {/* ── Top bar ─────────────────────────────────────── */}
      <View style={[styles.topBar, { paddingTop: insets.top + 12 }]}>
        {/* Home button */}
        <TouchableOpacity
          style={styles.circleBtn}
          onPress={() => navigation.goBack()}
          activeOpacity={0.8}
        >
          <Ionicons name="home-outline" size={22} color="#1a1a1a" />
        </TouchableOpacity>

        {/* Earnings pill */}
        <View style={styles.earningsPill}>
          <Text style={styles.earningsText}>£0.00</Text>
        </View>

        {/* Search button */}
        <TouchableOpacity style={styles.circleBtn} activeOpacity={0.8}>
          <Ionicons name="search" size={22} color="#1a1a1a" />
        </TouchableOpacity>
      </View>

      {/* ── Bottom status bar ───────────────────────────── */}
      <TouchableOpacity
        style={[styles.bottomBar, { paddingBottom: insets.bottom + 14 }]}
        activeOpacity={0.9}
      >
        <TouchableOpacity style={styles.bottomIconBtn} activeOpacity={0.7}>
          <Ionicons name="options-outline" size={24} color="#1a1a1a" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.bottomCenter}
          onPress={() => setSheetVisible(true)}
          activeOpacity={0.9}
        >
          <Text style={styles.bottomStatusText}>You're {statusLabel}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.bottomIconBtn} activeOpacity={0.7}>
          <Ionicons name="menu-outline" size={40} color="#1a1a1a" />
        </TouchableOpacity>
      </TouchableOpacity>

      {/* ── Delivery request sheet ───────────────────────── */}
      <DeliveryRequestModal
        request={deliveryRequest}
        onAccept={() => setDeliveryRequest(null)}
        onDecline={() => setDeliveryRequest(null)}
        onClose={() => setDeliveryRequest(null)}
      />

      {/* ── Go Offline sheet ────────────────────────────── */}
      <Modal
        visible={sheetVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setSheetVisible(false)}
      >
        <View style={styles.sheetOverlay}>
          <TouchableOpacity
            style={styles.sheetBackdrop}
            activeOpacity={1}
            onPress={() => setSheetVisible(false)}
          />
          <View style={styles.sheetPanel}>
            <TouchableOpacity
              style={styles.sheetCloseBtn}
              onPress={() => setSheetVisible(false)}
              activeOpacity={0.7}
            >
              <Text style={styles.sheetCloseTxt}>✕</Text>
            </TouchableOpacity>
            <View style={styles.sheetBody}>
              <TouchableOpacity
                style={styles.goOfflineButton}
                onPress={handleGoOffline}
                activeOpacity={0.85}
                disabled={isGoingOffline}
              >
                {isGoingOffline ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.goOfflineText}>Go{"\n"}Offline</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#e8e4d9",
  },

  // ── Loading overlay ─────────────────────────────────
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.52)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 20,
  },
  loadingText: {
    color: "#ffffff",
    marginTop: 14,
    fontSize: 16,
    fontWeight: "600",
  },

  // ── Top bar ─────────────────────────────────────────
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
  circleBtn: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  earningsPill: {
    backgroundColor: "#1a1a1a",
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 28,
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  earningsText: {
    color: "#4cff91",
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: 0.3,
  },

  // ── Bottom status bar ────────────────────────────────
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#ffffff",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 16,
    elevation: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  bottomIconBtn: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  bottomCenter: {
    flex: 1,
    alignItems: "center",
  },
  bottomStatusText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1a1a1a",
    letterSpacing: 0.2,
  },

  // ── Sheet shared ─────────────────────────────────────
  sheetOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  sheetBackdrop: {
    flex: 1,
  },
  sheetPanel: {
    height: "70%",
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  sheetCloseBtn: {
    position: "absolute",
    top: 16,
    right: 20,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#f0f0f0",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  sheetCloseTxt: {
    fontSize: 16,
    color: "#333333",
    fontWeight: "600",
  },
  sheetBody: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
    paddingBottom: 60,
  },
  goOfflineButton: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "#e53935",
    alignItems: "center",
    justifyContent: "center",
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.22,
    shadowRadius: 5,
  },
  goOfflineText: {
    color: "#ffffff",
    fontSize: 17,
    fontWeight: "700",
    textAlign: "center",
    lineHeight: 24,
  },
});
