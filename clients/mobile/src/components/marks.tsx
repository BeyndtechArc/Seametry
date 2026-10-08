import type { ReactNode } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { SvgUri } from "react-native-svg";
import type { Grade } from "@/lib/allocation";
import { colors, fontSize, space } from "@/theme";

/** components.md, Lot mark: the issuer's mirrored logo, or a lettered tile when none was captured. */
export function LotMark({ symbol, uri, size = 40 }: { symbol: string; uri?: string; size?: number }) {
  // React Native's Image draws raster only; Backpack Securities serves every
  // logo as SVG, which would come out blank on a phone while the browser
  // preview drew it, so an SVG goes through react-native-svg.
  if (uri?.endsWith(".svg")) return <SvgUri uri={uri} width={size} height={size} />;
  return uri ? (
    <Image source={{ uri }} style={{ width: size, height: size }} accessibilityIgnoresInvertColors />
  ) : (
    <View style={[styles.tile, { width: size, height: size }]}>
      <Text style={styles.tileText}>{symbol.slice(0, 2)}</Text>
    </View>
  );
}

/**
 * components.md, Mark line: the grade and the stamp's verdict on one line, a
 * hairline between, the reason on its own beneath. Neutral, never green.
 */
export function MarkLine({ grade, verdict, reason }: { grade: Grade; verdict: "Allow" | "Warn" | "Block"; reason: string }) {
  return (
    <View style={styles.markLine}>
      <View style={styles.marks}>
        <DoubleRule color={colors.line.strong}>
          <Text style={styles.badgeText}>{grade}</Text>
        </DoubleRule>
        <View style={styles.divider} />
        <DoubleRule color={verdict === "Warn" ? colors.accent.provenance : verdict === "Block" ? colors.surface.inverse : colors.line.strong} filled={verdict === "Block"}>
          <Text style={[styles.badgeText, verdict === "Warn" ? styles.warnText : verdict === "Block" ? styles.blockText : null]}>{verdict}</Text>
        </DoubleRule>
      </View>
      <Text style={styles.reason}>{reason}</Text>
    </View>
  );
}

/** The stamp's 3px double rule: React Native has no double border, so two hairline frames a pixel apart. */
function DoubleRule({ color, filled, children }: { color: string; filled?: boolean; children: ReactNode }) {
  return (
    <View style={[styles.outer, { borderColor: color }, filled ? { backgroundColor: color } : null]}>
      <View style={[styles.inner, { borderColor: color }]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { alignItems: "center", justifyContent: "center", backgroundColor: colors.surface.inverse },
  tileText: { color: colors.text.inverse, fontSize: fontSize.micro, fontWeight: "600" },
  markLine: { gap: space[2] },
  marks: { flexDirection: "row", alignItems: "center", gap: space[3] },
  outer: { borderWidth: 1, padding: 1 },
  inner: { borderWidth: 1, paddingHorizontal: space[3], paddingVertical: space[1] },
  badgeText: { fontSize: fontSize.micro, fontWeight: "600", letterSpacing: 0.6, color: colors.text.primary },
  warnText: { color: colors.accent.provenance },
  blockText: { color: colors.text.inverse },
  divider: { height: space[5], borderLeftWidth: StyleSheet.hairlineWidth, borderColor: colors.line.strong },
  reason: { fontSize: fontSize.small, color: colors.text.secondary },
});
