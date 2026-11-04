<script lang="ts">
  // The sample kit: four banks of sixteen pads (A-D, MIDI 36-99), one bank on
  // screen at a time, laid out like the MPC (pad 1 bottom-left). Every pad has
  // a native select for its sample; "Assign to pad" is the other path in.
  import { onMount } from "svelte";
  import Upload from "lucide-svelte/icons/upload";
  import Download from "lucide-svelte/icons/download";
  import FolderDown from "lucide-svelte/icons/folder-down";
  import Plus from "lucide-svelte/icons/plus";
  import Trash from "lucide-svelte/icons/trash-2";
  import ChevronRight from "lucide-svelte/icons/chevron-right";
  import { kitZip, kitZipName, type Bank } from "@repo/music-core/io/mpc-kit";
  import { audio, input } from "$lib/music/runtime";
  import { capturePointer } from "$lib/music/components/feedback.svelte";
  import { btn, btnPrimary } from "$lib/music/components/ui";
  import { BANK_IDS, BUILT_IN_DRUM, bankNotes, padLabel, sampleName } from "./kits";
  import { kits } from "./kitStore.svelte";
  import { canPickFolder, download, writeToFolder } from "./files";
  import Picker from "$lib/music/components/Picker.svelte";

  let { announce }: { announce: (msg: string) => void } = $props();

  let bank = $state<Bank>("A");
  let selected = $state(36);
  let assigning = $state<string | null>(null);
  let confirmDelete = $state<string | null>(null);
  let busy = $state(false);
  let fileInput: HTMLInputElement | undefined = $state();

  const kit = $derived(kits.kit);
  const notes = $derived(bankNotes(bank));
  // Rows top to bottom: pads 13-16, 9-12, 5-8, 1-4.
  const grid = $derived([12, 8, 4, 0].flatMap((r) => [0, 1, 2, 3].map((c) => notes[r + c])));
  const pad = (note: number) => kit?.pads.find((p) => p.note === note);
  // The computer key for a bank A pad (runtime pad map: Z X C V on pads 1 to 4, up to 1 2 3 4 on 13 to 16).
  const keyOf = (note: number) => (note >= 36 && note < 52 ? "ZXCVASDFQWER1234"[note - 36] : "");
  const selPad = $derived(pad(selected));
  const bankCount = (b: Bank) => bankNotes(b).filter((n) => pad(n)?.soft || pad(n)?.hard).length;

  onMount(() => {
    input.setKeyboardMode("pads");
    // Pads, the QWERTY pad keys and a real MPC all play the kit.
    const off = input.subscribe((e) => {
      // On-screen taps already sound through the input layer.
      if (e.kind === "noteon" && e.source !== "audio" && e.source !== "onscreen") audio.playKitPad(e.midi, e.velocity);
    });
    return () => {
      off();
      input.setKeyboardMode("off");
    };
  });

  const pointers = new Map<number, number>();
  function press(e: PointerEvent, note: number) {
    if (e.button > 0) return;
    selected = note;
    if (assigning) return assign(note);
    capturePointer(e);
    pointers.set(e.pointerId, note);
    void audio.unlock();
    input.tap(note, true);
  }
  function release(e: PointerEvent) {
    const note = pointers.get(e.pointerId);
    if (note === undefined) return;
    pointers.delete(e.pointerId);
    input.tap(note, false);
  }
  function key(e: KeyboardEvent, note: number, down: boolean) {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    if (!down) return void input.tap(note, false);
    if (e.repeat) return;
    selected = note;
    if (assigning) return assign(note);
    input.tap(note, true);
  }

  async function assign(note: number) {
    const id = assigning;
    assigning = null;
    if (!id || !kit) return;
    await kits.setPad(note, { soft: id });
    announce(`${sampleName(kit, id)} is on pad ${padLabel(note)}.`);
  }

  async function choose(note: number, layer: "soft" | "hard", id: string) {
    await kits.setPad(note, { [layer]: id || undefined });
    const name = id && kit ? sampleName(kit, id) : undefined;
    const which = `Pad ${padLabel(note)}${layer === "hard" ? " (hard hits)" : ""}`;
    announce(name ? `${which} plays ${name}.` : `${which} is empty.`);
  }

  async function onFiles(e: Event) {
    const el = e.currentTarget as HTMLInputElement;
    const files = [...(el.files ?? [])];
    el.value = "";
    if (!files.length) return;
    busy = true;
    try {
      const { placed, refused, pads } = await kits.import(files, notes[0]);
      if (pads.length) {
        const b = BANK_IDS.find((id) => bankNotes(id).includes(pads[0]));
        if (b) bank = b;
        selected = pads[0];
      }
      announce([placed.length ? `Added ${placed.join(", ")}.` : "", ...refused].filter(Boolean).join(" "));
    } finally {
      busy = false;
    }
  }

  async function exportKit(to: "zip" | "folder") {
    if (!kit) return;
    busy = true;
    try {
      const files = await kits.exportFiles();
      if (to === "folder") {
        const where = await writeToFolder(files);
        announce(`Wrote ${kit.name} (${files.length} files) into ${where}.`);
      } else {
        download(await kitZip(files, kit.name), kitZipName(kit.name), "application/zip");
        announce(`Downloading ${kitZipName(kit.name)}: the program and ${files.length - 1} samples.`);
      }
    } catch (e) {
      if ((e as DOMException).name !== "AbortError") announce(`Export failed: ${(e as Error).message}`);
    } finally {
      busy = false;
    }
  }

  async function newKit() {
    const k = await kits.create(`Kit ${kits.kits.length + 1}`);
    announce(`Made ${k.name}. Import samples to fill its pads.`);
  }

  async function deleteSample(id: string) {
    if (confirmDelete !== id) {
      confirmDelete = id;
      return;
    }
    confirmDelete = null;
    const name = kit && sampleName(kit, id);
    await kits.deleteSample(id);
    announce(`Deleted ${name}.`);
  }

  const kb = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
