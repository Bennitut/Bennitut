// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*", "dist-pages/*", ".expo/*"],
  },
  {
    // Hilfsskripte und app.config.js laufen in Node, nicht in der App.
    files: ["scripts/**", "app.config.js"],
    languageOptions: { globals: { __dirname: "readonly", __filename: "readonly" } },
  },
]);
