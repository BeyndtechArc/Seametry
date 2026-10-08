import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, fontSize, size, space } from "@/theme";

// Native counterparts of components.md's Key, Route action and Quiet action:
// cornerless plates, green only on what can be pressed, and the label a verb
// plus its object. No shadows; pressed drops by tone, not by elevation.

type Press = { children: ReactNode; onPress: () => void; disabled?: boolean; busy?: string };

/** components.md, Key: the one control that changes custody (signing). Seated in its tray. */
export function KeyButton({ children, onPress, disabled, busy }: Press) {
  const inert = disabled || Boolean(busy);
  return (
    <View style={styles.tray}>
      <Pressable accessibilityRole="button" accessibilityState={{ disabled: inert, busy: Boolean(busy) }} disabled={inert} onPress={onPress}
        style={({ pressed }) => [styles.plate, inert ? styles.plateInert : pressed ? styles.platePressed : null]}>
        <Text style={[styles.label, inert ? styles.labelInert : null]}>{busy ?? children}</Text>
      </Pressable>
    </View>
  );
}

/** components.md, Route action as a button: moving forward a step is navigation. */
export function ContinueButton({ children, onPress, disabled }: Press) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
      style={({ pressed }) => [styles.plate, disabled ? styles.plateInert : pressed ? styles.platePressed : null]}>
      <Text style={[styles.label, disabled ? styles.labelInert : null]}>{children}</Text>
    </Pressable>
  );
}

/** components.md, Quiet action: a secondary move, never green. */
export function QuietButton({ children, onPress, disabled }: Press) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
      style={({ pressed }) => [styles.quiet, pressed && !disabled ? styles.quietPressed : null]}>
      <Text style={[styles.quietLabel, disabled ? styles.labelInert : null]}>{children}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tray: { padding: size.tray, backgroundColor: colors.surface.tray },
  plate: { minHeight: size.key, justifyContent: "center", paddingHorizontal: space[6], backgroundColor: colors.accent.touch },
  platePressed: { backgroundColor: colors.accent.touchPressed },
  plateInert: { backgroundColor: colors.surface.tray },
  label: { color: colors.text.onTouch, fontSize: fontSize.body, fontWeight: "500" },
  labelInert: { color: colors.text.tertiary },
  quiet: {
    minHeight: size.target,
    justifyContent: "center",
    paddingHorizontal: space[5],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line.rule,
    backgroundColor: colors.surface.sheet,
  },
  quietPressed: { backgroundColor: colors.surface.raised },
  quietLabel: { color: colors.text.secondary, fontSize: fontSize.body, fontWeight: "500" },
});
