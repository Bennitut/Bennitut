// Die App nutzt Katalog und Zero-Waste-Planer direkt aus ../server/src, damit Rezepte und
// Pläne auch ohne Verbindung zum Server funktionieren.
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);
const sharedRoot = path.resolve(__dirname, "../server/src");

config.watchFolders = [...(config.watchFolders ?? []), sharedRoot];

// Der Server-Code importiert TypeScript-Dateien im Node-Stil als "./datei.js".
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (context.originModulePath.startsWith(sharedRoot) && moduleName.startsWith(".") && moduleName.endsWith(".js")) {
    return context.resolveRequest(context, moduleName.slice(0, -3), platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
