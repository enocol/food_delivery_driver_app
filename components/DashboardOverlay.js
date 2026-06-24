import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import MiniMapCard from "./MiniMapCard";
import GoOnlineButton from "./GoOnlineButton";
import { INITIAL_REGION } from "../constants/map";

/**
 * DashboardOverlay — dark scrollable home surface shown over the persistent map.
 */
export default function DashboardOverlay({
  viewMode,
  insets,
  isOnline,
  statusLabel,
  dashMapRef,
  dashOpacity,
  dashScale,
  isGoingOnline,
  onExpandMap,
  onGoOnline,
}) {
  return (
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
            onPress={onExpandMap}
            activeOpacity={0.85}
          >
            <View style={styles.onlineDot} />
            {statusLabel ? (
              <Text style={styles.onlineBannerText}>You're {statusLabel}</Text>
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
          {isOnline ? `You're ${statusLabel}` : `You're offline`}
        </Text>
        {!isOnline && <Text style={styles.dashSubtitle}>Ready to go?</Text>}

        {/* Mini map card */}
        <MiniMapCard
          mapRef={dashMapRef}
          initialRegion={INITIAL_REGION}
          onExpand={onExpandMap}
        />

        {/* Discover opportunities */}
        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>Discover opportunities</Text>
          <TouchableOpacity style={styles.sectionArrowBtn} activeOpacity={0.8}>
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
        <GoOnlineButton
          onPress={onGoOnline}
          loading={isGoingOnline}
          bottomInset={insets.bottom}
        />
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
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
});
