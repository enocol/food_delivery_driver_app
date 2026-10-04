// ─────────────────────────────────────────────────────────────────────────────
// Single source of truth for colors in the driver app.
// Mirrors the structure of the MboloEats customer app (food_delivery_frontEnd
// utils/colors.js). The driver app keeps a DARK UI with the shared brand accents:
// sky-blue primary (#0284c7) and a gold Go-Online CTA (#f59e0b).
//
// Usage:  import * as colors from "../utils/colors";
//         <View style={{ backgroundColor: colors.bg }} />
// ─────────────────────────────────────────────────────────────────────────────

// ─── Brand ───────────────────────────────────────────────────────────────────
export const primary = "#0284c7"; // sky-blue — links, icons, spinners, accents
export const primaryTint = "rgba(2, 132, 199, 0.15)"; // map tint over the dashboard
export const accent = "#ff5a1f"; // orange — the main Go-Online CTA (matches the app icon)

// ─── Status ──────────────────────────────────────────────────────────────────
export const danger = "#dc2626"; // errors, decline, go-offline border
export const dangerDark = "#b42318"; // go-offline button fill (darker red)
export const success = "#0d9668"; // confirmations (brand green, for future use)

// ─── Core neutrals ───────────────────────────────────────────────────────────
export const white = "#ffffff"; // text / icons on dark surfaces, white surfaces
export const black = "#000000"; // shadows, pure-black fills

// ─── Dark surfaces ───────────────────────────────────────────────────────────
export const bg = "#1a1a1a"; // main app background
export const bgDeep = "#0d0d0d"; // deepest panel background
export const surface = "#333333"; // cards / raised dark surfaces
export const surfaceLight = "#444444"; // lighter dark surface
export const border = "#2e2e2e"; // dark dividers / borders

// ─── Text & greys ────────────────────────────────────────────────────────────
export const textFaint = "#666666"; // muted labels
export const textDim = "#888888"; // secondary text
export const textMuted = "#9e9e9e"; // tertiary / meta text
export const placeholder = "#bbbbbb"; // input placeholders / disabled
export const divider = "#cccccc"; // light divider lines

// ─── Light surfaces & borders (used on a few light screens) ───────────────────
export const borderLight = "#e0e0e0";
export const borderLighter = "#e5e5e5";
export const surfaceAltLight = "#f0f0f0";
export const surfaceAlt = "#f2f2f2";
export const bgLightAlt = "#f4f5f9";
export const bgLight = "#fafafa";

// ─── Overlays ────────────────────────────────────────────────────────────────
export const scrim = "rgba(0, 0, 0, 0.65)"; // modal / control backdrop
export const scrimSoft = "rgba(0, 0, 0, 0.45)"; // lighter backdrop
