<script lang="ts">
  // The song's tracks: the beat and each melody, one row each to play it
  // alone, name it, pick what it sounds like, mute it, and a menu.
  import Play from "lucide-svelte/icons/play";
  import Square from "lucide-svelte/icons/square";
  import Plus from "lucide-svelte/icons/plus";
  import Dots from "lucide-svelte/icons/ellipsis";
  import Volume from "lucide-svelte/icons/volume-2";
  import VolumeOff from "lucide-svelte/icons/volume-off";
  import type { Snippet } from "svelte";
  import { goto } from "$app/navigation";
  import * as Menu from "@repo/ui/dropdown-menu";
  import { audio } from "$lib/music/runtime";
  import { kits } from "./kitStore.svelte";
  import { session, type TrackId } from "./session.svelte";
  import { barsOf, hitCount } from "./pattern";
  import { chordsIn, KEYS, progressionVoice, PROGRESSIONS } from "./progressions";
  import { ROLL_SOUNDS, soundOf, trackColour, type RollVoice } from "./roll";

  let { announce }: { announce: (msg: string) => void } = $props();

  /** The destructive menu item waiting for its second tap. */
  let confirming = $state("");

  const count = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;
  const soundLabel = (s: RollVoice["sound"]) => ROLL_SOUNDS.find((x) => x.value === s)?.label ?? "Piano";

  async function solo(id: TrackId, name: string) {
    const was = session.playing && session.only === id;
    const ok = await session.play(id);
    if (!ok) return announce("Sound is blocked. Tap Enable sound in the strip above, then play again.");
    announce(was ? "Stopped." : `Playing ${name} on its own. Play all brings the rest back.`);
  }

  function setSound(v: RollVoice, sound: string) {
    session.updateVoice(v.id, (x) => ({ ...x, sound: sound as RollVoice["sound"] }));
    void audio.unlock().then(() => audio.playNote(60, 0.5, 0.8, sound as RollVoice["sound"]));
    announce(`${v.name} plays ${soundLabel(sound as RollVoice["sound"])}.`);
  }

  function toggleBeat() {
    session.beatMuted = !session.beatMuted;
    announce(session.beatMuted ? "Beat muted; the melodies keep playing." : "Beat on.");
  }
  function toggleMelody(v: RollVoice) {
    session.updateVoice(v.id, (x) => ({ ...x, muted: !x.muted }));
    announce(`${v.name} ${v.muted ? "on" : "muted"}.`);
  }

  async function pickKit(id: string) {
    await kits.select(id);
    announce(`The beat plays ${kits.kit?.name}.`);
  }

  function addMelody() {
    const v = session.addMelody();
    announce(`Added ${v.name}. Draw its notes in the editor below.`);
  }

  let chordKey = $state(0);
  function addChords(id: string) {
    const p = PROGRESSIONS.find((x) => x.id === id);
    if (!p) return;
    const bars = session.bars;
    const v = progressionVoice(p, chordKey, crypto.randomUUID());
    session.addMelodyFrom(v);
    announce(`Added ${v.name}: ${chordsIn(p, chordKey).join(", ")}, one chord a bar on E-Piano.${session.bars > bars ? ` The song grew to ${session.bars} bars.` : ""}`);
  }

  function fromLibrary(value: string) {
    const [kind, id] = value.split(":");
    if (kind === "beat") {
      const b = session.useBeat(id);
      if (b) announce(`The beat is now ${b.name}, ${count(hitCount(b), "hit")}.`);
    } else {
      const v = session.useMelody(id);
      if (v) announce(`Added ${v.name} as a new melody.`);
    }
  }

  async function saveBeat() {
    const b = await session.saveBeat();
    announce(`Saved the beat ${b.name} to the library. Add it to any song from Add from library.`);
  }
  async function saveMelody(v: RollVoice) {
    if (!v.notes.length) return announce(`${v.name} has no notes yet.`);
    await session.saveMelody(v);
    announce(`Saved ${v.name} to the library. Add it to any song from Add from library.`);
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

  const row = "grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-x-2 gap-y-1 rounded-2xl border border-ws-line bg-ws-surface p-2 sm:grid-cols-[auto_minmax(0,1fr)_11rem_auto_auto]";
  const name = "min-h-9 w-full min-w-0 rounded-md border border-transparent bg-transparent px-1.5 font-semibold hover:border-ws-line focus:border-ws-line";
  const soloing = (id: TrackId) => session.playing && session.only === id;
  const field = "min-h-11 min-w-0 rounded-lg border border-ws-line bg-ws-surface px-2 text-sm";
  const icon = "grid size-11 shrink-0 place-items-center rounded-full text-ws-soft hover:bg-ws-raised hover:text-ws-ink";
</script>

{#snippet menu(label: string, items: Snippet)}
  <Menu.Root onOpenChange={(open) => !open && (confirming = "")}>
    <Menu.Trigger class={icon} aria-label={label}><Dots class="size-5" aria-hidden="true" /></Menu.Trigger>
    <Menu.Content align="end" class="w-56">{@render items()}</Menu.Content>
  </Menu.Root>
{/snippet}

{#snippet playButton(id: TrackId, label: string, colour: string)}
  <button
    type="button"
    class="grid size-11 shrink-0 place-items-center rounded-full text-white shadow-sm hover:brightness-110"
    style:background={colour}
    aria-pressed={soloing(id)}
    aria-label="{soloing(id) ? 'Stop' : 'Play'} {label} alone"
    onclick={() => solo(id, label)}
  >
    {#if soloing(id)}<Square class="size-4 fill-current" aria-hidden="true" />{:else}<Play class="size-4 fill-current" aria-hidden="true" />{/if}
  </button>
{/snippet}

<section class="flex flex-col gap-2" aria-labelledby="tracks-h">
  <h2 id="tracks-h" class="font-display text-lg font-semibold">Tracks</h2>
  <ul class="flex flex-col gap-2">
    <li class={row} class:opacity-70={session.beatMuted}>
      {@render playButton("beat", session.pattern.name, "var(--instr)")}
      <div class="flex min-w-0 flex-col">
        <input class={name} aria-label="Beat name" value={session.pattern.name} onchange={(e) => session.setPattern({ ...session.pattern, name: e.currentTarget.value || session.pattern.name })} />
        <span class="px-1.5 text-xs text-ws-soft">Beat, {count(hitCount(session.pattern), "hit")} over {count(barsOf(session.pattern), "bar")}{session.beatMuted ? ", muted" : ""}</span>
      </div>
      <select class="{field} order-last col-span-4 sm:order-none sm:col-span-1" aria-label="Beat kit" value={kits.kit?.id} onchange={(e) => pickKit(e.currentTarget.value)}>
        {#each kits.kits as k (k.id)}<option value={k.id}>{k.name}</option>{/each}
      </select>
      <button type="button" class={icon} aria-pressed={session.beatMuted} aria-label="{session.beatMuted ? 'Unmute' : 'Mute'} the beat" onclick={toggleBeat}>
        {#if session.beatMuted}<VolumeOff class="size-5" aria-hidden="true" />{:else}<Volume class="size-5" aria-hidden="true" />{/if}
      </button>
      {#snippet beatItems()}
        <Menu.Item onSelect={saveBeat}>Save beat to library</Menu.Item>
        <Menu.Item onSelect={() => goto("/music/create/kits")}>Edit sample kits</Menu.Item>
        <Menu.Separator />
        <Menu.Item
          variant="destructive"
          disabled={!hitCount(session.pattern)}
          onSelect={(e) => twice("beat", e, () => {
            session.setPattern({ ...session.pattern, steps: {} });
            announce("Cleared the beat.");
          })}
        >{confirming === "beat" ? `Clear ${count(hitCount(session.pattern), "hit")}?` : "Clear beat"}</Menu.Item>
      {/snippet}
      {@render menu("Beat options", beatItems)}
    </li>

    {#each session.doc.voices as v, i (v.id)}
      <li class={row} class:opacity-70={v.muted}>
        {@render playButton(v.id, v.name, trackColour(i))}
        <div class="flex min-w-0 flex-col">
          <input class={name} aria-label="Name of {v.name}" value={v.name} onfocus={() => (session.selected = v.id)} onchange={(e) => session.updateVoice(v.id, (x) => ({ ...x, name: e.currentTarget.value || x.name }))} />
          <span class="px-1.5 text-xs text-ws-soft">Melody, {count(v.notes.length, "note")}{v.muted ? ", muted" : ""}</span>
        </div>
        <select class="{field} order-last col-span-4 sm:order-none sm:col-span-1" aria-label="{v.name} instrument" value={soundOf(v)} onchange={(e) => setSound(v, e.currentTarget.value)}>
          {#each ROLL_SOUNDS as o (o.value)}<option value={o.value}>{o.label}</option>{/each}
        </select>
        <button type="button" class={icon} aria-pressed={!!v.muted} aria-label="{v.muted ? 'Unmute' : 'Mute'} {v.name}" onclick={() => toggleMelody(v)}>
          {#if v.muted}<VolumeOff class="size-5" aria-hidden="true" />{:else}<Volume class="size-5" aria-hidden="true" />{/if}
        </button>
        {#snippet melodyItems()}
          <Menu.Item disabled={!v.notes.length} onSelect={() => saveMelody(v)}>Save melody to library</Menu.Item>
          <Menu.Separator />
          <Menu.Item
            variant="destructive"
            disabled={!v.notes.length}
            onSelect={(e) => twice(`clear:${v.id}`, e, () => {
              session.updateVoice(v.id, (x) => ({ ...x, notes: [] }));
              announce(`Cleared ${v.name}.`);
            })}
          >{confirming === `clear:${v.id}` ? `Clear ${count(v.notes.length, "note")}?` : "Clear notes"}</Menu.Item>
          <Menu.Item
            variant="destructive"
            onSelect={(e) => twice(`delete:${v.id}`, e, () => {
              session.deleteMelody(v.id);
              announce(`Deleted ${v.name}.`);
            })}
          >{confirming === `delete:${v.id}` ? `Delete ${v.name}?` : "Delete melody"}</Menu.Item>
        {/snippet}
        {@render menu(`${v.name} options`, melodyItems)}
      </li>
    {/each}
  </ul>

  <div class="flex flex-wrap items-center gap-2">
    <button type="button" class="flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-instr-ink hover:bg-instr-wash" onclick={addMelody}><Plus class="size-4" aria-hidden="true" />Add melody</button>
    <select class={field} aria-label="Add a chord progression" value="" onchange={(e) => { addChords(e.currentTarget.value); e.currentTarget.value = ""; }}>
      <option value="" disabled>Add chords</option>
      {#each PROGRESSIONS as p (p.id)}<option value={p.id}>{p.name}</option>{/each}
    </select>
    <label class="flex items-center gap-1.5 text-sm">
      <span class="text-ws-soft">in</span>
      <select class="{field} w-20" aria-label="Key for the chords" bind:value={chordKey}>
        {#each KEYS as k, i (k)}<option value={i}>{k}</option>{/each}
      </select>
    </label>
    {#if session.beats.length || session.voices.length}
      <select class={field} aria-label="Add from library" value="" onchange={(e) => { fromLibrary(e.currentTarget.value); e.currentTarget.value = ""; }}>
        <option value="" disabled>Add from library</option>
        {#if session.beats.length}
          <optgroup label="Beats (replaces this song's beat)">
            {#each session.beats as b (b.id)}<option value="beat:{b.id}">{b.name}, {count(barsOf(b), "bar")}</option>{/each}
          </optgroup>
        {/if}
        {#if session.voices.length}
          <optgroup label="Melodies">
            {#each session.voices as sv (sv.id)}<option value="melody:{sv.id}">{sv.name}, {soundLabel(sv.sound)}, {count(sv.notes.length, "note")}</option>{/each}
          </optgroup>
        {/if}
      </select>
    {/if}
  </div>
</section>
