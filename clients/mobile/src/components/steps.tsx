import { Fragment, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, fontSize, space } from "@/theme";

/**
 * components.md, Step track: numbered marks on one trace, dashed ahead and
 * solid behind a finished step. A finished step is a way back.
 */
export function StepTrack({ steps, current, onStep }: { steps: string[]; current: number; onStep: (index: number) => void }) {
  return (
    <View style={styles.track} accessibilityRole="tablist">
      {steps.map((step, index) => {
        const state = index < current ? "done" : index === current ? "current" : "ahead";
        const mark = (
          <View style={styles.step}>
            <View style={[styles.number, state === "current" ? styles.numberCurrent : null]}>
              <Text style={[styles.numberText, state === "current" ? styles.numberTextCurrent : state === "ahead" ? styles.ahead : null]}>{index + 1}</Text>
            </View>
            <Text style={[styles.name, state === "current" ? styles.nameCurrent : state === "ahead" ? styles.ahead : null]}>{step}</Text>
          </View>
        );
        return (
          <Fragment key={step}>
            {state === "done" ? (
              <Pressable accessibilityRole="button" accessibilityLabel={step} onPress={() => onStep(index)}>
                {mark}
              </Pressable>
            ) : (
              <View accessibilityState={{ selected: state === "current" }}>{mark}</View>
            )}
            {index < steps.length - 1 ? <View style={[styles.connector, state === "done" ? styles.connectorDone : null]} /> : null}
          </Fragment>
        );
      })}
    </View>
  );
}

/** components.md, Step track's bar: Back, the plan in one line, the next move. Pinned below the step. */
export function StepBar({ back, plan, problem, next }: { back?: ReactNode; plan: string; problem?: boolean; next?: ReactNode }) {
  return (
    <View style={styles.bar}>
      <Text style={[styles.plan, problem ? styles.problem : null]} accessibilityLiveRegion="polite">
        {plan}
      </Text>
      <View style={styles.barActions}>
        {back ?? <View />}
        {next ?? <View />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: "row", alignItems: "center", minHeight: 44 },
  step: { flexDirection: "row", alignItems: "center", gap: space[3], minHeight: 44 },
  number: { minWidth: space[6], height: space[6], alignItems: "center", justifyContent: "center", borderWidth: StyleSheet.hairlineWidth, borderColor: colors.text.secondary },
  numberCurrent: { backgroundColor: colors.surface.inverse, borderColor: colors.surface.inverse },
  numberText: { fontSize: fontSize.micro, color: colors.text.secondary },
  numberTextCurrent: { color: colors.text.inverse },
  name: { fontSize: fontSize.small, color: colors.text.secondary },
  nameCurrent: { color: colors.text.primary, fontWeight: "500" },
  ahead: { color: colors.text.tertiary },
  connector: { flex: 1, marginHorizontal: space[4], borderTopWidth: 1, borderStyle: "dashed", borderColor: colors.line.strong },
  connectorDone: { borderStyle: "solid", borderColor: colors.text.secondary },
  bar: { gap: space[2], paddingHorizontal: space[4], paddingTop: space[3], paddingBottom: space[3], borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.line.strong, backgroundColor: colors.surface.raised },
  plan: { fontSize: fontSize.small, color: colors.text.secondary },
  problem: { color: colors.accent.provenance },
  barActions: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space[3] },
});
