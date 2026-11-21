<script lang="ts">
  import { page } from "$app/state";
  import ListMusic from "@lucide/svelte/icons/list-music";
  import { Button } from "@repo/ui/button";
  import { Empty } from "@repo/ui/empty";
  import { name } from "#lib/config.ts";
  import { m } from "@repo/i18n/messages.js";
  import SideBar from "./SideBar.svelte";
  import { createSpotifyStore } from "./spotifyStore";

  let { children } = $props();
  const redirectURL = page.url.href.split("?")[0] ?? `${page.url.protocol}//${page.url.host}`;
  const spotify = createSpotifyStore(redirectURL);
</script>

<svelte:head>
  <title>Listplay | {name}</title>
  <meta name="description" content={m.project_listplay_summary()} />
</svelte:head>

<div class="gm-page listplay">
  <header class="flex flex-col gap-5">
    <h1 class="gm-title">Listplay</h1>
    <p class="gm-lede">{m.project_listplay_summary()}</p>
  </header>

  {#await spotify.isAuthenticated() then signedIn}
    {#if signedIn}
      <div class="mt-10 grid gap-6 md:grid-cols-[14rem_minmax(0,1fr)]">
        <aside class="flex flex-col gap-4"><SideBar /></aside>
        <div class="min-w-0">{@render children()}</div>
      </div>
    {:else if spotify.configured}
      <Empty
        class="mt-10"
        title={m.listplay_signed_out_title()}
        description={m.listplay_signed_out_body()}
      >
        {#snippet icon()}<ListMusic />{/snippet}
        <Button onclick={spotify.login}>{m.listplay_sign_in()}</Button>
      </Empty>
    {:else}
      <Empty
        class="mt-10"
        title={m.listplay_unavailable_title()}
        description={m.listplay_unavailable_body()}
      >
        {#snippet icon()}<ListMusic />{/snippet}
      </Empty>
    {/if}
  {/await}
</div>

<style>
  .listplay {
    padding-top: clamp(3rem, 8vw, 6rem);
  }
</style>
