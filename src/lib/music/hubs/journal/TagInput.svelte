<script lang="ts">
  import { m } from "@repo/i18n/messages.js";
  // Tags as removable chips: type one and press Enter or a comma; the browser's own list
  // (a datalist) suggests tags used before.
  import X from "@lucide/svelte/icons/x";
  import { parseTags } from "../progress/model";

  let { tags = $bindable([]), suggestions = [], label = m.music_hubs_tags() }: { tags?: string[]; suggestions?: string[]; label?: string } = $props();
  const uid = $props.id();
  let draft = $state("");

  function add(raw: string) {
    tags = [...new Set([...tags, ...parseTags(raw)])];
    draft = "";
  }
  function onkeydown(e: KeyboardEvent) {
    if ((e.key === "Enter" || e.key === ",") && draft.trim()) {
      e.preventDefault();
      add(draft);
    } else if (e.key === "Backspace" && !draft && tags.length) tags = tags.slice(0, -1);
  }
</script>

<div class="flex flex-col gap-1 text-sm">
  <label for="{uid}-input" class="font-medium">{label}</label>
  <!-- One bordered field: the chips and the typing space share it, no box inside the box. -->
  <div class="flex min-h-11 flex-wrap items-center gap-1.5 rounded-lg border border-ws-line bg-ws-surface px-2 py-1.5 focus-within:outline-2 focus-within:outline-ws-ink">
    {#each tags as t (t)}
      <span class="inline-flex items-center gap-0.5 rounded-full bg-instr-wash py-0.5 pr-0.5 pl-2.5">
        {t}
        <button
          type="button"
          class="relative grid size-7 place-items-center rounded-full hover:bg-ws-raised after:absolute after:-inset-2 after:content-['']"
          aria-label={m.music_hubs_tags_remove({ tag: t })}
          onclick={() => (tags = tags.filter((x) => x !== t))}><X class="size-3.5" aria-hidden="true" /></button
        >
      </span>
    {/each}
    <input
      id="{uid}-input"
      list="{uid}-list"
      class="min-h-8 min-w-28 flex-1 appearance-none border-0 bg-transparent px-1 shadow-none outline-none ring-0 focus:ring-0"
      bind:value={draft}
      {onkeydown}
      oninput={() => draft.includes(",") && add(draft)}
      onblur={() => draft.trim() && add(draft)}
      placeholder={tags.length ? m.music_hubs_tags_add() : m.music_hubs_tags_example()}
      aria-describedby="{uid}-hint"
    />
  </div>
  <datalist id="{uid}-list">
    {#each suggestions.filter((s) => !tags.includes(s)) as s (s)}<option value={s}></option>{/each}
  </datalist>
  <span id="{uid}-hint" class="text-[13px] text-ws-soft">{m.music_hubs_tags_hint()}</span>
</div>
