<script lang="ts">
  import { m } from "@repo/i18n/messages.js";
  import LogOut from "@lucide/svelte/icons/log-out";
  import Lock from "@lucide/svelte/icons/lock";
  import * as Avatar from "@repo/ui/avatar";
  import { Button } from "@repo/ui/button";
  import { Empty } from "@repo/ui/empty";
  import { initials } from "#lib/utils.ts";

  let { data } = $props();
</script>

<svelte:head>
  <title>{m.private_title()} | Gaspard Michel Etienne</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="gm-page private">
  <header class="head">
    <div class="flex flex-col gap-5">
      <h1 class="gm-title">{m.private_title()}</h1>
      <p class="gm-lede">{m.private_lede()}</p>
    </div>
    <div class="who">
      <Avatar.Root class="size-10">
        {#if data.user.image}<Avatar.Image src={data.user.image} alt="" />{/if}
        <Avatar.Fallback>{initials(data.user.name)}</Avatar.Fallback>
      </Avatar.Root>
      <div class="flex flex-col">
        <span class="font-medium">{data.user.name}</span>
        <span class="text-sm text-muted-foreground">{data.user.email}</span>
      </div>
      <form method="post" action="?/signOut">
        <Button type="submit" variant="outline" size="sm">
          <LogOut data-icon="inline-start" aria-hidden="true" />
          {m.private_sign_out()}
        </Button>
      </form>
    </div>
  </header>

  <section class="mt-12" aria-label={m.private_notes_label()}>
    <Empty
      title={m.private_empty_title()}
      description={m.private_empty_body()}
    >
      {#snippet icon()}<Lock />{/snippet}
    </Empty>
  </section>
</div>

<style>
  .private {
    padding-top: clamp(3rem, 8vw, 6rem);
  }
  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    justify-content: space-between;
    gap: 1.5rem 2rem;
  }
  .who {
    display: flex;
    align-items: center;
    gap: 0.9rem;
  }
</style>
