/**
 * SlidingSheet — the map-mode bottom sheet content that slides up/down.
 *
 * Renders the animated sheet panel: header (drag handle / title / list),
 * "Later today" cards, Waybill link, and the bottom action row with the
 * hand-circle (GO OFFLINE while online, expand while offline).
 *
 * Props:
 *   viewMode       — current screen mode ("map" | "dashboard")
 *   sheetHeight    — computed height of the sheet
 *   sheetY         — Animated.Value for translateY
 *   mapOpacity     — Animated value driving the sheet opacity
 *   panHandlers    — PanResponder panHandlers for drag-to-collapse
 *   bottomInset    — safe-area bottom inset (device)
 *   isOnline       — driver online state
 *   isGoingOnline  — true while going online
 *   isGoingOffline — true while going offline
 *   collapseSheet  — collapses the sheet
 *   onGoOffline    — called to go offline (when online)
 */
import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as colors from "../utils/colors";

export default function SlidingSheet({
  viewMode,
  sheetHeight,
  sheetY,
  mapOpacity,
  panHandlers,
  bottomInset = 0,
  isOnline,
  isGoingOnline,
  isGoingOffline,
  collapseSheet,
  onGoOffline,
}) {
  return (
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
      {...panHandlers}
    >
      {/* Header row — drag handle + title + list icon */}
      <View style={styles.sheetHeader}>
        <TouchableOpacity
          style={styles.sheetHeaderBtn}
          onPress={collapseSheet}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-down" size={22} color={colors.white} />
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
          <Ionicons name="list-outline" size={22} color={colors.white} />
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
            color={colors.textMuted}
            style={styles.sheetCardIcon}
          />
          <Text style={styles.sheetCardText}>See earnings trends</Text>
        </TouchableOpacity>
        <View style={styles.sheetCardInnerDivider} />
        <TouchableOpacity style={styles.sheetCardRow} activeOpacity={0.7}>
          <Ionicons
            name="star-outline"
            size={22}
            color={colors.textMuted}
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
      <View style={[styles.sheetActionRow, { paddingBottom: bottomInset + 8 }]}>
        <TouchableOpacity style={styles.actionBarBtn} activeOpacity={0.7}>
          <Ionicons name="options-outline" size={24} color={colors.white} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionBarCenter}
          onPress={isOnline ? onGoOffline : collapseSheet}
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
              <ActivityIndicator color={colors.white} />
            ) : (
              <Ionicons
                name="hand-left-outline"
                size={30}
                color={isOnline ? colors.white : colors.textDim}
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
          <Ionicons name="search" size={24} color={colors.white} />
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sheetContent: {
    position: "absolute",
    left: 0,
    right: 0,
    backgroundColor: colors.bg,
    zIndex: 14,
    shadowColor: colors.black,
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
    color: colors.white,
    fontSize: 17,
    fontWeight: "700",
  },
  sheetDivider: {
    height: 1,
    backgroundColor: colors.border,
  },
  sheetSectionLabel: {
    color: colors.textFaint,
    fontSize: 13,
    textAlign: "center",
    paddingVertical: 14,
  },
  sheetCard: {
    marginHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    backgroundColor: colors.bgDeep,
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
    color: colors.textMuted,
    fontSize: 16,
  },
  sheetCardInnerDivider: {
    height: 1,
    backgroundColor: colors.border,
  },
  waybillLink: {
    alignItems: "center",
    paddingVertical: 20,
  },
  waybillText: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: "600",
  },
  sheetActionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 30,
    paddingTop: 8,
  },
  actionBarBtn: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  actionBarCenter: {
    alignItems: "center",
  },
  handCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: "center",
    justifyContent: "center",
  },
  handCircleOffline: {
    backgroundColor: colors.border,
  },
  handCircleOnline: {
    backgroundColor: colors.dangerDark,
    borderWidth: 3,
    borderColor: colors.danger,
  },
  handLabel: {
    fontSize: 11,
    fontWeight: "700",
    marginTop: 4,
    letterSpacing: 0.5,
  },
  handLabelOffline: {
    color: colors.textFaint,
  },
  handLabelOnline: {
    color: colors.danger,
  },
});
