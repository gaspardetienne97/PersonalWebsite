<script lang="ts">
  // The route's modes as URL-backed links (?mode=, like HubTabs) drawn for the
  // dark stage: plain links, so Back and reload land on the same mode.
  import { page } from "$app/state";
  let { tabs, label }: { tabs: readonly { id: string; label: string }[]; label: string } = $props();
  const current = $derived(page.url.searchParams.get("mode") ?? tabs[0].id);
  const hrefFor = (id: string) => {
    const q = new URLSearchParams(page.url.searchParams);
    if (id === tabs[0].id) q.delete("mode");
    else q.set("mode", id);
    const s = q.toString();
    return s ? `?${s}` : page.url.pathname;
  };
</script>

<nav aria-label={label} class="mb-4 flex flex-wrap gap-1.5">
  {#each tabs as t (t.id)}
    <a
      href={hrefFor(t.id)}
      aria-current={current === t.id ? "page" : undefined}
      data-sveltekit-noscroll
      class="flex min-h-11 items-center rounded-lg px-3.5 text-sm font-semibold {current === t.id
        ? 'bg-instr text-ws-stage'
        : 'bg-ws-stage-ink/8 text-ws-stage-soft hover:bg-ws-stage-ink/15 hover:text-ws-stage-ink'}">{t.label}</a
    >
  {/each}
</nav>