</script>

<section aria-labelledby="kit-title" class="flex flex-col gap-4">
  <!-- The pads lead; importing is one button beside their heading. -->
  <div class="flex flex-wrap items-center justify-between gap-3">
    <h2 id="kit-title" class="font-display text-2xl font-semibold tracking-tight">Pads</h2>
    {#if kit}
      <input bind:this={fileInput} type="file" multiple accept=".wav,.wave,.aif,.aiff,.flac,.mp3,.ogg,.oga,audio/*" class="sr-only" aria-label="Import samples" onchange={onFiles} />
      <button type="button" class={btnPrimary} disabled={busy} onclick={() => fileInput?.click()}>
        <Upload class="size-4" aria-hidden="true" />Import samples
      </button>
    {/if}
  </div>

  {#if kit}
    <div class="grid gap-4 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
      <div class="flex min-w-0 flex-col gap-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex rounded-full border border-ws-line bg-ws-surface p-1" role="group" aria-label="Pad bank">
            {#each BANK_IDS as b (b)}
              <button
                type="button"
                class="tnum min-h-10 min-w-11 rounded-full px-3 text-sm font-semibold {bank === b ? 'bg-ws-ink text-ws-bg' : 'text-ws-soft hover:text-ws-ink'}"
                aria-pressed={bank === b}
                aria-label="Bank {b}, {bankCount(b)} pads with samples"
                onclick={() => {
                  bank = b;
                  selected = bankNotes(b)[0];
                }}>{b}{#if bankCount(b)}<span class="ml-1 text-xs font-normal opacity-70">{bankCount(b)}</span>{/if}</button
              >
            {/each}
          </div>
          <div class="flex items-center gap-2 text-sm">
            <span class="text-ws-soft max-sm:sr-only">Kit</span>
            <Picker class="w-auto min-w-36" label="Kit" value={kit?.id} options={kits.kits.map((k) => ({ value: k.id, label: k.name }))} onchange={(id) => kits.select(id)} />
          </div>
        </div>
        <p class="text-sm text-ws-soft">Tap a pad to hear it{bank === "A" ? ", or press the letter shown on it." : ". The computer keys play bank A."}</p>

        {#if assigning}
          <p class="flex flex-wrap items-center gap-2 rounded-xl bg-instr-wash px-3 py-2 text-sm">
            <span class="min-w-0 flex-1">Pick a pad for <strong>{sampleName(kit, assigning)}</strong>.</span>
            <button type="button" class="min-h-11 rounded-lg px-3 font-medium underline underline-offset-4" onclick={() => (assigning = null)}>Cancel</button>
          </p>
        {/if}

        <div class="mpc grid grid-cols-4 gap-2 rounded-2xl p-2.5 sm:gap-2.5 sm:p-3" role="group" aria-label="Pads, bank {bank}">
          {#each grid as note (note)}
            {@const p = pad(note)}
            {@const name = sampleName(kit, p?.soft ?? p?.hard)}
            {@const held = input.held.has(note)}
            <div class="flex min-w-0 flex-col gap-1">
              <button
                type="button"
                class="pad"
                data-held={held || undefined}
                data-loaded={name ? "" : undefined}
                data-selected={selected === note || undefined}
                data-assigning={assigning ? "" : undefined}
                data-midi={note}
                aria-pressed={held}
                aria-label="Pad {padLabel(note)}, {name ?? `empty, plays the built-in ${BUILT_IN_DRUM[note] ?? 'drum'}`}{p?.hard && p.soft && p.hard !== p.soft ? ', two velocity layers' : ''}{p?.chokeGroup ? `, choke group ${p.chokeGroup}` : ''}{assigning ? ', assign here' : ''}"
                onpointerdown={(e) => press(e, note)}
                onpointerup={release}
                onpointercancel={release}
                onlostpointercapture={release}
                onkeydown={(e) => key(e, note, true)}
                onkeyup={(e) => key(e, note, false)}
              >
                <span class="led" aria-hidden="true"></span>
                <span class="truncate text-sm font-semibold">{name ?? (kits.broken.includes(note) ? "Missing file" : (BUILT_IN_DRUM[note] ?? "Synth"))}</span>
                <span class="flex items-start justify-between gap-1 text-xs opacity-80">
                  <span>{padLabel(note)}{#if !name}<span class="max-sm:hidden">, built in</span>{/if}</span>
                  {#if p?.chokeGroup}<span aria-hidden="true">M{p.chokeGroup}</span>{/if}
                  {#if keyOf(note)}<kbd class="rounded border border-current/40 px-1 font-sans font-semibold" aria-hidden="true">{keyOf(note)}</kbd>{/if}
                </span>
              </button>
              {#if kit.samples.length}<Picker class="min-h-11 rounded-md px-2 text-xs" tone="stage" label="Sample on pad {padLabel(note)}" value={p?.soft ?? ""} options={[{ value: "", label: "Empty" }, ...kit.samples.map((s) => ({ value: s.id, label: s.name }))]} onchange={(v) => choose(note, "soft", v)} />{/if}
            </div>
          {/each}
        </div>

        <div class="rounded-2xl border border-ws-line bg-ws-surface p-4" aria-labelledby="pad-edit-title">
          <h3 id="pad-edit-title" class="font-display text-lg font-semibold">Pad {padLabel(selected)} <span class="text-sm font-normal text-ws-soft">MIDI note {selected}</span></h3>
          <div class="mt-3 grid gap-3 sm:grid-cols-2">
            <div class="flex min-w-0 flex-col gap-1 text-sm">
              <span class="text-ws-soft">Soft hits, velocity 0 to 80</span>
              <Picker label="Soft hits, velocity 0 to 80" value={selPad?.soft ?? ""} options={[{ value: "", label: "None" }, ...kit.samples.map((s) => ({ value: s.id, label: s.name }))]} onchange={(v) => choose(selected, "soft", v)} />
            </div>
            <div class="flex min-w-0 flex-col gap-1 text-sm">
              <span class="text-ws-soft">Hard hits, velocity 81 to 127</span>
              <Picker label="Hard hits, velocity 81 to 127" value={selPad?.hard ?? ""} options={[{ value: "", label: "Same as soft" }, ...kit.samples.map((s) => ({ value: s.id, label: s.name }))]} onchange={(v) => choose(selected, "hard", v)} />
            </div>
            <div class="flex min-w-0 flex-col gap-1 text-sm">
              <span class="text-ws-soft">Choke group: pads in one group cut each other off</span>
              <Picker label="Choke group: pads in one group cut each other off" value={String(selPad?.chokeGroup ?? 0)} options={[{ value: "0", label: "None" }, ...Array.from({ length: 16 }, (_, i) => ({ value: String(i + 1), label: `Group ${i + 1}` }))]} onchange={(v) => kits.setPad(selected, { chokeGroup: Number(v) || undefined })} />
            </div>
            <div class="flex flex-wrap items-end gap-2">
              <button type="button" class={btn} onclick={async () => (await audio.unlock(), audio.playKitPad(selected, 0.4))}>Play soft</button>
              <button type="button" class={btn} onclick={async () => (await audio.unlock(), audio.playKitPad(selected, 1))}>Play hard</button>
            </div>
          </div>
        </div>
      </div>

      <div class="flex min-w-0 flex-col gap-4">
        <div>
          <h3 class="text-sm font-semibold">Samples <span class="tnum font-normal text-ws-soft">{kit.samples.length}</span></h3>
          {#if kit.samples.length}
            <ul class="mt-2 divide-y divide-ws-line rounded-2xl border border-ws-line bg-ws-surface">
              {#each kit.samples as s (s.id)}
                {@const on = kit.pads.filter((p) => p.soft === s.id || p.hard === s.id).map((p) => padLabel(p.note))}
                <li class="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                  <input
                    class="min-h-11 min-w-0 flex-1 basis-40 rounded-lg border border-transparent bg-transparent px-2 font-medium hover:border-ws-line focus:border-ws-line"
                    value={s.name}
                    aria-label="Name of {s.fileName}"
                    onchange={(e) => kits.renameSample(s.id, e.currentTarget.value)}
                  />
                  <span class="text-xs text-ws-soft">{on.length ? `On ${on.join(", ")}` : "Not on a pad"}, {kb(s.size)}</span>
                  <div class="flex items-center gap-1">
                    <button type="button" class="min-h-11 rounded-lg px-3 text-sm font-medium text-instr-ink hover:bg-instr-wash" aria-pressed={assigning === s.id} onclick={() => (assigning = assigning === s.id ? null : s.id)}>Assign to pad</button>
                    <button
                      type="button"
                      class="flex min-h-11 items-center gap-1 rounded-lg px-3 text-sm {confirmDelete === s.id ? 'bg-destructive font-semibold text-white' : 'text-ws-soft hover:bg-ws-raised'}"
                      aria-label={confirmDelete === s.id ? `Confirm: delete ${s.name}` : `Delete ${s.name}`}
                      onclick={() => deleteSample(s.id)}
                      onblur={() => confirmDelete === s.id && (confirmDelete = null)}
                    >
                      <Trash class="size-4" aria-hidden="true" />{confirmDelete === s.id ? "Delete?" : ""}
                    </button>
                  </div>
                </li>
              {/each}
            </ul>
          {:else}
            <p class="mt-2 rounded-2xl border border-dashed border-ws-line p-4 text-sm text-ws-soft">No samples yet. Until a pad has one, the beat plays the built-in drums.</p>
          {/if}
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <label class="flex min-w-0 items-center gap-2 text-sm">
            <span class="text-ws-soft">Kit name</span>
            <input class="min-h-11 w-40 min-w-0 rounded-lg border border-ws-line bg-ws-surface px-3" value={kit.name} onchange={(e) => kits.rename(e.currentTarget.value)} />
          </label>
          <button type="button" class={btn} onclick={newKit}><Plus class="size-4" aria-hidden="true" />New kit</button>
        </div>

        <details class="group rounded-2xl bg-ws-raised/60 p-4">
          <summary class="flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm font-semibold [&::-webkit-details-marker]:hidden">
            <ChevronRight class="size-4 transition-transform group-open:rotate-90" aria-hidden="true" />How file names map
          </summary>
          <p class="mt-1 max-w-prose text-sm text-ws-soft">
            Import WAV, AIFF, FLAC, MP3 or OGG. A file called "Kick_01" or "HiHat Open" lands on the matching pad by itself; anything else takes the next free pad of the bank on screen. Empty pads play the built-in drum named on them. Kits stay in this browser.
          </p>
        </details>

        <details class="group rounded-2xl bg-ws-raised/60 p-4">
          <summary class="flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm font-semibold [&::-webkit-details-marker]:hidden">
            <ChevronRight class="size-4 transition-transform group-open:rotate-90" aria-hidden="true" />Advanced: send the kit to an MPC
          </summary>
          <p class="mt-1 max-w-prose text-sm text-ws-soft">
            Saves a drum program file (.xpm) and a Samples folder, named after the kit. Copy the folder to the MPC's SD card or drive and load the program. This export has not yet been checked on a real MPC One+.
          </p>
          <div class="mt-3 flex flex-wrap gap-2">
            <button type="button" class={btn} disabled={busy} onclick={() => exportKit("zip")}><Download class="size-4" aria-hidden="true" />Download ZIP</button>
            {#if canPickFolder()}
              <button type="button" class={btn} disabled={busy} onclick={() => exportKit("folder")}><FolderDown class="size-4" aria-hidden="true" />Write to a folder</button>
            {/if}
          </div>
        </details>
      </div>
    </div>
  {/if}
</section>

<style>
  .mpc {
    background: linear-gradient(#26232b, #17151a);
    box-shadow:
      inset 0 1px 0 #ffffff14,
      0 6px 18px #0005;
  }
  .pad {
    position: relative;
    aspect-ratio: 1;
    min-height: 3.25rem;
    border-radius: 0.55rem;
    padding: 0.35rem 0.4rem;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    text-align: left;
    color: #d9d4df;
    background: radial-gradient(120% 120% at 30% 20%, #4a4652, #2c2a31 60%, #232128);
    box-shadow:
      inset 0 -3px 0 #0006,
      inset 0 1px 0 #ffffff1a,
      0 2px 0 #000;
    transition: transform 50ms;
    overflow: hidden;
    -webkit-tap-highlight-color: transparent;
  }
  .pad:focus-visible {
    outline: 2px solid var(--instr);
    outline-offset: 2px;
  }
  .led {
    position: absolute;
    inset: auto 14% 5% 14%;
    height: 3px;
    border-radius: 3px;
    background: #ffffff10;
  }
  .pad[data-loaded] .led {
    background: color-mix(in oklch, var(--instr) 45%, transparent);
  }
  .pad[data-selected] {
    box-shadow:
      inset 0 0 0 2px #fff9,
      inset 0 -3px 0 #0006,
      0 2px 0 #000;
  }
  .pad[data-assigning] {
    outline: 2px dashed color-mix(in oklch, var(--instr) 70%, transparent);
    outline-offset: -4px;
  }
  .pad[data-held] {
    transform: translateY(2px) scale(0.98);
    background: radial-gradient(120% 120% at 50% 40%, color-mix(in oklch, var(--instr) 75%, white), var(--instr) 55%, color-mix(in oklch, var(--instr) 60%, black));
    color: #140a10;
  }
  .pad[data-held] .led {
    background: white;
  }
  .pad-select:focus-visible {
    outline: 2px solid var(--instr);
    outline-offset: 1px;
  }
</style>
