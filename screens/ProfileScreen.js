import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { signOut } from "@react-native-firebase/auth";
import { auth } from "../config/firebase";
import * as colors from "../utils/colors";

export default function ProfileScreen() {
  const [loading, setLoading] = useState(false);

  const handleLogout = () => {
    Alert.alert("Log out", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log out",
        style: "destructive",
        onPress: async () => {
          try {
            setLoading(true);
            await signOut(auth);
            // onAuthStateChanged in App.js will switch back to AuthScreen
          } catch {
            Alert.alert("Error", "Could not log out. Please try again.");
          } finally {
            setLoading(false);
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Profile</Text>

      <TouchableOpacity
        style={styles.logoutBtn}
        onPress={handleLogout}
        disabled={loading}
        activeOpacity={0.8}
      >
        {loading ? (
          <ActivityIndicator color={colors.danger} />
        ) : (
          <Text style={styles.logoutText}>Log out</Text>
        )}
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.bg,
    marginBottom: 40,
  },
  logoutBtn: {
    borderWidth: 1.5,
    borderColor: colors.danger,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 48,
    alignItems: "center",
  },
  logoutText: {
    color: colors.danger,
    fontSize: 16,
    fontWeight: "600",
  },
});
