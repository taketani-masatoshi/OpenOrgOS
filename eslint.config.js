import eslint from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";

function downgradeToWarn(config) {
  if (!config.rules) return config;
  const rules = {};
  for (const [key, value] of Object.entries(config.rules)) {
    if (value === "off") rules[key] = "off";
    else rules[key] = "warn";
  }
  return { ...config, rules };
}

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "apps/**",
      "packages/**",
      "tenants/**",
      "steward/**",
      "coverage/**",
      "scripts/**",
    ],
  },
  downgradeToWarn(eslint.configs.recommended),
  ...tseslint.configs.recommended.map(downgradeToWarn),
  eslintConfigPrettier,
  {
    files: ["src/**/*.ts", "schemas/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-empty": ["error", { allowEmptyCatch: false }],
      "no-console": "off",
    },
  }
);
