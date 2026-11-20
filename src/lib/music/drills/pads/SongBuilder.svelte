<script lang="ts">
  // Write a song-form piece: sections in order (an intro, grooves from any
  // level, a chop on the slices, a solo over a loop, an end), each with its
  // bars and its level. Every change is saved; the run plays and grades it.
  import ArrowUp from "@lucide/svelte/icons/arrow-up";
  import ArrowDown from "@lucide/svelte/icons/arrow-down";
  import Trash from "@lucide/svelte/icons/trash-2";
  import { CHOP_EDITS, CHOP_SOURCES, WRITTEN_ENDS, WRITTEN_GROOVES, setCheck, writtenPiece, type Dyn, type WrittenRole, type WrittenSection, type WrittenSong } from "@repo/music-core/content/pads-studio";
  import Picker from "#lib/music/components/Picker.svelte";
  import { btn } from "#lib/music/components/ui.ts";
  import { m } from "@repo/i18n/messages.js";
  import { formatList } from "@repo/i18n/format";
  import { sectionLabelText } from "@repo/music-core/content/pads-grid";
  import { padStyleLabel } from "@repo/music-core/content/pads-repertoire";

  let { song, bpm, onchange, ondelete }: { song: WrittenSong; bpm: number; onchange: (song: WrittenSong) => void; ondelete: () => void } = $props();

  const piece = $derived(writtenPiece(song));
  const check = $derived(setCheck(song, bpm));
  const time = (min: number) => {
    const sec = Math.round(min * 60);
    return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
  };

  const GROOVES = WRITTEN_GROOVES.map((r) => ({ value: r.groove.value, label: `${r.groove.label} (${padStyleLabel(r.style)})`, group: m.music_winds_song_level_group({ level: r.level }) }));
  const SOURCES = CHOP_SOURCES.map((x) => ({ value: x.id, label: x.label }));
  const ENDS = WRITTEN_ENDS.map((x) => ({ value: x.id, label: x.label }));
  const BARS = [1, 2, 4, 8, 12, 16, 24, 32].map((n) => ({ value: String(n), label: m.music_winds_bars_count({ count: n }) }));
  const DYN_LABELS: Record<Dyn, () => string> = { soft: m.music_winds_song_dyn_soft, medium: m.music_winds_song_dyn_medium, loud: m.music_winds_song_dyn_loud, rising: m.music_winds_song_dyn_rising };
  const DYNS = (["soft", "medium", "loud", "rising"] as Dyn[]).map((d) => ({ value: d, label: DYN_LABELS[d]() }));
  const edits = (source: string) => [{ value: "order", label: m.music_winds_song_slices_in_order() }, ...CHOP_EDITS.filter((e) => !e.source || e.source === source).map((e) => ({ value: e.id, label: e.label }))];
  const ROLES: { role: WrittenRole; label: string }[] = [
    { role: "intro", label: m.music_winds_song_role_intro() },
    { role: "groove", label: m.music_winds_song_role_groove() },
    { role: "chop", label: m.music_winds_song_role_chop() },
    { role: "solo", label: m.music_winds_song_role_solo() },
    { role: "end", label: m.music_winds_song_role_end() },
  ];

  const write = (sections: WrittenSection[]) => onchange({ ...song, bpm, sections });
  function set(i: number, patch: Partial<WrittenSection>) {
    // One loop is on the slices, so every chop section plays the same one.
    const chopRef = song.sections[i].role === "chop" && patch.ref ? patch.ref : null;
    write(song.sections.map((s, k) => (k === i ? { ...s, ...patch, ...(chopRef ? { edit: "order" } : {}) } : chopRef && s.role === "chop" ? { ...s, ref: chopRef, edit: "order" } : s)));
  }
  function move(i: number, by: number) {
    const next = [...song.sections];
    [next[i], next[i + by]] = [next[i + by], next[i]];
    write(next);
  }
  function add(role: WrittenRole) {
    const chop = song.sections.find((s) => s.role === "chop")?.ref ?? "boom-bap-b";
    const fresh: WrittenSection =
      role === "chop" ? { role, ref: chop, edit: "order", bars: 4, dyn: "medium" } : role === "end" ? { role, ref: "stop", bars: 1, dyn: "loud" } : role === "solo" ? { role, ref: "boom-bap-b", bars: 8, dyn: "medium" } : { role, ref: role === "intro" ? "eighth-hats" : "basic-rock", bars: role === "intro" ? 4 : 8, dyn: role === "intro" ? "soft" : "medium" };
    // An end stays last; anything else goes before it.
    const endAt = song.sections.findIndex((s) => s.role === "end");
    const next = [...song.sections];
    next.splice(role === "end" || endAt < 0 ? next.length : endAt, 0, fresh);
    write(next);
  }
