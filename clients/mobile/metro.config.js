// The app reads two files it does not own, so they have one owner each:
// the design tokens the web UI generates, and the web app's exact amount
// arithmetic. Both are dependency-free TypeScript; Metro only needs to watch
// them. clients/mobile stays outside the npm workspace because Expo 57 pins
// React 19.2.3 and the web app runs 19.3.0.
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
config.watchFolders = [
  ...(config.watchFolders ?? []),
  path.resolve(__dirname, "../packages/ui/src/generated"),
  path.resolve(__dirname, "../web/src/lib"),
];

module.exports = config;
