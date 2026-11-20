<script lang="ts">
  import Header from "#lib/components/site/Header.svelte";
  import "../app.css";
  import { page } from '$app/state';
  import { ModeWatcher } from "mode-watcher";
  import SplashScreen from "#lib/components/site/SplashScreen.svelte";
  import Footer from "#lib/components/site/Footer.svelte";

  let commands = $state("");
  let { children } = $props();
  const currentPath = $derived(page.url?.pathname ?? "/");
  // The music app brings its own navigation (theme toggle and a link home included).
  // An error page is drawn outside it, so it keeps the site's.
  const music = $derived(
    !page.error && (currentPath === "/music" || currentPath.startsWith("/music/")),
  );
</script>

<svelte:window
  onkeypress={({ key, ctrlKey }) => {
    if (key === "esc") {
      commands = "";
    } else if (ctrlKey) {
      commands.concat(key);
    }
  }}
></svelte:window>

<div class="app flex min-h-screen flex-col">
  {#if currentPath === "/"}
    <SplashScreen />
  {/if}
  <ModeWatcher />
  {#if !music}<Header />{/if}
  <main class="grow">
    {@render children()}
  </main>
  {#if !music}<Footer />{/if}
</div>
