import { StatusBar } from "expo-status-bar";
import { useMemo, useState } from "react";
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";

type Tab = "Today" | "Markets" | "Activity" | "Settings";

const markets = [
  { symbol: "SPYx", name: "S&P 500", state: "Reference closed", route: "Byreal", impact: "0.00006%", tone: "amber" },
  { symbol: "NVDAx", name: "NVIDIA", state: "Reference closed", route: "HumidiFi → Whirlpool", impact: "0.00005%", tone: "amber" },
  { symbol: "AAPLx", name: "Apple", state: "Reference closed", route: "Raydium CLMM", impact: "0.00199%", tone: "amber" },
  { symbol: "UNHx", name: "UnitedHealth", state: "Historical halt case", route: "Whirlpool", impact: "0.0139%", tone: "red" }
] as const;

export default function App() {
  const [tab, setTab] = useState<Tab>("Today");
  const selected = useMemo(() => markets[0], []);
  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      <View style={styles.shell}>
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>SEAMETRY / SOLANA</Text>
            <Text style={styles.title}>{tab}</Text>
          </View>
          <View style={styles.livePill}><View style={styles.liveDot} /><Text style={styles.liveText}>CAPTURED PROBE</Text></View>
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {tab === "Today" && <>
            <Text style={styles.kicker}>MARKET BOUNDARY</Text>
            <Text style={styles.hero}>The route is open.{"\n"}The reference market is not.</Text>
            <Text style={styles.subhead}>Seametry exposes what execution interfaces flatten into a single price.</Text>
            <View style={styles.preflight}>
              <View style={styles.preflightTop}>
                <View><Text style={styles.symbol}>{selected.symbol}</Text><Text style={styles.muted}>{selected.name}</Text></View>
                <View style={styles.caution}><Text style={styles.cautionText}>CAUTION</Text></View>
              </View>
              <View style={styles.rule} />
              <Metric label="ISSUER WINDOW" value="Closed" valueStyle={styles.amber} />
              <Metric label="JUPITER ROUTE" value={selected.route + " · Live"} valueStyle={styles.green} />
              <Metric label="INDEPENDENT REFERENCES" value="Credentials needed" valueStyle={styles.amber} />
              <View style={styles.notice}><Text style={styles.noticeText}>An executable quote is not proof of fair value. Review the source boundary before continuing.</Text></View>
              <Pressable style={styles.button}><Text style={styles.buttonText}>Inspect sources</Text></Pressable>
            </View>
            <Text style={styles.sectionTitle}>Observed this run</Text>
            {markets.slice(1).map((market) => <MarketRow key={market.symbol} {...market} />)}
          </>}

          {tab === "Markets" && <>
            <Text style={styles.hero}>Four live routes.{"\n"}Four different seams.</Text>
            <Text style={styles.subhead}>A coverage result is evidence, not a recommendation.</Text>
            {markets.map((market) => <MarketRow key={market.symbol} {...market} />)}
          </>}

          {tab === "Activity" && <Empty title="No approvals yet" copy="Every future transaction will require explicit wallet approval and preserve its preflight snapshot." />}
          {tab === "Settings" && <Empty title="Source policy" copy="Issuer state and Jupiter routes are public. Chainlink Data Streams and live Stork values activate only when authorized credentials are configured." />}
        </ScrollView>

        <View style={styles.tabs}>
          {(["Today", "Markets", "Activity", "Settings"] as Tab[]).map((item) => (
            <Pressable key={item} onPress={() => setTab(item)} style={styles.tab}>
              <View style={[styles.tabMark, tab === item && styles.tabMarkActive]} />
              <Text style={[styles.tabText, tab === item && styles.tabTextActive]}>{item}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </SafeAreaView>
  );
}

function Metric({ label, value, valueStyle }: { label: string; value: string; valueStyle: object }) {
  return <View style={styles.metric}><Text style={styles.metricLabel}>{label}</Text><Text style={[styles.metricValue, valueStyle]}>{value}</Text></View>;
}

function MarketRow({ symbol, name, state, route, impact, tone }: (typeof markets)[number]) {
  return <View style={styles.marketRow}>
    <View style={[styles.assetIcon, tone === "red" ? styles.iconRed : styles.iconAmber]}><Text style={styles.assetIconText}>{symbol.slice(0, 1)}</Text></View>
    <View style={styles.grow}><Text style={styles.marketSymbol}>{symbol}</Text><Text style={styles.muted}>{name} · {route}</Text></View>
    <View style={styles.alignRight}><Text style={tone === "red" ? styles.red : styles.amber}>{state}</Text><Text style={styles.muted}>{impact} impact</Text></View>
  </View>;
}

function Empty({ title, copy }: { title: string; copy: string }) {
  return <View style={styles.empty}><Text style={styles.emptyTitle}>{title}</Text><Text style={styles.subhead}>{copy}</Text></View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#080b0d" }, shell: { flex: 1, backgroundColor: "#080b0d" },
  header: { paddingHorizontal: 22, paddingTop: 18, paddingBottom: 12, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  eyebrow: { color: "#7e8a85", fontSize: 10, letterSpacing: 2.2, fontWeight: "700" }, title: { color: "#f4f7f5", fontSize: 26, fontWeight: "700", marginTop: 3 },
  livePill: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: "#24312b", borderRadius: 20, paddingVertical: 7, paddingHorizontal: 10 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#73e2a7", marginRight: 7 }, liveText: { color: "#9eaaa4", fontSize: 9, letterSpacing: 1.2 },
  content: { paddingHorizontal: 22, paddingTop: 24, paddingBottom: 120 }, kicker: { color: "#dfb866", fontSize: 11, letterSpacing: 2, fontWeight: "700" },
  hero: { color: "#f3f5f4", fontSize: 34, lineHeight: 40, fontWeight: "600", letterSpacing: -1.1, marginTop: 10 },
  subhead: { color: "#8d9993", fontSize: 15, lineHeight: 22, marginTop: 12 },
  preflight: { marginTop: 28, backgroundColor: "#101517", borderWidth: 1, borderColor: "#25302c", borderRadius: 22, padding: 18 },
  preflightTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, symbol: { color: "#f6f8f7", fontSize: 28, fontWeight: "700" }, muted: { color: "#77827d", fontSize: 12, marginTop: 3 },
  caution: { backgroundColor: "#372c18", borderWidth: 1, borderColor: "#6f5528", borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6 }, cautionText: { color: "#e7bb68", fontSize: 10, fontWeight: "800", letterSpacing: 1.1 },
  rule: { height: 1, backgroundColor: "#222a27", marginVertical: 17 }, metric: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 9 },
  metricLabel: { color: "#77827d", fontSize: 10, letterSpacing: 1 }, metricValue: { fontSize: 13, fontWeight: "600" }, amber: { color: "#dfb866" }, green: { color: "#73e2a7" }, red: { color: "#f28c8c" },
  notice: { marginTop: 14, borderLeftWidth: 2, borderLeftColor: "#dfb866", backgroundColor: "#171811", padding: 12 }, noticeText: { color: "#b9b9aa", fontSize: 12, lineHeight: 18 },
  button: { backgroundColor: "#e8efe9", borderRadius: 14, padding: 15, alignItems: "center", marginTop: 16 }, buttonText: { color: "#101512", fontSize: 14, fontWeight: "700" },
  sectionTitle: { color: "#eff2f0", fontSize: 18, fontWeight: "600", marginTop: 30, marginBottom: 8 }, marketRow: { flexDirection: "row", alignItems: "center", paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "#171d1a" },
  assetIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center", marginRight: 12 }, iconAmber: { backgroundColor: "#2d271b" }, iconRed: { backgroundColor: "#301e20" }, assetIconText: { color: "#e8ecea", fontWeight: "800" },
  grow: { flex: 1 }, alignRight: { alignItems: "flex-end" }, marketSymbol: { color: "#e9eeeb", fontSize: 15, fontWeight: "700" },
  empty: { marginTop: 60, padding: 24, borderWidth: 1, borderColor: "#252e2a", borderRadius: 20 }, emptyTitle: { color: "#f3f5f4", fontSize: 26, fontWeight: "600" },
  tabs: { position: "absolute", left: 14, right: 14, bottom: 12, height: 68, borderRadius: 22, backgroundColor: "#111615", borderWidth: 1, borderColor: "#28312d", flexDirection: "row", alignItems: "center" },
  tab: { flex: 1, alignItems: "center", justifyContent: "center" }, tabMark: { width: 5, height: 5, borderRadius: 3, backgroundColor: "#303a35", marginBottom: 7 }, tabMarkActive: { backgroundColor: "#73e2a7" }, tabText: { color: "#66716c", fontSize: 10 }, tabTextActive: { color: "#e4eae6" }
});
