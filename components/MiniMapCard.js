/**
 * MiniMapCard — the non-interactive mini map preview shown on the dashboard.
 *
 * Props:
 *   mapRef        — ref forwarded to the inner MapView (used to animate region)
 *   initialRegion — initial map region
 *   onExpand      — called when the card (or the expand button) is pressed
 */
import React from "react";
import { View, TouchableOpacity, StyleSheet } from "react-native";
import NativeMap from "./NativeMap";
import { Ionicons } from "@expo/vector-icons";
import * as colors from "../utils/colors";

export default function MiniMapCard({ mapRef, initialRegion, onExpand }) {
  return (
    <TouchableOpacity
      style={styles.miniMapContainer}
      onPress={onExpand}
      activeOpacity={0.8}
    >
      <NativeMap
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={initialRegion}
        showsUserLocation
        interactive={false}
      />
      <View style={styles.miniMapTint} pointerEvents="none" />
      <TouchableOpacity
        style={styles.mapOverlayBtnLeft}
        onPress={onExpand}
        activeOpacity={0.8}
      >
        <Ionicons name="expand-outline" size={20} color={colors.white} />
      </TouchableOpacity>
      <TouchableOpacity style={styles.mapOverlayBtnRight} activeOpacity={0.8}>
        <Ionicons name="search" size={20} color={colors.white} />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  miniMapContainer: {
    height: 220,
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 24,
    backgroundColor: colors.surface,
  },
  miniMapTint: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.primaryTint,
  },
  mapOverlayBtnLeft: {
    position: "absolute",
    top: 12,
    left: 12,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.scrim,
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
    backgroundColor: colors.scrim,
    alignItems: "center",
    justifyContent: "center",
  },
});
