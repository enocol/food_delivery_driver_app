import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Animated,
  Easing,
  Dimensions,
  ActivityIndicator,
} from "react-native";

const SCREEN_WIDTH = Dimensions.get("window").width;
import { SafeAreaView } from "react-native-safe-area-context";
import MapView, { Marker } from "react-native-maps";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { createAudioPlayer, setAudioModeAsync } from "expo-audio";
import {
  getSocket,
  addSocketListener,
  removeSocketListener,
} from "../config/socket";

const GLASS_SOUND = require("../assets/sounds/breaking-glass.mp3");

async function playBreakingGlass() {
  try {
    await setAudioModeAsync({
      playsInSilentMode: true,
      interruptionMode: "mixWithOthers",
    });
    const player = createAudioPlayer(GLASS_SOUND);
    player.play();
    // Release from memory once playback finishes
    player.addListener("playbackStatusUpdate", (status) => {
      if (status.didJustFinish) player.remove();
    });
  } catch {
    // Sound failure should never block going online
  }
}

const INITIAL_REGION = {
  latitude: 37.7749,
  longitude: -122.4194,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

export default function HomeScreen() {
  const [isOnline, setIsOnline] = useState(false);
  const [isGoingOnline, setIsGoingOnline] = useState(false);
  const [isGoingOffline, setIsGoingOffline] = useState(false);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [userLocation, setUserLocation] = useState(null);
  const [headerLabel, setHeaderLabel] = useState(null);
  const [deliveryRequest, setDeliveryRequest] = useState(null);
  const mapRef = useRef(null);
  const marqueeX = useRef(new Animated.Value(0)).current;
  const bounceAnim = useRef(null);

  useEffect(() => {
    function onNewDelivery({
      orderId,
      restaurantName,
      pickupAddress,
      deliveryAddress,
      fee,
    }) {
      console.log("[socket] new_delivery_available received:", {
        orderId,
        restaurantName,
        pickupAddress,
        deliveryAddress,
        fee,
      });
      setDeliveryRequest({
        orderId,
        restaurantName,
        pickupAddress,
        deliveryAddress,
        fee,
      });
    }

    addSocketListener("new_delivery_available", onNewDelivery);

    return () => {
      removeSocketListener("new_delivery_available", onNewDelivery);
    };
  }, []);

  // Center map at user's location on mount (offline state)
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      const loc = await Location.getCurrentPositionAsync({});
      setUserLocation(loc.coords);
      mapRef.current?.animateToRegion(
        {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          latitudeDelta: 0.015,
          longitudeDelta: 0.015,
        },
        700,
      );
    })();
  }, []);

  useEffect(() => {
    if (isOnline) {
      const edge = SCREEN_WIDTH / 2 - 40;
      marqueeX.setValue(-edge);

      const bounce = (toValue) => {
        bounceAnim.current = Animated.timing(marqueeX, {
          toValue,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        });
        bounceAnim.current.start(({ finished }) => {
          if (finished) bounce(-toValue);
        });
      };

      bounce(edge);
    } else {
      bounceAnim.current?.stop();
      marqueeX.setValue(0);
    }
    return () => bounceAnim.current?.stop();
  }, [isOnline]);

  const handleGoOnline = async () => {
    setIsGoingOnline(true);
    playBreakingGlass();
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === "granted") {
        const loc = await Location.getCurrentPositionAsync({});
        setUserLocation(loc.coords);

        // Notify server — joins driver to the available_drivers room
        const socket = getSocket();
        socket?.emit("go_online", {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        });

        // Wait for server confirmation before going online
        socket?.once("status_updated", ({ status }) => {
          if (status) {
            setHeaderLabel(status);
            setIsOnline(true);
            setIsGoingOnline(false);
          }
        });

        const { latitude, longitude } = loc.coords;

        // Step 1 — zoom in close (starts after map renders)
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

        // Step 2 — zoom back out to normal view
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
        }, 1050); // 150ms delay + 700ms zoom-in + 200ms hold
      } else {
        // Location permission denied — go online without server confirmation
        setIsGoingOnline(false);
        setIsOnline(true);
      }
    } catch {
      // Fallback — go online even if location fails
      setIsGoingOnline(false);
      setIsOnline(true);
    }
  };

  const handleGoOffline = () => {
    setSheetVisible(false);
    setIsGoingOffline(true);
    const socket = getSocket();
    socket?.emit("go_offline");

    // Wait for server confirmation before going offline
    socket?.once("status_updated", ({ status }) => {
      setHeaderLabel(status || null);
      setIsOnline(false);
      setIsGoingOffline(false);
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Status header */}
      <View style={[styles.header, isOnline && styles.headerOnline]}>
        <Text style={styles.headerText}>
          {`You Are ${headerLabel || "Offline"}`}
        </Text>
        {isOnline && (
          <Animated.View
            style={[
              styles.headerBar,
              { transform: [{ translateX: marqueeX }] },
            ]}
          />
        )}
      </View>

      {/* Map */}
      <View style={styles.mapWrapper}>
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFillObject}
          initialRegion={INITIAL_REGION}
          scrollEnabled
          zoomEnabled
          pitchEnabled
          rotateEnabled
          toolbarEnabled={true}
          showsUserLocation={true}
        ></MapView>

        {/* Recenter button — always visible, bottom-right */}
        <TouchableOpacity
          style={[
            styles.recenterButton,
            isOnline && styles.recenterButtonAboveHamburger,
          ]}
          onPress={() => {
            if (!userLocation) return;
            mapRef.current?.animateToRegion(
              {
                latitude: userLocation.latitude,
                longitude: userLocation.longitude,
                latitudeDelta: 0.015,
                longitudeDelta: 0.015,
              },
              600,
            );
          }}
          activeOpacity={0.8}
        >
          <Ionicons name="locate" size={22} color="#1a73e8" />
        </TouchableOpacity>

        {/* Hamburger button — bottom-right of map, only when online */}
        {isOnline && (
          <TouchableOpacity
            style={styles.hamburgerButton}
            onPress={() => setSheetVisible(true)}
            activeOpacity={0.8}
          >
            <View style={styles.hamburgerLine} />
            <View style={styles.hamburgerLine} />
            <View style={styles.hamburgerLine} />
          </TouchableOpacity>
        )}
      </View>

      {/* Go Online button — only when offline */}
      {!isOnline && (
        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={styles.goOnlineButton}
            activeOpacity={0.85}
            onPress={handleGoOnline}
            disabled={isGoingOnline}
          >
            {isGoingOnline ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.goOnlineText}>Go Online</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Delivery request bottom sheet */}
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
          <View style={[styles.sheetPanel, styles.deliverySheetPanel]}>
            <Text style={styles.deliverySheetTitle}>New Delivery Request</Text>

            <View style={styles.deliveryRow}>
              <Text style={styles.deliveryLabel}>Order ID</Text>
              <Text style={styles.deliveryValue}>
                {deliveryRequest?.orderId}
              </Text>
            </View>
            <View style={styles.deliveryRow}>
              <Text style={styles.deliveryLabel}>Restaurant</Text>
              <Text style={styles.deliveryValue}>
                {deliveryRequest?.restaurantName}
              </Text>
            </View>
            <View style={styles.deliveryRow}>
              <Text style={styles.deliveryLabel}>Pickup</Text>
              <Text style={styles.deliveryValue}>
                {deliveryRequest?.pickupAddress}
              </Text>
            </View>
            <View style={styles.deliveryRow}>
              <Text style={styles.deliveryLabel}>Delivery</Text>
              <Text style={styles.deliveryValue}>
                {deliveryRequest?.deliveryAddress}
              </Text>
            </View>
            <View style={styles.deliveryRow}>
              <Text style={styles.deliveryLabel}>Fee</Text>
              <Text style={[styles.deliveryValue, styles.deliveryFee]}>
                ${deliveryRequest?.fee?.toFixed(2)}
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

      {/* Bottom sheet — 70 % height */}
      <Modal
        visible={sheetVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setSheetVisible(false)}
      >
        <View style={styles.sheetOverlay}>
          {/* Backdrop — tap to close */}
          <TouchableOpacity
            style={styles.sheetBackdrop}
            activeOpacity={1}
            onPress={() => setSheetVisible(false)}
          />

          {/* Panel */}
          <View style={styles.sheetPanel}>
            {/* Close button */}
            <TouchableOpacity
              style={styles.sheetCloseBtn}
              onPress={() => setSheetVisible(false)}
              activeOpacity={0.7}
            >
              <Text style={styles.sheetCloseTxt}>✕</Text>
            </TouchableOpacity>

            {/* Go Offline round button — centered, near bottom */}
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },

  // ── Header ──────────────────────────────────────────────
  header: {
    backgroundColor: "#1a1a1a",
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  headerOnline: {
    backgroundColor: "#1a73e8",
  },
  headerText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
    letterSpacing: 0.4,
  },
  headerBar: {
    marginTop: 6,
    width: 40,
    height: 3,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.75)",
  },

  // ── Map ─────────────────────────────────────────────────
  mapWrapper: {
    flex: 1,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },

  // ── Diagonal double-headed arrow ─────────────────────────
  arrowContainer: {
    position: "absolute",
    top: 24,
    left: 24,

    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
    width: 90,
    height: 90,
    borderRadius: 45,
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.22,
    shadowRadius: 4,
  },
  // ── Person location marker ───────────────────────────────
  personMarker: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#1a73e8",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2.5,
    borderColor: "#ffffff",
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },

  // ── Hamburger button ────────────────────────────────────
  recenterButton: {
    position: "absolute",
    bottom: 30,
    right: 20,
    width: 48,
    height: 48,
    backgroundColor: "#ffffff",
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.22,
    shadowRadius: 4,
  },
  recenterButtonAboveHamburger: {
    bottom: 84, // 20 (hamburger bottom) + 48 (hamburger height) + 16 (gap)
  },
  hamburgerButton: {
    position: "absolute",
    bottom: 20,
    right: 20,
    width: 48,
    height: 48,
    backgroundColor: "#ffffff",
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    rowGap: 5,
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.22,
    shadowRadius: 4,
  },
  hamburgerLine: {
    width: 22,
    height: 2.5,
    backgroundColor: "#1a1a1a",
    borderRadius: 2,
  },

  // ── Go Online button ────────────────────────────────────
  buttonContainer: {
    paddingVertical: 20,
    paddingHorizontal: 16,
    alignItems: "center",
    backgroundColor: "#ffffff",
  },
  goOnlineButton: {
    width: "80%",
    backgroundColor: "#1a73e8",
    paddingVertical: 16,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
  },
  goOnlineText: {
    color: "#ffffff",
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: 0.3,
  },

  // ── Bottom sheet ────────────────────────────────────────
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

  // ── Delivery request sheet ───────────────────────────────
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
