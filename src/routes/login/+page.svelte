<script lang="ts">
  import { m } from "#lib/paraglide/messages.js";
  import KeyRound from "@lucide/svelte/icons/key-round";
  import * as Card from "@repo/ui/card";
  import { Button } from "@repo/ui/button";
  import LogoMark from "#lib/components/site/LogoMark.svelte";

  let { data, form } = $props();

  // Better Auth reports a failed sign-in with ?error=<code>.
  const errorText = (code: string) =>
    code === "access_denied"
      ? m.login_cancelled()
      : m.login_failed();
  const message = $derived(form?.message ?? (data.error ? errorText(data.error) : null));
</script>

<svelte:head>
  <title>{m.login_title()} | Gaspard Michel Etienne</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="gm-page signin">
  <Card.Root class="w-full max-w-md">
    <Card.Header class="items-start gap-4">
      <LogoMark size={40} />
      <Card.Title level={1} class="text-2xl">{m.login_title()}</Card.Title>
      <Card.Description>
        {m.login_body()}
      </Card.Description>
    </Card.Header>
    <Card.Content class="flex flex-col gap-4">
      {#if data.available}
        <form method="post">
          <Button type="submit" size="lg" class="w-full">
            <KeyRound data-icon="inline-start" aria-hidden="true" />
            {m.login_continue()}
          </Button>
        </form>
      {:else}
        <p class="text-sm text-muted-foreground">
          {m.login_unavailable()}
        </p>
      {/if}
      {#if message}
        <p class="text-sm text-destructive" role="alert">{message}</p>
      {/if}
    </Card.Content>
  </Card.Root>
</div>

<style>
  .signin {
    display: grid;
    place-items: center;
    min-height: 60vh;
    padding-top: clamp(3rem, 8vw, 6rem);
  }
</style>
