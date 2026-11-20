<script lang="ts">
  import { m } from "@repo/i18n/messages.js";
  // The song's tracks: the beat and each melody, one row each to play it
  // alone, name it, pick what it sounds like, set its level or mute it, and a menu.
  import Play from "@lucide/svelte/icons/play";
  import Square from "@lucide/svelte/icons/square";
  import Plus from "@lucide/svelte/icons/plus";
  import Minus from "@lucide/svelte/icons/minus";
  import Dots from "@lucide/svelte/icons/ellipsis";
  import Volume from "@lucide/svelte/icons/volume-2";
  import VolumeOff from "@lucide/svelte/icons/volume-off";
  import type { Snippet } from "svelte";
  import { goto } from "$app/navigation";
  import * as Menu from "@repo/ui/dropdown-menu";
  import Picker from "#lib/music/components/Picker.svelte";
  import KeyPicker from "#lib/music/components/KeyPicker.svelte";
  import { audio } from "#lib/music/runtime/index.ts";
  import { kits } from "./kitStore.svelte";
  import { session, type TrackId } from "./session.svelte";
  import { barsOf, hitCount, MAX_BARS, removeBar } from "./pattern";
  import { chordsIn, KEYS, progressionVoice, PROGRESSIONS } from "./progressions";
  import { chord } from "#lib/music/names.svelte.ts";
  import { loopBeats, ROLL_SOUNDS, soundOf, trackColour, type RollVoice } from "./roll";

  let { announce }: { announce: (msg: string) => void } = $props();

  /** The destructive menu item waiting for its second tap. */
  let confirming = $state("");

  const bars = (n: number) => m.music_hubs_songs_bars({ count: n });
  const hits = (n: number) => m.music_hubs_count_hits({ count: n });
  const notes = (n: number) => m.music_hubs_count_notes({ count: n });
  const soundLabel = (s: RollVoice["sound"]) => ROLL_SOUNDS.find((x) => x.value === s)?.label ?? m.music_hubs_sound_piano();

  async function solo(id: TrackId, name: string) {
    const was = session.playing && session.only === id;
    const ok = await session.play(id);
    if (!ok) return announce(m.music_hubs_tracks_blocked());
    announce(was ? m.music_hubs_tracks_stopped() : m.music_hubs_tracks_playing_alone({ name }));
  }

  function setSound(v: RollVoice, sound: string) {
    session.updateVoice(v.id, (x) => ({ ...x, sound: sound as RollVoice["sound"] }));
    void audio.unlock().then(() => audio.playNote(60, 0.5, 0.8, sound as RollVoice["sound"]));
    announce(m.music_hubs_tracks_plays_sound({ name: v.name, sound: soundLabel(sound as RollVoice["sound"]) }));
  }

  const LOOPS = [1, 2, 4, 8];
  function setLoop(v: RollVoice, n: number) {
    session.updateVoice(v.id, (x) => ({ ...x, loopBars: n || undefined }));
    announce(
      n
        ? m.music_hubs_tracks_loop_set({ name: v.name, bars: bars(n), total: session.bars, last: n })
        : m.music_hubs_tracks_loop_off({ name: v.name }),
    );
  }

  function toggleBeat() {
    session.beatMuted = !session.beatMuted;
    announce(session.beatMuted ? m.music_hubs_tracks_beat_muted() : m.music_hubs_tracks_beat_on());
  }
  function toggleMelody(v: RollVoice) {
    session.updateVoice(v.id, (x) => ({ ...x, muted: !x.muted }));
    announce(v.muted ? m.music_hubs_tracks_voice_on({ name: v.name }) : m.music_hubs_tracks_voice_muted({ name: v.name }));
  }

  async function pickKit(id: string) {
    await kits.select(id);
    announce(m.music_hubs_tracks_beat_plays({ kit: kits.kit?.name ?? "" }));
  }

  function addMelody() {
    const v = session.addMelody();
    announce(m.music_hubs_tracks_added({ name: v.name }));
  }

  let chordKey = $state(0);
  function addChords(id: string) {
    const p = PROGRESSIONS.find((x) => x.id === id);
    if (!p) return;
    const before = session.bars;
    const v = progressionVoice(p, chordKey, crypto.randomUUID());
    session.addMelodyFrom(v);
    announce(
      m.music_hubs_tracks_added_chords({ name: v.name, chords: chordsIn(p, chordKey).map((c) => chord(c)).join(", ") }) +
        (session.bars > before ? m.music_hubs_tracks_song_grew({ count: session.bars }) : ""),
    );
  }

  function fromLibrary(value: string) {
    const [kind, id] = value.split(":");
    if (kind === "beat") {
      const b = session.useBeat(id);
      if (b) announce(m.music_hubs_tracks_beat_now({ name: b.name, hits: hits(hitCount(b)) }));
    } else {
      const v = session.useMelody(id);
      if (v) announce(m.music_hubs_tracks_added_melody({ name: v.name }));
    }
  }

  async function saveBeat() {
    const b = await session.saveBeat();
    announce(m.music_hubs_tracks_saved_beat({ name: b.name }));
  }
  async function saveMelody(v: RollVoice) {
    if (!v.notes.length) return announce(m.music_hubs_tracks_no_notes({ name: v.name }));
    await session.saveMelody(v);
    announce(m.music_hubs_tracks_saved_melody({ name: v.name }));
  }

  // The beat's own length: it repeats to fill the song, and a longer beat grows the song.
  function growBeat() {
    const song = session.bars;
    session.growBeat();
    announce(
      m.music_hubs_tracks_beat_grew({ bars: bars(barsOf(session.pattern)) }) +
        (session.bars > song ? m.music_hubs_tracks_song_grew_to({ bars: bars(session.bars) }) : ""),
    );
  }
  function shrinkBeat() {
    session.setPattern(removeBar(session.pattern));
    announce(m.music_hubs_tracks_beat_shrank({ bars: bars(barsOf(session.pattern)) }));
  }

  /** First tap asks, second tap does it. */
  function twice(key: string, e: Event, run: () => void) {
    if (confirming !== key) {
      e.preventDefault(); // keep the menu open for the second tap
      confirming = key;
      return;
    }
    confirming = "";
    run();
  }

  const row = "grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-x-2 gap-y-1 rounded-2xl border border-ws-line bg-ws-surface p-2 sm:grid-cols-[auto_minmax(0,1fr)_18rem_auto_auto]";
  const name = "min-h-9 w-full min-w-0 rounded-md border border-transparent bg-transparent px-1.5 font-semibold hover:border-ws-line focus:border-ws-line";
  const soloing = (id: TrackId) => session.playing && session.only === id;
  const icon = "grid size-11 shrink-0 place-items-center rounded-full text-ws-soft hover:bg-ws-raised hover:text-ws-ink";
