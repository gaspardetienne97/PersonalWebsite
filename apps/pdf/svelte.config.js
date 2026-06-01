import { mdsvex } from "mdsvex";
import adapter from "@sveltejs/adapter-node";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import { fileURLToPath } from "node:url";

const sharedLib = fileURLToPath(new URL("../../src/lib", import.meta.url));

const config = {
  preprocess: [
    vitePreprocess(),
    mdsvex({ smartypants: true, extensions: [".md", ".mdx", ".svx"] }),
  ],
  kit: {
    adapter: adapter(),
    alias: {
      $lib: sharedLib,
      "$lib/*": `${sharedLib}/*`,
    },
  },
  extensions: [".svelte", ".svx", ".md"],
};

export default config;
