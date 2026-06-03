<script lang="ts">
  import Header from "$lib/components/site/Header.svelte";
  import "../app.css";
  import { page } from "$app/stores";
  import { ModeWatcher } from "mode-watcher";
  import SplashScreen from "$lib/components/site/SplashScreen.svelte";
  import Footer from "$lib/components/site/Footer.svelte";

  let commands = $state("");
  let { children } = $props();
  const currentPath = $derived($page.url?.pathname ?? "/");
</script>

<svelte:window
  onkeypress={({ key, ctrlKey }) => {
    if (key === "esc") {
      commands = "";
    } else if (ctrlKey) {
      commands.concat(key);
    }
  }}
/>

<div class="app flex min-h-screen flex-col">
  {#if currentPath === "/"}
    <SplashScreen />
  {/if}
  <ModeWatcher />
  <Header />
  <main class="grow">
    {@render children()}
  </main>
  <Footer />
</div>
