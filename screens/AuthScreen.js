import React, { useState } from "react";
import {
  View,
  Text,
  Image,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { signInWithPhoneNumber } from "@react-native-firebase/auth";
import * as Location from "expo-location";
import { auth } from "../config/firebase";
import { API_URL } from "@env";
import * as colors from "../utils/colors";

export default function AuthScreen() {
  // Step: "phone" | "otp"
  const [step, setStep] = useState("phone");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [confirm, setConfirm] = useState(null);
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const [error, setError] = useState("");

  const fullNumber = `+237${phoneNumber.replace(/\D/g, "")}`;

  // ── Step 1: send OTP ───────────────────────────────────────
  const handleSendCode = async () => {
    setError("");
    const digits = phoneNumber.replace(/\D/g, "");
    if (digits.length < 9) {
      setError("Enter a valid 9-digit Cameroon number.");
      return;
    }
    try {
      setLoading(true);
      setStatusMsg("Sending SMS…");
      // Native app verification (Play Integrity / silent APNs) runs here; if it
      // can't complete, Firebase falls back to its own reCAPTCHA flow automatically.
      const confirmation = await signInWithPhoneNumber(auth, fullNumber);
      setConfirm(confirmation);
      setStep("otp");
    } catch (e) {
      setError(e?.message || "Failed to send code. Please try again.");
    } finally {
      setLoading(false);
      setStatusMsg("");
    }
  };

  // ── Step 2: verify OTP ────────────────────────────────────
  const handleVerifyCode = async () => {
    console.log("Verifying code...");
    setError("");
    if (otp.length < 6) {
      setError("Enter the full 6-digit code.");
      return;
    }
    try {
      setLoading(true);
      await confirm.confirm(otp);
      const user = auth.currentUser;

      // Best-effort location for session sync
      let currentLocation = null;
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === "granted") {
          const loc = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          currentLocation = {
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          };
        }
      } catch (_) {
        // Location unavailable — proceed without it
      }

      // Sync driver session to backend
      try {
        const idToken = await user.getIdToken();
        const baseUrl = API_URL.replace(/\/$/, "");
        console.log("Syncing session to backend..., API_URL:", baseUrl);
        // const controller = new AbortController();
        // const timer = setTimeout(() => controller.abort(), 8000);
        await fetch(`${baseUrl}/api/drivers/session`, {
          method: "POST",
          // signal: controller.signal,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            firebase_uid: user.uid,
            phone: fullNumber,
            is_online: false,
            status: "offline",
            current_location: currentLocation,
          }),
        });
        // clearTimeout(timer);
      } catch (e) {
        // Backend sync failed — auth still succeeds, user proceeds
        console.warn("Failed to sync with backend:", e.message || e);
      }
      // onAuthStateChanged in App.js will automatically switch to HomeScreen
    } catch {
      setError("Invalid code. Please check and try again.");
    } finally {
      setLoading(false);
    }
  };

  const goBack = () => {
    setStep("phone");
    setOtp("");
    setConfirm(null);
    setError("");
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          {/* Brand logo */}
          <Image
            source={require("../assets/auth-logo.png")}
            style={styles.authLogo}
            resizeMode="contain"
          />

          <View style={styles.body}>
            {/* ── Phone step ── */}
            {step === "phone" && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Enter your phone number</Text>
                <Text style={styles.cardSub}>
                  A verification code will be sent to your Cameroon number via
                  SMS.
                </Text>

                <View style={styles.phoneRow}>
                  <View style={styles.prefixBox}>
                    <Text style={styles.flag}>🇨🇲</Text>
                    <Text style={styles.prefix}>+237</Text>
                  </View>
                  <TextInput
                    style={styles.phoneInput}
                    placeholder="6 XX XX XX XX"
                    placeholderTextColor={colors.placeholder}
                    keyboardType="phone-pad"
                    maxLength={12}
                    value={phoneNumber}
                    onChangeText={(t) => {
                      setError("");
                      setPhoneNumber(t.replace(/[^\d\s]/g, ""));
                    }}
                    autoFocus
                    returnKeyType="send"
                    onSubmitEditing={handleSendCode}
                  />
                </View>

                {!!error && <Text style={styles.errorText}>{error}</Text>}

                {!!statusMsg && (
                  <Text style={styles.statusText}>{statusMsg}</Text>
                )}

                <TouchableOpacity
                  style={[styles.primaryBtn, loading && styles.btnDisabled]}
                  onPress={handleSendCode}
                  disabled={loading}
                  activeOpacity={0.85}
                >
                  {loading ? (
                    <ActivityIndicator color={colors.white} />
                  ) : (
                    <Text style={styles.primaryBtnText}>Send Code</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}

            {/* ── OTP step ── */}
            {step === "otp" && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Enter verification code</Text>
                <Text style={styles.cardSub}>
                  Code sent to{" "}
                  <Text style={styles.boldText}>+237 {phoneNumber}</Text>
                </Text>

                <TextInput
                  style={styles.otpInput}
                  placeholder="• • • • • •"
                  placeholderTextColor={colors.divider}
                  keyboardType="number-pad"
                  maxLength={6}
                  value={otp}
                  onChangeText={(t) => {
                    setError("");
                    setOtp(t.replace(/\D/g, ""));
                  }}
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={handleVerifyCode}
                />

                {!!error && <Text style={styles.errorText}>{error}</Text>}

                <TouchableOpacity
                  style={[styles.primaryBtn, loading && styles.btnDisabled]}
                  onPress={handleVerifyCode}
                  disabled={loading}
                  activeOpacity={0.85}
                >
                  {loading ? (
                    <ActivityIndicator color={colors.white} />
                  ) : (
                    <Text style={styles.primaryBtnText}>Verify Code</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity style={styles.backBtn} onPress={goBack}>
                  <Text style={styles.backBtnText}>← Change number</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bgLightAlt,
  },
  flex: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
  },

  // ── Branding ─────────────────────────────────────────────
  authLogo: {
    width: "100%",
    aspectRatio: 1,
    alignSelf: "center",
    marginTop: 4,
    zIndex: 0,
  },
  body: {
    paddingHorizontal: 24,
    paddingTop: 10,
    paddingBottom: 40,
    backgroundColor: colors.bgLightAlt,
    marginTop: -50,
  },

  // ── Card ─────────────────────────────────────────────────
  card: {
    backgroundColor: colors.white,
    borderRadius: 18,
    padding: 24,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 4,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.bg,
    marginBottom: 6,
  },
  cardSub: {
    fontSize: 13,
    color: colors.textDim,
    lineHeight: 19,
    marginBottom: 22,
  },
  boldText: {
    fontWeight: "700",
    color: colors.bg,
  },

  // ── Phone input row ───────────────────────────────────────
  phoneRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: colors.borderLight,
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 16,
    backgroundColor: colors.bgLight,
  },
  prefixBox: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 15,
    borderRightWidth: 1.5,
    borderRightColor: colors.borderLight,
    backgroundColor: colors.surfaceAltLight,
    gap: 6,
  },
  flag: {
    fontSize: 20,
  },
  prefix: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.surface,
  },
  phoneInput: {
    flex: 1,
    fontSize: 18,
    paddingHorizontal: 14,
    paddingVertical: 15,
    color: colors.bg,
    letterSpacing: 1.5,
  },

  // ── OTP input ─────────────────────────────────────────────
  otpInput: {
    borderWidth: 1.5,
    borderColor: colors.borderLight,
    borderRadius: 12,
    fontSize: 32,
    fontWeight: "700",
    letterSpacing: 18,
    textAlign: "center",
    paddingVertical: 18,
    color: colors.bg,
    backgroundColor: colors.bgLight,
    marginBottom: 16,
  },

  // ── Shared ────────────────────────────────────────────────
  errorText: {
    color: colors.danger,
    fontSize: 13,
    marginBottom: 12,
    textAlign: "center",
  },
  statusText: {
    color: colors.primary,
    fontSize: 13,
    marginBottom: 12,
    textAlign: "center",
  },
  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  btnDisabled: {
    opacity: 0.6,
  },
  primaryBtnText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  backBtn: {
    marginTop: 18,
    alignItems: "center",
  },
  backBtnText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: "600",
  },
});
