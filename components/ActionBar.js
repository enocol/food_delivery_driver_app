/**
 * ActionBar — persistent bottom bar shown in map mode.
 *
 * Always pinned to the screen bottom. Tapping the center status text or the
 * list icon expands the sheet. While online, an indeterminate status line
 * animates beneath the row.
 *
 * Props:
 *   viewMode      — current screen mode ("map" | "dashboard")
 *   bottomInset   — safe-area bottom inset (device)
 *   mapOpacity    — Animated value driving the bar opacity
 *   actionBarY    — Animated value for translateY
 *   panHandlers   — PanResponder panHandlers for drag-to-expand
 *   isOnline      — driver online state
 *   statusLabel   — current status text
 *   expandSheet   — expands the sheet
 *   lineTranslate — Animated value for the status line translateX
 *   onLineLayout  — onLayout handler to measure the line track width
 */
import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

export default function ActionBar({
  viewMode,
  bottomInset = 0,
  mapOpacity,
  actionBarY,
  panHandlers,
  isOnline,
  statusLabel,
  expandSheet,
  lineTranslate,
  onLineLayout,
}) {
  return (
    <Animated.View
      pointerEvents={viewMode === "map" ? "box-none" : "none"}
      style={[
        styles.actionBar,
        {
          paddingBottom: bottomInset + 8,
          opacity: mapOpacity,
          transform: [{ translateY: actionBarY }],
        },
      ]}
      {...panHandlers}
    >
      <View style={styles.actionBarRow}>
        <TouchableOpacity style={styles.actionBarBtn} activeOpacity={0.7}>
          <Ionicons name="options-outline" size={24} color="#ffffff" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.statusCenter}
          onPress={expandSheet}
          activeOpacity={0.7}
        >
          <Text style={styles.statusText}>
            {isOnline
              ? `You're ${statusLabel}`
              : `You're ${statusLabel || "Offline"}`}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionBarBtn}
          activeOpacity={0.7}
          onPress={expandSheet}
        >
          <Ionicons name="list-outline" size={24} color="#ffffff" />
        </TouchableOpacity>
      </View>

      {isOnline && (
        <View style={styles.lineTrack} onLayout={onLineLayout}>
          <Animated.View
            style={[
              styles.lineSegment,
              { transform: [{ translateX: lineTranslate }] },
            ]}
          />
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  actionBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#1a1a1a",
    paddingHorizontal: 30,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#2e2e2e",
    zIndex: 13,
  },
  actionBarRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  lineTrack: {
    height: 3,
    borderRadius: 2,
    backgroundColor: "#2e2e2e",
    overflow: "hidden",
    marginTop: 10,
    marginHorizontal: -30,
  },
  lineSegment: {
    width: "20%",
    height: "100%",
    borderRadius: 2,
    backgroundColor: "#ffffff",
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
});
