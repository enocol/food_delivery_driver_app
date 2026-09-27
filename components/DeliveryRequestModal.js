import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ActivityIndicator,
  Alert,
} from "react-native";
import * as Location from "expo-location";
import { acceptDelivery } from "../utils/orders";

/**
 * DeliveryRequestModal — bottom sheet shown when a new delivery arrives.
 *
 * @param {object|null} request  Delivery request, or null/undefined when hidden.
 * @param {(request: object) => void}  onAccept
 * @param {() => void}  onDecline
 * @param {() => void}  onClose
 */
export default function DeliveryRequestModal({
  request,
  onAccept,
  onDecline,
  onClose,
}) {
  const [isAccepting, setIsAccepting] = useState(false);
  // Added: human-readable pickup text derived from reverse geocoding.
  const [pickupAddressLabel, setPickupAddressLabel] = useState(null);

  function formatFieldValue(value) {
    if (value == null) return "-";
    if (typeof value === "string" || typeof value === "number") {
      return String(value);
    }
    if (typeof value === "object") {
      if (
        typeof value.latitude === "number" &&
        typeof value.longitude === "number"
      ) {
        return `${value.latitude.toFixed(6)}, ${value.longitude.toFixed(6)}`;
      }
      if (typeof value.address === "string") {
        return value.address;
      }
    }
    return JSON.stringify(value);
  }

  // Added: reverse geocode pickup coordinates to a readable address.
  useEffect(() => {
    let cancelled = false;

    async function resolvePickupAddress() {
      const pickup = request?.pickupAddress;

      if (
        !pickup ||
        typeof pickup !== "object" ||
        typeof pickup.latitude !== "number" ||
        typeof pickup.longitude !== "number"
      ) {
        setPickupAddressLabel(null);
        return;
      }

      try {
        const [result] = await Location.reverseGeocodeAsync({
          latitude: pickup.latitude,
          longitude: pickup.longitude,
        });

        if (cancelled) return;

        if (result) {
          const line = [result.name, result.street]
            .filter(Boolean)
            .join(" ")
            .trim();
          const area = [result.city || result.subregion, result.region]
            .filter(Boolean)
            .join(", ");
          const country = result.country || "";
          const pretty = [line, area, country].filter(Boolean).join(", ");
          setPickupAddressLabel(pretty || null);
          return;
        }

        setPickupAddressLabel(null);
      } catch {
        if (!cancelled) setPickupAddressLabel(null);
      }
    }

    resolvePickupAddress();

    return () => {
      cancelled = true;
    };
  }, [request?.orderId, request?.pickupAddress]);

  function getDisplayValue(label, value) {
    if (label === "Pickup" && pickupAddressLabel) {
      return pickupAddressLabel;
    }
    return formatFieldValue(value);
  }

  // Added: confirm assignment with backend, then return accepted request to parent.
  async function handleAccept() {
    if (!request || isAccepting) return;

    setIsAccepting(true);
    try {
      await acceptDelivery(request.orderId);
      onAccept?.(request);
    } catch (error) {
      Alert.alert(
        "Couldn't accept delivery",
        error?.message || "Please try again.",
      );
    } finally {
      setIsAccepting(false);
    }
  }

  return (
    <Modal
      visible={!!request}
      animationType="slide"
      transparent
      onRequestClose={() => {}}
    >
      <View style={styles.sheetOverlay}>
        <View style={styles.sheetBackdrop} />
        <View style={styles.panel}>
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={onClose}
            activeOpacity={0.8}
          >
            <Text style={styles.closeBtnText}>X</Text>
          </TouchableOpacity>
          <Text style={styles.title}>New Delivery Request</Text>
          {[
            ["Order ID", request?.orderId],
            ["Restaurant", request?.restaurantName],
            ["Pickup", request?.pickupAddress],
            ["Delivery", request?.deliveryAddress],
          ].map(([label, value]) => (
            <View key={label} style={styles.row}>
              <Text style={styles.label}>{label}</Text>
              <Text style={styles.value}>{getDisplayValue(label, value)}</Text>
            </View>
          ))}
          <View style={styles.row}>
            <Text style={styles.label}>Fee</Text>
            <Text style={[styles.value, styles.fee]}>
              £{request?.fee?.toFixed(2)}
            </Text>
          </View>
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.btn, styles.btnDecline]}
              onPress={onDecline}
              activeOpacity={0.85}
              disabled={isAccepting}
            >
              <Text style={styles.btnText}>Decline</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.btnAccept]}
              onPress={handleAccept}
              activeOpacity={0.85}
              disabled={isAccepting}
            >
              {isAccepting ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.btnText}>Accept</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheetOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  sheetBackdrop: {
    flex: 1,
  },
  panel: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 36,
    position: "relative",
  },
  closeBtn: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f2f2f2",
    zIndex: 2,
  },
  closeBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1a1a1a",
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1a1a1a",
    marginBottom: 20,
    textAlign: "center",
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 14,
    gap: 12,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#666666",
    width: 100,
  },
  value: {
    flex: 1,
    fontSize: 14,
    color: "#1a1a1a",
    textAlign: "right",
  },
  fee: {
    color: "#1a73e8",
    fontWeight: "700",
    fontSize: 16,
  },
  actions: {
    flexDirection: "row",
    gap: 14,
    marginTop: 24,
  },
  btn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  btnDecline: {
    backgroundColor: "#e53935",
  },
  btnAccept: {
    backgroundColor: "#1a73e8",
  },
  btnText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },
});
