/**
 * MiniMapCard — the non-interactive mini map preview shown on the dashboard.
 *
 * Props:
 *   mapRef        — ref forwarded to the inner MapView (used to animate region)
 *   initialRegion — initial map region
 *   onExpand      — called when the expand button is pressed
 */
import React from "react";
import { View, TouchableOpacity, StyleSheet } from "react-native";
import MapView from "react-native-maps";
import { Ionicons } from "@expo/vector-icons";

export default function MiniMapCard({ mapRef, initialRegion, onExpand }) {
  return (
    <View style={styles.miniMapContainer}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        initialRegion={initialRegion}
        showsUserLocation
        scrollEnabled={false}
        zoomEnabled={false}
        pitchEnabled={false}
        rotateEnabled={false}
      />
      <View style={styles.miniMapTint} pointerEvents="none" />
      <TouchableOpacity
        style={styles.mapOverlayBtnLeft}
        onPress={onExpand}
        activeOpacity={0.8}
      >
        <Ionicons name="expand-outline" size={20} color="#ffffff" />
      </TouchableOpacity>
      <TouchableOpacity style={styles.mapOverlayBtnRight} activeOpacity={0.8}>
        <Ionicons name="search" size={20} color="#ffffff" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
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
});
