<script lang="ts">
  import { m } from "@repo/i18n/messages.js";
  import Drum from "@lucide/svelte/icons/drum";
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  // The MPC diagnostic that made the link debuggable (hardware notes 1): pick
  // the output, link it (the app shell keeps the heartbeat on every page),
  // prove the output with one lit pad, read pad order off a rainbow, and see
  // the last frames both ways plus the blocker in words.
  import { pickMpcOutput } from "@repo/music-core/io/devices";
  import { PAD_COLORS } from "@repo/music-core/io/mpc-sysex";
  import { btn, btnPrimary } from "#lib/music/components/ui.ts";
  import { midi } from "#lib/music/runtime/index.ts";
  import Picker from "#lib/music/components/Picker.svelte";

  let { announce }: { announce: (text: string) => void } = $props();

  let chosen = $state<string | null>(null);
  const linkedId = $derived(midi.profiles.find((p) => p.controllerLink)?.id);
  const outputId = $derived(chosen ?? linkedId ?? pickMpcOutput(midi.outputs)?.id ?? "");
  const outName = (id?: string) => midi.outputs.find((o) => o.id === id)?.name ?? id ?? m.music_hubs_mpc_none();
  const link = $derived(midi.mpcLink);
  const ready = $derived(midi.enabled && !!outputId);

  const stateLine = $derived(
    !midi.supported
      ? m.music_hubs_mpc_no_webmidi()
      : !midi.enabled
        ? m.music_hubs_mpc_midi_off()
        : !midi.sysexEnabled
          ? m.music_hubs_mpc_no_sysex()
          : link.state === "no-output"
            ? m.music_hubs_mpc_no_output({ name: outName(link.outputId) })
            : link.state === "linked"
              ? m.music_hubs_mpc_linked({ name: outName(link.outputId) })
              : m.music_hubs_mpc_not_linked(),
  );

  function report(ok: boolean, what: string) {
    announce(
      ok
        ? m.music_hubs_mpc_sent({ what, name: outName(outputId) })
        : !midi.sysexEnabled
          ? m.music_hubs_mpc_not_sent_sysex({ what })
          : m.music_hubs_mpc_not_sent_output({ what }),
    );
  }
</script>

<section class="flex flex-col gap-4 rounded-2xl border border-ws-line bg-ws-surface p-4 sm:p-5" aria-labelledby="mpc-title">
  <div>
    <h2 id="mpc-title" class="flex items-center gap-2.5 font-display text-xl font-semibold">
      <span class="grid size-9 shrink-0 place-items-center rounded-xl text-ws-stage" style:background="var(--hue-mpc)" aria-hidden="true"><Drum class="size-5" /></span>
      {m.music_hubs_mpc_title()}
    </h2>
    <p class="text-sm text-ws-soft">{m.music_hubs_mpc_intro()}</p>
  </div>

  <p class="rounded-xl px-3 py-2 text-sm font-medium {link.state === 'linked' ? 'bg-success/12' : 'bg-warn/15'}" data-testid="mpc-state">
    <span aria-hidden="true">{link.state === "linked" ? "✓" : "!"}</span>
    {stateLine}
  </p>

  <div class="flex max-w-md flex-col gap-1 text-sm">
    <span class="font-medium">{m.music_hubs_mpc_output()}</span>
    <Picker label={m.music_hubs_mpc_output()} value={outputId ?? ""} placeholder={midi.enabled ? m.music_hubs_mpc_no_outputs() : m.music_hubs_mpc_no_outputs_off()} disabled={!midi.outputs.length} options={midi.outputs.map((o) => ({ value: o.id, label: `${o.name}${o.manufacturer ? `, ${o.manufacturer}` : ""}` }))} onchange={(v) => (chosen = v)} />
  </div>

  <div class="flex flex-wrap gap-2">
    <button
      type="button"
      class={btnPrimary}
      disabled={!ready}
      onclick={async () => {
        await midi.linkMpc(outputId);
        announce(midi.mpcLink.state === "linked" ? m.music_hubs_mpc_linked_status({ name: outName(outputId) }) : m.music_hubs_mpc_link_pending({ state: stateLine }));
      }}>{m.music_hubs_mpc_keep_linked()}</button
    >
    <button
      type="button"
      class={btn}
      disabled={!linkedId}
      onclick={async () => {
        await midi.unlinkMpc();
        announce(m.music_hubs_mpc_unlinked());
      }}>{m.music_hubs_mpc_unlink()}</button
    >
    <button type="button" class={btn} disabled={!ready} onclick={() => report(midi.lightPad(0, PAD_COLORS.fire, outputId), m.music_hubs_mpc_pad_red())}>{m.music_hubs_mpc_light_pad()}</button>
    <button type="button" class={btn} disabled={!ready} onclick={() => report(midi.rainbow(outputId), m.music_hubs_mpc_rainbow())}>{m.music_hubs_mpc_test_rainbow()}</button>
    <button type="button" class={btn} disabled={!ready} onclick={() => report(midi.allOff(outputId), m.music_hubs_mpc_all_off())}>{m.music_hubs_mpc_all_off()}</button>
  </div>
  <p class="text-sm text-ws-soft">
    {m.music_hubs_mpc_rainbow_hint()}
  </p>

  <details class="group text-sm">
    <summary class="flex min-h-11 cursor-pointer list-none items-center gap-2 font-medium [&::-webkit-details-marker]:hidden">
      <ChevronRight class="size-4 transition-transform group-open:rotate-90" aria-hidden="true" />{m.music_hubs_mpc_advanced()}
    </summary>
  <dl class="mt-1 grid gap-3 sm:grid-cols-2">
    <div class="min-w-0">
      <dt class="text-ws-soft">{m.music_hubs_mpc_last_sent()}</dt>
      <dd class="mt-1 rounded-lg bg-ws-raised px-3 py-2 font-mono text-[13px] break-all" data-testid="mpc-out">{midi.lastOutboundFrame || m.music_hubs_mpc_nothing_yet()}</dd>
    </div>
    <div class="min-w-0">
      <dt class="text-ws-soft">{m.music_hubs_mpc_last_reply()}</dt>
      <dd class="mt-1 rounded-lg bg-ws-raised px-3 py-2 font-mono text-[13px] break-all">{midi.lastInboundSysex || m.music_hubs_mpc_no_answer()}</dd>
    </div>
  </dl>
  </details>
  <a href="/music/pads" class="self-start font-medium text-instr-ink underline underline-offset-4">{m.music_hubs_mpc_try_pads()}</a>
</section>
