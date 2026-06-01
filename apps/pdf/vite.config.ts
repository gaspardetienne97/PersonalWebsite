import tailwindcss from "@tailwindcss/vite";
import { sveltekit } from "@sveltejs/kit/vite";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite-plus";

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  resolve: {
    alias: {
      $lib: fileURLToPath(new URL("../../src/lib", import.meta.url)),
    },
  },
  test: {
    include: ["src/**/*.{test,spec}.{ts,js}", "../../src/lib/**/*.{test,spec}.{ts,js}"],
  },
});
