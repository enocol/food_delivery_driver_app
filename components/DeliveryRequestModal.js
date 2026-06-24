import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, Modal } from "react-native";

/**
 * DeliveryRequestModal — bottom sheet shown when a new delivery arrives.
 *
 * @param {object|null} request  Delivery request, or null/undefined when hidden.
 * @param {() => void}  onAccept
 * @param {() => void}  onDecline
 * @param {() => void}  onClose
 */
export default function DeliveryRequestModal({
  request,
  onAccept,
  onDecline,
  onClose,
}) {
  return (
    <Modal
      visible={!!request}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.sheetOverlay}>
        <TouchableOpacity
          style={styles.sheetBackdrop}
          activeOpacity={1}
          onPress={onClose}
        />
        <View style={styles.panel}>
          <Text style={styles.title}>New Delivery Request</Text>
          {[
            ["Order ID", request?.orderId],
            ["Restaurant", request?.restaurantName],
            ["Pickup", request?.pickupAddress],
            ["Delivery", request?.deliveryAddress],
          ].map(([label, value]) => (
            <View key={label} style={styles.row}>
              <Text style={styles.label}>{label}</Text>
              <Text style={styles.value}>{value}</Text>
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
            >
              <Text style={styles.btnText}>Decline</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.btnAccept]}
              onPress={onAccept}
              activeOpacity={0.85}
            >
              <Text style={styles.btnText}>Accept</Text>
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
