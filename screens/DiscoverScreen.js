import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function DiscoverScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.text}>Discover</Text>
      <Text style={styles.sub}>Opportunities will appear here.</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1a1a1a",
    alignItems: "center",
    justifyContent: "center",
  },
  text: {
    color: "#ffffff",
    fontSize: 22,
    fontWeight: "700",
  },
  sub: {
    color: "#9e9e9e",
    fontSize: 14,
    marginTop: 8,
  },
});
