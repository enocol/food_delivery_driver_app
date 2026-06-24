/**
 * GoOnlineButton — fixed "Go online" button shown above the tab bar
 * on the dashboard while the driver is offline.
 *
 * Props:
 *   onPress     — called when the button is pressed
 *   loading     — when true, shows a spinner and disables the button
 *   bottomInset — safe-area bottom inset (device); padding is bottomInset + 12
 */
import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

export default function GoOnlineButton({ onPress, loading, bottomInset = 0 }) {
  return (
    <View
      style={[styles.fixedGoOnlineWrap, { paddingBottom: bottomInset + 12 }]}
    >
      <TouchableOpacity
        style={styles.bigGoOnlineBtn}
        onPress={onPress}
        disabled={loading}
        activeOpacity={0.85}
      >
        {loading ? (
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
  );
}

const styles = StyleSheet.create({
  fixedGoOnlineWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingTop: 8,
    backgroundColor: "#1a1a1a",
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
});
