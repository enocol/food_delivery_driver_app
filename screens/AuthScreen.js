import React, { useState, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { FirebaseRecaptchaVerifierModal } from "expo-firebase-recaptcha";
import { PhoneAuthProvider, signInWithCredential } from "firebase/auth";
import * as Location from "expo-location";
import { app, auth } from "../config/firebase";
// import { API_URL } from "@env";

export default function AuthScreen() {
  const recaptchaVerifier = useRef(null);
  // Step: "phone" | "otp"
  const [step, setStep] = useState("phone");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [verificationId, setVerificationId] = useState(null);
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
      setStatusMsg("A security check will appear — please complete it…");
      const provider = new PhoneAuthProvider(auth);

      const timeout = new Promise((_, reject) =>
        setTimeout(
          () =>
            reject(new Error("Security check timed out. Please try again.")),
          45000,
        ),
      );

      const id = await Promise.race([
        provider.verifyPhoneNumber(fullNumber, recaptchaVerifier.current),
        timeout,
      ]);
      setStatusMsg("Sending SMS…");
      setVerificationId(id);
      setStep("otp");
    } catch (e) {
      setError(e.message || "Failed to send code. Please try again.");
    } finally {
      setLoading(false);
      setStatusMsg("");
    }
  };

  // ── Step 2: verify OTP ────────────────────────────────────
  const handleVerifyCode = async () => {
    console.log("Verifying code...");
    const API_URL = process.env.API_URL;
    setError("");
    if (otp.length < 6) {
      setError("Enter the full 6-digit code.");
      return;
    }
    try {
      setLoading(true);
      const credential = PhoneAuthProvider.credential(verificationId, otp);
      const userCredential = await signInWithCredential(auth, credential);

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
        const idToken = await userCredential.user.getIdToken();
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
            firebase_uid: userCredential.user.uid,
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
    setVerificationId(null);
    setError("");
  };

  return (
    <SafeAreaView style={styles.safe}>
      <FirebaseRecaptchaVerifierModal
        ref={recaptchaVerifier}
        firebaseConfig={app.options}
        attemptInvisibleVerification={false}
      />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          {/* Logo / branding */}
          <View style={styles.logoArea}>
            <Text style={styles.logoEmoji}>🚗</Text>
            <Text style={styles.appName}>Deliver Driver</Text>
            <Text style={styles.tagline}>Sign in to start delivering</Text>
          </View>

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
                  placeholderTextColor="#bbb"
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
                  <ActivityIndicator color="#fff" />
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
                placeholderTextColor="#ccc"
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
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryBtnText}>Verify Code</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity style={styles.backBtn} onPress={goBack}>
                <Text style={styles.backBtnText}>← Change number</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#f4f5f9",
  },
  flex: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 40,
  },

  // ── Branding ─────────────────────────────────────────────
  logoArea: {
    alignItems: "center",
    marginBottom: 36,
  },
  logoEmoji: {
    fontSize: 56,
    marginBottom: 10,
  },
  appName: {
    fontSize: 28,
    fontWeight: "800",
    color: "#1a1a1a",
    letterSpacing: 0.3,
  },
  tagline: {
    fontSize: 14,
    color: "#888",
    marginTop: 4,
  },

  // ── Card ─────────────────────────────────────────────────
  card: {
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 4,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1a1a1a",
    marginBottom: 6,
  },
  cardSub: {
    fontSize: 13,
    color: "#888",
    lineHeight: 19,
    marginBottom: 22,
  },
  boldText: {
    fontWeight: "700",
    color: "#1a1a1a",
  },

  // ── Phone input row ───────────────────────────────────────
  phoneRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "#e0e0e0",
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 16,
    backgroundColor: "#fafafa",
  },
  prefixBox: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 15,
    borderRightWidth: 1.5,
    borderRightColor: "#e0e0e0",
    backgroundColor: "#f0f0f0",
    gap: 6,
  },
  flag: {
    fontSize: 20,
  },
  prefix: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
  },
  phoneInput: {
    flex: 1,
    fontSize: 18,
    paddingHorizontal: 14,
    paddingVertical: 15,
    color: "#1a1a1a",
    letterSpacing: 1.5,
  },

  // ── OTP input ─────────────────────────────────────────────
  otpInput: {
    borderWidth: 1.5,
    borderColor: "#e0e0e0",
    borderRadius: 12,
    fontSize: 32,
    fontWeight: "700",
    letterSpacing: 18,
    textAlign: "center",
    paddingVertical: 18,
    color: "#1a1a1a",
    backgroundColor: "#fafafa",
    marginBottom: 16,
  },

  // ── Shared ────────────────────────────────────────────────
  errorText: {
    color: "#e53935",
    fontSize: 13,
    marginBottom: 12,
    textAlign: "center",
  },
  statusText: {
    color: "#1a73e8",
    fontSize: 13,
    marginBottom: 12,
    textAlign: "center",
  },
  primaryBtn: {
    backgroundColor: "#1a73e8",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  btnDisabled: {
    opacity: 0.6,
  },
  primaryBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  backBtn: {
    marginTop: 18,
    alignItems: "center",
  },
  backBtnText: {
    color: "#1a73e8",
    fontSize: 14,
    fontWeight: "600",
  },
});