</script>

{#snippet menu(label: string, items: Snippet)}
  <Menu.Root onOpenChange={(open) => !open && (confirming = "")}>
    <Menu.Trigger class={icon} aria-label={label}><Dots class="size-5" aria-hidden="true" /></Menu.Trigger>
    <Menu.Content align="end" class="w-56">{@render items()}</Menu.Content>
  </Menu.Root>
{/snippet}

{#snippet fader(label: string, value: number, set: (v: number) => void)}
  <input
    type="range"
    min="0"
    max="1"
    step="0.05"
    class="min-h-11 w-16 accent-[var(--instr)] sm:w-24"
    aria-label={label}
    aria-valuetext="{Math.round(value * 100)}%"
    {value}
    oninput={(e) => set(e.currentTarget.valueAsNumber)}
  />
{/snippet}

{#snippet playButton(id: TrackId, label: string, colour: string)}
  <button
    type="button"
    class="grid size-11 shrink-0 place-items-center rounded-full text-white shadow-sm hover:brightness-110"
    style:background={colour}
    aria-pressed={soloing(id)}
    aria-label={soloing(id) ? m.music_hubs_tracks_stop_alone({ name: label }) : m.music_hubs_tracks_play_alone({ name: label })}
    onclick={() => solo(id, label)}
  >
    {#if soloing(id)}<Square class="size-4 fill-current" aria-hidden="true" />{:else}<Play class="size-4 fill-current" aria-hidden="true" />{/if}
  </button>
{/snippet}

<section class="flex flex-col gap-2" aria-labelledby="tracks-h">
  <h2 id="tracks-h" class="font-display text-lg font-semibold">{m.music_hubs_tracks_title()}</h2>
  <ul class="flex flex-col gap-2">
    <li class={row} class:opacity-70={session.beatMuted}>
      {@render playButton("beat", session.pattern.name, "var(--instr)")}
      <div class="flex min-w-0 flex-col">
        <input class={name} aria-label={m.music_hubs_tracks_beat_name()} value={session.pattern.name} onchange={(e) => session.setPattern({ ...session.pattern, name: e.currentTarget.value || session.pattern.name })} />
        <span class="flex flex-wrap items-center gap-x-1 px-1.5 text-[13px] text-ws-soft">
          <span>{m.music_hubs_tracks_beat_line({ hits: hits(hitCount(session.pattern)), bars: bars(barsOf(session.pattern)) })}{session.beatMuted ? m.music_hubs_tracks_muted_part() : ""}</span>
          <span class="flex items-center" role="group" aria-label={m.music_hubs_tracks_beat_length()}>
            <button type="button" class="grid size-11 place-items-center rounded-full hover:bg-ws-raised disabled:opacity-35" aria-label={m.music_hubs_tracks_beat_remove()} disabled={barsOf(session.pattern) <= 1} onclick={shrinkBeat}><Minus class="size-4" aria-hidden="true" /></button>
            <button type="button" class="grid size-11 place-items-center rounded-full hover:bg-ws-raised disabled:opacity-35" aria-label={m.music_hubs_tracks_beat_add()} disabled={barsOf(session.pattern) >= MAX_BARS} onclick={growBeat}><Plus class="size-4" aria-hidden="true" /></button>
          </span>
        </span>
      </div>
      <Picker class="order-last col-span-4 sm:order-none sm:col-span-1" label={m.music_hubs_tracks_beat_kit()} value={kits.kit?.id} options={kits.kits.map((k) => ({ value: k.id, label: k.name }))} onchange={pickKit} />
      <div class="flex items-center">
        <button type="button" class={icon} aria-pressed={session.beatMuted} aria-label={session.beatMuted ? m.music_hubs_tracks_unmute_beat() : m.music_hubs_tracks_mute_beat()} onclick={toggleBeat}>
          {#if session.beatMuted}<VolumeOff class="size-5" aria-hidden="true" />{:else}<Volume class="size-5" aria-hidden="true" />{/if}
        </button>
        {@render fader(m.music_hubs_tracks_beat_volume(), session.beatVolume, (x) => (session.beatVolume = x))}
      </div>
      {#snippet beatItems()}
        <Menu.Item onSelect={saveBeat}>{m.music_hubs_tracks_save_beat()}</Menu.Item>
        <Menu.Item onSelect={() => goto("/music/create/kits")}>{m.music_hubs_tracks_edit_kits()}</Menu.Item>
        <Menu.Separator />
        <Menu.Item
          variant="destructive"
          disabled={!hitCount(session.pattern)}
          onSelect={(e) => twice("beat", e, () => {
            session.setPattern({ ...session.pattern, steps: {} });
            announce(m.music_hubs_tracks_cleared_beat());
          })}
        >{confirming === "beat" ? m.music_hubs_tracks_clear_q({ what: hits(hitCount(session.pattern)) }) : m.music_hubs_tracks_clear_beat()}</Menu.Item>
      {/snippet}
      {@render menu(m.music_hubs_tracks_beat_options(), beatItems)}
    </li>

    {#each session.doc.voices as v, i (v.id)}
      <li class={row} class:opacity-70={v.muted}>
        {@render playButton(v.id, v.name, trackColour(i))}
        <div class="flex min-w-0 flex-col">
          <input class={name} aria-label={m.music_hubs_tracks_name_of({ name: v.name })} value={v.name} onfocus={() => (session.picked.includes(v.id) ? (session.selected = v.id) : session.pick(v.id))} onchange={(e) => session.updateVoice(v.id, (x) => ({ ...x, name: e.currentTarget.value || x.name }))} />
          <span class="px-1.5 text-[13px] text-ws-soft">{m.music_hubs_tracks_melody_line({ notes: notes(v.notes.length) })}{loopBeats(v, session.doc.lengthBeats) ? m.music_hubs_tracks_looping_part({ bars: bars(v.loopBars!) }) : ""}{v.muted ? m.music_hubs_tracks_muted_part() : ""}</span>
        </div>
        <div class="order-last col-span-4 grid grid-cols-2 gap-2 sm:order-none sm:col-span-1">
          <Picker label={m.music_hubs_tracks_instrument_of({ name: v.name })} value={soundOf(v)} options={ROLL_SOUNDS} onchange={(s) => setSound(v, s)} />
          <Picker
            label={m.music_hubs_tracks_loop_of({ name: v.name })}
            value={String(loopBeats(v, session.doc.lengthBeats) ? v.loopBars : 0)}
            options={[{ value: "0", label: m.music_hubs_tracks_no_loop() }, ...LOOPS.filter((n) => n < session.bars).map((n) => ({ value: String(n), label: m.music_hubs_tracks_loop_n({ bars: bars(n) }) }))]}
            onchange={(n) => setLoop(v, Number(n))}
          />
        </div>
        <div class="flex items-center">
          <button type="button" class={icon} aria-pressed={!!v.muted} aria-label={v.muted ? m.music_hubs_tracks_unmute({ name: v.name }) : m.music_hubs_tracks_mute({ name: v.name })} onclick={() => toggleMelody(v)}>
            {#if v.muted}<VolumeOff class="size-5" aria-hidden="true" />{:else}<Volume class="size-5" aria-hidden="true" />{/if}
          </button>
          {@render fader(m.music_hubs_tracks_volume_of({ name: v.name }), v.volume ?? 1, (x) => session.updateVoice(v.id, (y) => ({ ...y, volume: x })))}
        </div>
        {#snippet melodyItems()}
          <Menu.Item disabled={!v.notes.length} onSelect={() => saveMelody(v)}>{m.music_hubs_tracks_save_melody()}</Menu.Item>
          <Menu.Separator />
          <Menu.Item
            variant="destructive"
            disabled={!v.notes.length}
            onSelect={(e) => twice(`clear:${v.id}`, e, () => {
              session.updateVoice(v.id, (x) => ({ ...x, notes: [] }));
              announce(m.music_hubs_tracks_cleared({ name: v.name }));
            })}
          >{confirming === `clear:${v.id}` ? m.music_hubs_tracks_clear_q({ what: notes(v.notes.length) }) : m.music_hubs_tracks_clear_notes()}</Menu.Item>
          <Menu.Item
            variant="destructive"
            onSelect={(e) => twice(`delete:${v.id}`, e, () => {
              session.deleteMelody(v.id);
              announce(m.music_hubs_tracks_deleted({ name: v.name }));
            })}
          >{confirming === `delete:${v.id}` ? m.music_hubs_tracks_delete_q({ name: v.name }) : m.music_hubs_tracks_delete_melody()}</Menu.Item>
        {/snippet}
        {@render menu(m.music_hubs_tracks_options_of({ name: v.name }), melodyItems)}
      </li>
    {/each}
  </ul>

  <div class="flex flex-wrap items-center gap-2">
    <button type="button" class="flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-instr-ink hover:bg-instr-wash" onclick={addMelody}><Plus class="size-4" aria-hidden="true" />{m.music_hubs_tracks_add_melody()}</button>
    <Picker class="w-auto" action label={m.music_hubs_tracks_add_progression()} placeholder={m.music_hubs_tracks_add_chords()} options={PROGRESSIONS.map((p) => ({ value: p.id, label: p.name }))} onchange={addChords} />
    <label class="flex items-center gap-1.5 text-sm">
      <span class="text-ws-soft">{m.music_hubs_tracks_in()}</span>
      <KeyPicker class="w-20" label={m.music_hubs_tracks_key_for_chords()} value={chordKey} name={(p) => KEYS[p]} onchange={(p) => (chordKey = p)} />
    </label>
    {#if session.beats.length || session.voices.length}
      <Picker
        class="w-auto"
        action
        label={m.music_hubs_tracks_add_library()}
        placeholder={m.music_hubs_tracks_add_library()}
        options={[
          ...session.beats.map((b) => ({ value: `beat:${b.id}`, label: `${b.name}, ${bars(barsOf(b))}`, group: m.music_hubs_tracks_beats_group() })),
          ...session.voices.map((sv) => ({ value: `melody:${sv.id}`, label: `${sv.name}, ${soundLabel(sv.sound)}, ${notes(sv.notes.length)}`, group: m.music_hubs_tracks_melodies_group() })),
        ]}
        onchange={fromLibrary}
      />
    {/if}
  </div>
</section>
