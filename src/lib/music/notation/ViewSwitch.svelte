<script lang="ts">
  // Staff or falling notes, named "View" and kept in the stage header beside what it changes.
  // The view lives in the URL (?view=), like the hub tabs, so Back and reload keep it.
  import { page } from "$app/state";
  import { NOTE_VIEWS } from "./falling";
  let { class: cls = "" }: { class?: string } = $props();
  const current = $derived(page.url.searchParams.get("view") ?? NOTE_VIEWS[0].id);
  const hrefFor = (id: string) => {
    const q = new URLSearchParams(page.url.searchParams);
    q.delete("instrument");
    if (id === NOTE_VIEWS[0].id) q.delete("view");
    else q.set("view", id);
    const s = q.toString();
    return s ? `?${s}` : page.url.pathname;
  };
</script>

<div class="flex items-center gap-2 {cls}">
  <span class="text-sm font-medium text-ws-stage-soft" aria-hidden="true">View</span>
  <nav aria-label="Notes view" class="inline-flex gap-1 rounded-full bg-ws-stage-ink/10 p-1 text-sm font-medium">
    {#each NOTE_VIEWS as v (v.id)}
      <a
        href={hrefFor(v.id)}
        aria-current={current === v.id ? "page" : undefined}
        data-sveltekit-noscroll
        class="flex min-h-11 items-center rounded-full px-4 {current === v.id ? 'bg-ws-stage-ink text-ws-stage' : 'text-ws-stage-soft hover:text-ws-stage-ink'}">{v.label}</a
      >
    {/each}
  </nav>
</div>