</script>

<div class="flex flex-col gap-3 sm:col-span-2 lg:col-span-3" data-testid="song-builder">
  <label class="flex max-w-sm flex-col gap-1 text-sm">
    <span class="font-medium">{m.music_winds_song_name()}</span>
    <input class="min-h-11 rounded-lg border border-ws-line bg-ws-surface px-3" value={song.label} onchange={(e) => onchange({ ...song, label: e.currentTarget.value.trim() || m.music_winds_song_default_name() })} />
  </label>
  <ol class="flex flex-col gap-2" aria-label={m.music_winds_song_sections()}>
    {#each song.sections as sec, i (i)}
      {@const span = piece.spans[i]}
      {@const name = sectionLabelText(span.label)}
      <li class="flex flex-wrap items-center gap-2 rounded-xl border border-ws-line p-2 text-sm" aria-label={m.music_winds_song_section_aria({ label: name, from: span.from + 1, to: span.from + span.bars })}>
        <span class="w-20 font-semibold capitalize">{name}</span>
        {#if sec.role === "chop"}
          <Picker class="w-44" label={m.music_winds_song_pick_source({ label: name })} value={sec.ref} options={SOURCES} onchange={(v) => set(i, { ref: v })} />
          <Picker class="w-56" label={m.music_winds_song_pick_order({ label: name })} value={sec.edit ?? "order"} options={edits(sec.ref)} onchange={(v) => set(i, { edit: v })} />
        {:else if sec.role === "end"}
          <Picker class="w-72" label={m.music_winds_song_pick_end({ label: name })} value={sec.ref} options={ENDS} onchange={(v) => set(i, { ref: v })} />
        {:else}
          <Picker class="w-64" label={sec.role === "solo" ? m.music_winds_song_pick_loop({ label: name }) : m.music_winds_song_pick_groove({ label: name })} value={sec.ref} options={GROOVES} onchange={(v) => set(i, { ref: v })} />
        {/if}
        {#if sec.role !== "end"}
          <Picker class="w-28" label={m.music_winds_song_pick_bars({ label: name })} value={String(sec.bars)} options={BARS} onchange={(v) => set(i, { bars: Number(v) })} />
        {:else}
          <span class="text-ws-soft">{m.music_winds_bars_count({ count: span.bars })}</span>
        {/if}
        <Picker class="w-28" label={m.music_winds_song_pick_level({ label: name })} value={sec.dyn} options={DYNS} onchange={(v) => set(i, { dyn: v as Dyn })} />
        <span class="ml-auto flex gap-1">
          <button type="button" class="{btn} px-3" aria-label={m.music_winds_song_move_earlier({ label: name })} disabled={i === 0} onclick={() => move(i, -1)}><ArrowUp class="size-4" /></button>
          <button type="button" class="{btn} px-3" aria-label={m.music_winds_song_move_later({ label: name })} disabled={i === song.sections.length - 1} onclick={() => move(i, 1)}><ArrowDown class="size-4" /></button>
          <button type="button" class="{btn} px-3" aria-label={m.music_winds_song_remove({ label: name })} disabled={song.sections.length === 1} onclick={() => write(song.sections.filter((_, k) => k !== i))}><Trash class="size-4" /></button>
        </span>
      </li>
    {/each}
  </ol>
  <div class="flex flex-wrap items-center gap-2 text-sm">
    <span class="font-medium">{m.music_winds_song_add()}</span>
    {#each ROLES as r (r.role)}
      <button type="button" class={btn} onclick={() => add(r.role)}>{r.label}</button>
    {/each}
    <button type="button" class="{btn} ml-auto" onclick={ondelete}>{m.music_winds_song_delete()}</button>
  </div>
  <p class="text-sm" data-testid="set-check">
    {m.music_winds_song_length({ bars: piece.bars, time: time(check.minutes), bpm })}
    {check.ok ? m.music_winds_song_set_ok() : m.music_winds_song_set_missing({ missing: formatList(check.missing) })}
    <span class="text-ws-soft">{m.music_winds_song_help()}</span>
  </p>
</div>
