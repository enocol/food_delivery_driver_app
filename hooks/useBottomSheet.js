import { useRef } from "react";
import { Animated, Dimensions, PanResponder } from "react-native";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

// Height of the always-visible action bar (without device insets).
export const ACTION_BAR_BASE_H = 64;

// Sheet content panel height (everything above the action bar).
const CONTENT_H = SCREEN_HEIGHT * 0.55;

// translateY: fully off-screen (collapsed) vs 0 (expanded).
const SHEET_COLLAPSED_INIT = CONTENT_H + ACTION_BAR_BASE_H + 60;
const SHEET_EXPANDED = 0;

// Small margin so the phone status bar stays visible when expanded.
const SHEET_TOP_GAP = 10;

/**
 * useBottomSheet — drag-to-expand/collapse persistent bottom sheet.
 *
 * @param {{ top: number, bottom: number }} insets  Safe-area insets.
 */
export function useBottomSheet(insets) {
  const sheetExpanded = useRef(false);
  const sheetY = useRef(new Animated.Value(SHEET_COLLAPSED_INIT)).current;
  const collapsedYRef = useRef(SHEET_COLLAPSED_INIT);

  const actionBarH = ACTION_BAR_BASE_H + insets.bottom;
  const sheetHeight = SCREEN_HEIGHT - insets.top - SHEET_TOP_GAP;
  collapsedYRef.current = sheetHeight;

  function expandSheet() {
    sheetExpanded.current = true;
    Animated.spring(sheetY, {
      toValue: SHEET_EXPANDED,
      useNativeDriver: true,
      tension: 65,
      friction: 11,
    }).start();
  }

  function collapseSheet() {
    sheetExpanded.current = false;
    Animated.spring(sheetY, {
      toValue: collapsedYRef.current,
      useNativeDriver: true,
      tension: 65,
      friction: 11,
    }).start();
  }

  // Instantly snap closed (no animation) — used when leaving map mode.
  function resetSheet() {
    sheetExpanded.current = false;
    sheetY.setValue(collapsedYRef.current);
  }

  const contentPan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, { dy }) => Math.abs(dy) > 8,
      onPanResponderMove: (_, { dy }) => {
        const collapsed = collapsedYRef.current;
        const base = sheetExpanded.current ? SHEET_EXPANDED : collapsed;
        sheetY.setValue(
          Math.max(SHEET_EXPANDED, Math.min(collapsed, base + dy)),
        );
      },
      onPanResponderRelease: (_, { dy, vy }) => {
        if (sheetExpanded.current) {
          dy > 60 || vy > 0.5 ? collapseSheet() : expandSheet();
        } else {
          dy < -60 || vy < -0.5 ? expandSheet() : collapseSheet();
        }
      },
    }),
  ).current;

  return {
    sheetY,
    sheetHeight,
    actionBarH,
    panHandlers: contentPan.panHandlers,
    expandSheet,
    collapseSheet,
    resetSheet,
  };
}
