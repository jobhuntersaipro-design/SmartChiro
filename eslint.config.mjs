import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    // Downgrade two React 19 strict rules from error → warning. The
    // annotation/canvas codebase intentionally uses refs as source-of-truth
    // for high-frequency state (drag positions, drawing state, undo history)
    // — converting all ref reads to useState mirrors would multiply re-renders
    // for no behavior gain. Same story for setState-in-effect: a few
    // legitimate cases (initial-state hydration from localStorage, error
    // resets on prop change) trip the rule. We keep them as warnings so they
    // surface in the lint output without blocking the build.
    rules: {
      "react-hooks/refs": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/immutability": "warn",
    },
  },
]);

export default eslintConfig;
