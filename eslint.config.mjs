// Lint config for the plain TypeScript packages (packages/* and apps/tickets).
// apps/web has its own config with the Next.js rules.
import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig([
  globalIgnores(["**/node_modules/**", "**/dist/**", "apps/web/**"]),
  js.configs.recommended,
  ...tseslint.configs.recommended,
]);
