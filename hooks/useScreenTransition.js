import { useRef } from "react";
import { Animated } from "react-native";

/**
 * useScreenTransition — cross-fade between the dashboard overlay and the
 * full-screen map controls.
 *
 *   dashAnim    1 → dashboard visible
 *   mapCtrlAnim 1 → map controls visible
 *
 * Exposes the raw animated values (for bespoke sequences) plus pre-derived
 * styles consumed by the render tree.
 */
export function useScreenTransition() {
  const dashAnim = useRef(new Animated.Value(1)).current;
  const mapCtrlAnim = useRef(new Animated.Value(0)).current;

  function animToDashboard() {
    Animated.parallel([
      Animated.timing(mapCtrlAnim, {
        toValue: 0,
        duration: 320,
        useNativeDriver: true,
      }),
      Animated.timing(dashAnim, {
        toValue: 1,
        duration: 420,
        useNativeDriver: true,
      }),
    ]).start();
  }

  function animToMap() {
    Animated.parallel([
      Animated.timing(dashAnim, {
        toValue: 0,
        duration: 320,
        useNativeDriver: true,
      }),
      Animated.timing(mapCtrlAnim, {
        toValue: 1,
        duration: 450,
        useNativeDriver: true,
      }),
    ]).start();
  }

  const mapOpacity = mapCtrlAnim;
  const mapTopY = mapCtrlAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-30, 0],
  });
  const actionBarY = mapCtrlAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [80, 0],
  });
  const dashOpacity = dashAnim;
  const dashScale = dashAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.97, 1],
  });

  return {
    dashAnim,
    mapCtrlAnim,
    animToDashboard,
    animToMap,
    mapOpacity,
    mapTopY,
    actionBarY,
    dashOpacity,
    dashScale,
  };
}
