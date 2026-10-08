import { useCallback, useEffect, useState } from "react";
import { FlatList, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { VersionedTransaction } from "@solana/web3.js";
import { Buffer } from "buffer";
import { describeSplit, formatAmount, parseAmount, splitEvenly } from "@shared/amount";
import { ContinueButton, KeyButton, QuietButton } from "@/components/controls";
import { LotMark, MarkLine } from "@/components/marks";
import { StepBar, StepTrack } from "@/components/steps";
import { feeBpsFor, fetchOffer, legStatus, logoUri, prepareLeg, submitLeg, type Offer, type PreparedLeg } from "@/lib/allocation";
import { useWallet } from "@/lib/wallet";
import { colors, font, fontSize, space } from "@/theme";

const USDC_SCALE = 6;

type Phase = "idle" | "preparing" | "prepared" | "signing" | "sending" | "settled" | "failed";
type Leg = { mint: string; symbol: string; atoms: bigint; phase: Phase; prepared?: PreparedLeg; signature?: string; note?: string };

const phaseLabel: Record<Phase, string> = {
  idle: "Not previewed",
  preparing: "Preparing",
  prepared: "Ready to sign",
  signing: "Signing",
  sending: "Sending",
  settled: "Settled",
  failed: "Not bought",
};

const reasonFrom = (error: unknown) => (error instanceof Error ? error.message : String(error));

type Reading = { state: "loading" } | { state: "read"; offer: Offer } | { state: "error"; reason: string };

export default function Allocation() {
  const wallet = useWallet();
  const [reading, setReading] = useState<Reading>({ state: "loading" });
  const [step, setStep] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [typed, setTyped] = useState("");
  const [legs, setLegs] = useState<Record<string, Partial<Leg>>>({});

  const load = useCallback(() => {
    setReading({ state: "loading" });
    fetchOffer()
      .then((offer) => setReading({ state: "read", offer }))
      .catch((error: unknown) => setReading({ state: "error", reason: reasonFrom(error) }));
  }, []);
  useEffect(load, [load]);

  if (reading.state !== "read") {
    return (
      <SafeAreaView style={styles.screen}>
        <Header />
        <View style={styles.body}>
          {reading.state === "loading" ? (
            <View style={styles.loading}>
              <Text style={styles.quiet}>Reading what the policy engine admits</Text>
              <View style={styles.loadingRule} />
            </View>
          ) : (
            <>
              <Text style={styles.problem}>The offer did not load: {reading.reason} Nothing was bought.</Text>
              <QuietButton onPress={load}>Read the offer again</QuietButton>
            </>
          )}
        </View>
      </SafeAreaView>
    );
  }

  const { offer } = reading;
  const chosen = offer.offered.filter((lot) => selected.includes(lot.mint));
  const needle = query.trim().toLowerCase();
  const visible = needle ? offer.offered.filter((lot) => lot.symbol.toLowerCase().includes(needle) || lot.issuer.toLowerCase().includes(needle)) : offer.offered;
  const parsed = typed.trim() === "" ? undefined : parseAmount(typed, USDC_SCALE);
  const split = parsed && "atoms" in parsed ? splitEvenly(parsed.atoms, chosen.length) : [];
  const overCapacity = split.findIndex((atoms, index) => atoms > BigInt(chosen[index]?.capacityUsdc ?? 0) * 10n ** BigInt(USDC_SCALE));
  const amountProblem =
    parsed && "refused" in parsed
      ? parsed.refused
      : overCapacity >= 0
        ? `${chosen[overCapacity].symbol} may take at most ${formatAmount(BigInt(chosen[overCapacity].capacityUsdc), 0)} USDC under this captured capacity decision.`
        : split.some((atoms) => atoms === 0n) && split.length > 0
          ? "The amount is too small to fund every selected constituent."
          : undefined;
  const plan: Leg[] = amountProblem || split.length === 0 ? [] : chosen.map((lot, i) => ({ mint: lot.mint, symbol: lot.symbol, atoms: split[i], phase: "idle", ...legs[lot.mint] }));
  const started = plan.some((leg) => leg.phase !== "idle" || leg.note);
  const feeBps = feeBpsFor(offer, Math.max(chosen.length, 1));
  const total = parsed && "atoms" in parsed ? `${formatAmount(parsed.atoms, USDC_SCALE)} USDC` : undefined;
  const planLine = [chosen.length === 0 ? "Nothing chosen" : `${chosen.length} chosen`, total].filter(Boolean).join(", ");
  const update = (mint: string, change: Partial<Leg>) => setLegs((current) => ({ ...current, [mint]: { ...current[mint], ...change } }));

  const preview = async (leg: Leg) => {
    if (wallet.state !== "signed-in") return;
    update(leg.mint, { phase: "preparing", note: undefined, prepared: undefined });
    try {
      update(leg.mint, { phase: "prepared", prepared: await prepareLeg(wallet.address, leg.mint, leg.atoms, chosen.map((lot) => lot.mint)) });
    } catch (error) {
      update(leg.mint, { phase: "idle", note: reasonFrom(error) });
    }
  };

  const sign = async (leg: Leg) => {
    if (wallet.state !== "signed-in" || !leg.prepared) return;
    update(leg.mint, { phase: "signing", note: undefined });
    let signed: VersionedTransaction;
    try {
      signed = await wallet.signTransaction(VersionedTransaction.deserialize(Buffer.from(leg.prepared.transaction, "base64")));
    } catch (error) {
      update(leg.mint, { phase: "prepared", note: `Not signed: ${reasonFrom(error)}` });
      return;
    }
    update(leg.mint, { phase: "sending" });
    try {
      const { signature } = await submitLeg(Buffer.from(signed.serialize()).toString("base64"), leg.prepared.approval);
      update(leg.mint, { signature, note: "Sent. Waiting for mainnet to confirm." });
      for (let attempt = 0; attempt < 30; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const status = await legStatus(signature).catch(() => undefined);
        if (status?.state === "confirmed" || status?.state === "finalized") return update(leg.mint, { phase: "settled", note: `Settled, ${status.state} on mainnet.` });
        if (status?.state === "failed") return update(leg.mint, { phase: "failed", note: `Mainnet ran the transaction and it failed: ${status.detail}. No USDC was spent on this purchase.` });
      }
      update(leg.mint, { note: "No confirmation within a minute. The signature below shows where it stands." });
    } catch (error) {
      update(leg.mint, { phase: "failed", note: `${reasonFrom(error)} No USDC was spent on this purchase.` });
    }
  };

  const signReason =
    offer.unavailable ?? (wallet.state === "unavailable" ? wallet.reason : wallet.state === "signed-out" ? "Sign in to preview and sign each purchase." : undefined);
  const active = plan.find((leg) => leg.phase === "prepared" && leg.prepared && Date.parse(leg.prepared.expiresAt) > Date.now());
  const inFlight = plan.find((leg) => leg.phase === "signing" || leg.phase === "sending");
  const keyReason = signReason ?? (!active ? "Preview a purchase to see its terms first." : undefined);

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <Header />
      <View style={styles.track}>
        <StepTrack steps={["Choose", "Buy"]} current={step} onStep={(index) => !started && setStep(index)} />
      </View>

      {step === 0 ? (
        <FlatList
          style={styles.body}
          contentContainerStyle={styles.list}
          data={visible}
          keyExtractor={(lot) => lot.mint}
          ListHeaderComponent={
            <View style={styles.searchBlock}>
              <TextInput style={styles.search} placeholder="Search by symbol or issuer" placeholderTextColor={colors.text.faint} value={query} onChangeText={setQuery} autoCorrect={false} autoCapitalize="none" accessibilityLabel="Search by symbol or issuer" />
              <Text style={styles.quiet}>
                Showing {visible.length} of {offer.offered.length}. Policy {offer.policyVersion}, captured {offer.age} ago, not a live issuer read.
              </Text>
            </View>
          }
          renderItem={({ item: lot }) => {
            const on = selected.includes(lot.mint);
            return (
              <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={lot.symbol}
                onPress={() => setSelected((current) => (on ? current.filter((mint) => mint !== lot.mint) : [...current, lot.mint]))}
                style={styles.row}>
                <View style={[styles.check, on ? styles.checkOn : null]}>{on ? (
                    <Svg width={14} height={14} viewBox="0 0 24 24" accessibilityElementsHidden>
                      <Path d="M5 12.5l4.5 4.5L19 7.5" stroke={colors.text.onTouch} strokeWidth={2.5} fill="none" />
                    </Svg>
                  ) : null}</View>
                <LotMark symbol={lot.symbol} uri={logoUri(lot.logo)} size={48} />
                <View style={styles.rowText}>
                  <Text style={styles.symbol}>{lot.symbol}</Text>
                  <Text style={styles.quiet}>{lot.issuer}</Text>
                  <Text style={styles.quiet}>Measured capacity {formatAmount(BigInt(lot.capacityUsdc), 0)} USDC</Text>
                  <MarkLine grade={lot.grade} verdict={lot.decision === "ALLOW" ? "Allow" : "Warn"} reason={lot.stampReason} />
                </View>
              </Pressable>
            );
          }}
        />
      ) : (
        <ScrollView style={styles.body} contentContainerStyle={styles.buy}>
          <Text style={styles.fieldLabel}>USDC to spend</Text>
          <TextInput style={[styles.field, amountProblem ? styles.fieldInvalid : null]} keyboardType="decimal-pad" placeholder="250" placeholderTextColor={colors.text.faint} value={typed} onChangeText={setTyped} editable={!started} accessibilityLabel="USDC to spend" />
          <Text style={amountProblem ? styles.problem : styles.quiet}>
            {amountProblem ?? (plan.length > 0 ? describeSplit(plan, USDC_SCALE, "USDC") : "Seametry divides one total evenly across what you chose.")}
          </Text>

          <View style={styles.sheet}>
            <Fact label="Spend" value={total ?? "Not set"} />
            <Fact label={`Seametry routing fee, ${formatAmount(BigInt(feeBps), 2)}%`} value={split.length > 0 ? `${formatAmount(split.reduce((sum, atoms) => sum + (atoms * BigInt(feeBps)) / 10_000n, 0n), USDC_SCALE)} USDC` : "Not set"} />
            <Fact label="Slippage tolerance" value={`${formatAmount(BigInt(offer.slippageBps), 2)}% of each swap`} />
            <Fact label="Receiving wallet" value={wallet.state === "signed-in" ? wallet.address : "Not signed in"} />
          </View>

          {signReason ? <Text style={styles.problem}>{signReason}</Text> : null}
          {wallet.state === "signed-out" && !offer.unavailable ? (
            <View style={styles.signIn}>
              <ContinueButton disabled={wallet.signingIn} onPress={() => void wallet.signIn("apple")}>Sign in with Apple</ContinueButton>
              <QuietButton disabled={wallet.signingIn} onPress={() => void wallet.signIn("google")}>Sign in with Google</QuietButton>
            </View>
          ) : null}

          {plan.map((leg) => (
            <View key={leg.mint} style={styles.leg}>
              <View style={styles.legHead}>
                <Text style={styles.symbol}>
                  {leg.symbol}, {formatAmount(leg.atoms, USDC_SCALE)} USDC
                </Text>
                <Text style={styles.quiet}>{phaseLabel[leg.phase]}</Text>
              </View>
              {leg.prepared && leg.phase !== "settled" && leg.phase !== "failed" ? (
                <Text style={styles.quiet}>
                  Expect {formatAmount(leg.prepared.outAtoms, leg.prepared.outScale)} {leg.symbol}, at least {formatAmount(leg.prepared.floorAtoms, leg.prepared.outScale)}, through {leg.prepared.route.join(", ")}. Fee{" "}
                  {formatAmount(leg.prepared.routingFeeAtoms, USDC_SCALE)} USDC.
                </Text>
              ) : null}
              {leg.note ? <Text style={styles.quiet}>{leg.note}</Text> : null}
              {leg.signature ? (
                <Text style={styles.signature} onPress={() => void Linking.openURL(`https://explorer.solana.com/tx/${leg.signature}`)}>
                  {leg.signature}
                </Text>
              ) : null}
              {leg.phase === "idle" ? (
                <QuietButton disabled={Boolean(signReason)} onPress={() => void preview(leg)}>Preview purchase</QuietButton>
              ) : null}
            </View>
          ))}
        </ScrollView>
      )}

      {/* One Key per view (SKILL.md), in the bar with each step's next move:
          it signs the next prepared purchase, and the line says what it waits for. */}
      <StepBar
        plan={step === 1 && keyReason && !inFlight ? keyReason : planLine}
        problem={step === 1 && Boolean(keyReason) && !inFlight}
        back={step === 1 ? <QuietButton disabled={started} onPress={() => setStep(0)}>Back</QuietButton> : undefined}
        next={
          step === 0 ? (
            <ContinueButton disabled={chosen.length === 0} onPress={() => setStep(1)}>Set amount</ContinueButton>
          ) : (
            <KeyButton disabled={Boolean(keyReason) && !inFlight} busy={inFlight ? phaseLabel[inFlight.phase] : undefined} onPress={() => active && void sign(active)}>
              {active ? `Approve and sign ${active.symbol}` : "Approve and sign"}
            </KeyButton>
          )
        }
      />
    </SafeAreaView>
  );
}

