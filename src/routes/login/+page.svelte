<script lang="ts">
  import KeyRound from "lucide-svelte/icons/key-round";
  import * as Card from "@repo/ui/card";
  import { Button } from "@repo/ui/button";
  import LogoMark from "$lib/components/site/LogoMark.svelte";

  let { data, form } = $props();

  // Better Auth reports a failed sign-in with ?error=<code>.
  const errorText = (code: string) =>
    code === "access_denied"
      ? "Sign-in was cancelled in Authentik."
      : "Signing in with Authentik didn't work. Try again.";
  const message = $derived(form?.message ?? (data.error ? errorText(data.error) : null));
</script>

<svelte:head>
  <title>Sign in | Gaspard Michel Etienne</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="gm-page signin">
  <Card.Root class="w-full max-w-md">
    <Card.Header class="items-start gap-4">
      <LogoMark size={40} />
      <Card.Title level={1} class="text-2xl">Sign in</Card.Title>
      <Card.Description>
        The private side of this site is for me. Sign in with my homelab's Authentik account.
      </Card.Description>
    </Card.Header>
    <Card.Content class="flex flex-col gap-4">
      {#if data.available}
        <form method="post">
          <Button type="submit" size="lg" class="w-full">
            <KeyRound data-icon="inline-start" aria-hidden="true" />
            Continue with Authentik
          </Button>
        </form>
      {:else}
        <p class="text-sm text-muted-foreground">
          Sign-in isn't set up on this server yet.
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
