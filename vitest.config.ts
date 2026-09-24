import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Separate from vite.config.ts (the app build) so test-only settings
// (jsdom, setup file) never affect `npm run build` / `npm run dev`.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    css: false,
    // Only our own tests — without this, Vitest's default glob also picks up
    // unrelated *.test.ts fixtures cached by other tools (e.g. .trunk/).
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
});
