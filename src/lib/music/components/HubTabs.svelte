<script lang="ts">
  // Hub views live in the URL (?tab=, ?view=, ?mode=) so bookmarks, Back and
  // reload land on the same view. Plain links: page.url drives the content.
  import { page } from "$app/state";
  interface Props {
    param: string;
    tabs: readonly { id: string; label: string }[];
    label: string;
  }
  let { param, tabs, label }: Props = $props();
  const current = $derived(page.url.searchParams.get(param) ?? tabs[0].id);
  const hrefFor = (id: string) => {
    const q = new URLSearchParams(page.url.search);
    // ?instrument= is applied once by the layout; a tab link must not replay it.
    q.delete("instrument");
    if (id === tabs[0].id) q.delete(param);
    else q.set(param, id);
    const s = q.toString();
    return s ? `?${s}` : page.url.pathname;
  };
</script>

<nav aria-label={label} class="flex flex-wrap gap-1 rounded-full border border-ws-line bg-ws-surface p-1">
  {#each tabs as t (t.id)}
    <a
      href={hrefFor(t.id)}
      aria-current={current === t.id ? "page" : undefined}
      data-sveltekit-reset="false"
      class="flex min-h-11 items-center rounded-full px-4 text-sm font-medium {current === t.id
        ? 'bg-ws-ink text-ws-bg'
        : 'text-ws-soft hover:text-ws-ink'}">{t.label}</a
    >
  {/each}
</nav>
