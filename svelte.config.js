import { escapeSvelte, mdsvex } from "mdsvex";
import adapter from "@sveltejs/adapter-node";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

const highlightCodeBlock = (code, lang = "") => {
  const language = lang.toLowerCase().replace(/[^a-z0-9_-]/g, "");
  const className = language ? ` class="language-${language}"` : "";
  return `<pre${className}><code${className}>${escapeSvelte(code)}</code></pre>`;
};

/** @type {import('@sveltejs/kit').Config} */
const config = {
  // Consult https://svelte.dev/docs/kit/integrations
  // for more information about preprocessors
  preprocess: [
    vitePreprocess(),
    mdsvex({
      smartypants: true,
      extensions: [".md", ".mdx", ".svx"],
      highlight: { highlighter: highlightCodeBlock },
    }),
  ],

  kit: {
    // adapter-auto only supports some environments, see https://svelte.dev/docs/kit/adapter-auto for a list.
    // If your environment is not supported, or you settled on a specific environment, switch out the adapter.
    // See https://svelte.dev/docs/kit/adapters for more information about adapters.
    adapter: adapter(),
  },

  extensions: [".svelte", ".svx", ".md"],
};

export default config;
