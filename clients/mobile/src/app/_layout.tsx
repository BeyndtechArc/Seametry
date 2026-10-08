// First, before anything that touches keys: Phantom's SDK and web3 need
// crypto.getRandomValues, and web3 expects a global Buffer.
import "react-native-get-random-values";
import { Buffer } from "buffer";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { WalletProvider } from "@/lib/wallet";
import { colors } from "@/theme";

(globalThis as { Buffer?: typeof Buffer }).Buffer ??= Buffer;

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <WalletProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surface.ground } }} />
      </WalletProvider>
    </SafeAreaProvider>
  );
}