function Header() {
  return (
    <View style={styles.header}>
      <Text style={styles.group}>Allocation</Text>
      <Text style={styles.title}>Build a basket</Text>
    </View>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fact}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={styles.factValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.ground },
  header: { paddingHorizontal: space[5], paddingTop: space[5], gap: space[1] },
  group: { fontSize: fontSize.small, color: colors.text.tertiary },
  title: { fontFamily: font.display, fontSize: fontSize.title, color: colors.text.primary },
  track: { paddingHorizontal: space[5], paddingTop: space[4] },
  body: { flex: 1 },
  list: { paddingHorizontal: space[5], paddingBottom: space[8] },
  searchBlock: { gap: space[3], paddingVertical: space[4] },
  search: { minHeight: 44, paddingHorizontal: space[4], fontSize: fontSize.body, color: colors.text.primary, backgroundColor: colors.surface.sheet, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.line.rule },
  row: { flexDirection: "row", alignItems: "flex-start", gap: space[4], paddingVertical: space[4], borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.line.rule },
  check: { width: space[6], height: space[6], marginTop: space[3], alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.line.strong },
  checkOn: { backgroundColor: colors.accent.touch, borderColor: colors.accent.touch },
  rowText: { flex: 1, gap: space[1] },
  symbol: { fontSize: fontSize.body, fontWeight: "500", color: colors.text.primary },
  quiet: { fontSize: fontSize.small, color: colors.text.secondary },
  problem: { fontSize: fontSize.small, color: colors.accent.provenance },
  loading: { gap: space[3], padding: space[5] },
  loadingRule: { borderTopWidth: StyleSheet.hairlineWidth, borderStyle: "dashed", borderColor: colors.line.strong },
  buy: { padding: space[5], gap: space[4], paddingBottom: space[8] },
  fieldLabel: { fontSize: fontSize.small, fontWeight: "500", color: colors.text.secondary },
  field: { minHeight: 50, paddingHorizontal: space[6], fontSize: fontSize.lead, color: colors.text.primary, backgroundColor: colors.surface.sheet, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.line.rule },
  fieldInvalid: { borderColor: colors.accent.provenance },
  sheet: { padding: space[5], gap: space[3], backgroundColor: colors.surface.raised },
  fact: { flexDirection: "row", justifyContent: "space-between", gap: space[4], paddingVertical: space[2], borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.line.rule },
  factLabel: { flex: 1, fontSize: fontSize.micro, color: colors.text.tertiary },
  factValue: { flex: 1.4, fontSize: fontSize.small, color: colors.text.primary, textAlign: "right" },
  signIn: { gap: space[3] },
  leg: { gap: space[3], paddingTop: space[4], borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.line.rule },
  legHead: { flexDirection: "row", justifyContent: "space-between", gap: space[3] },
  signature: { fontFamily: font.digest, fontSize: fontSize.micro, color: colors.text.secondary },
});
