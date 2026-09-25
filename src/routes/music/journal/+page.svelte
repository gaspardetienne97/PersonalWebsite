<script lang="ts">
  import JournalView from "$lib/music/hubs/journal/JournalView.svelte";

  let status = $state("");
  const announce = (msg: string) => {
    // Clear first so the same message twice is still read out.
    status = "";
    queueMicrotask(() => (status = msg));
  };
</script>

<svelte:head><title>Journal</title></svelte:head>

<div class="mx-auto flex max-w-6xl flex-col gap-6">
  <header>
    <h1 class="font-display text-4xl font-semibold tracking-tight sm:text-5xl">Journal</h1>
    <p class="mt-1 text-ws-soft">
      Every session you saved, what it measured and what you noted. <a
        class="font-semibold text-instr-ink underline underline-offset-4"
        href="/music/progress">See what to play next</a
      >
    </p>
  </header>
  <p role="status" class="sr-only">{status}</p>
  <JournalView {announce} />
</div>
