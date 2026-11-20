<script lang="ts">
  import Drum from "@lucide/svelte/icons/drum";
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
  const outName = (id?: string) => midi.outputs.find((o) => o.id === id)?.name ?? id ?? "none";
  const link = $derived(midi.mpcLink);
  const ready = $derived(midi.enabled && !!outputId);

  const stateLine = $derived(
    !midi.supported
      ? "Blocked: this browser has no Web MIDI."
      : !midi.enabled
        ? "Blocked: MIDI is off. Enable it above."
        : !midi.sysexEnabled
          ? "Blocked: SysEx was not granted, so every frame to the MPC is refused. Turn MIDI off and on again and allow SysEx."
          : link.state === "no-output"
            ? `Blocked: the linked output (${outName(link.outputId)}) is not connected.`
            : link.state === "linked"
              ? `Linked and holding: init sent, heartbeat every second on ${outName(link.outputId)}, on every page until you unlink.`
              : "Not linked: the MPC only sends pad notes while a host keeps talking to it. Press Keep linked.",
  );

  function report(ok: boolean, what: string) {
    announce(ok ? `${what} sent to ${outName(outputId)}.` : `${what} was not sent: ${!midi.sysexEnabled ? "SysEx is not granted" : "no output"}.`);
  }
</script>

<section class="flex flex-col gap-4 rounded-2xl border border-ws-line bg-ws-surface p-4 sm:p-5" aria-labelledby="mpc-title">
  <div>
    <h2 id="mpc-title" class="flex items-center gap-2.5 font-display text-xl font-semibold">
      <span class="grid size-9 shrink-0 place-items-center rounded-xl text-[oklch(0.2_0.04_288)]" style:background="var(--hue-mpc)" aria-hidden="true"><Drum class="size-5" /></span>
      MPC hardware
    </h2>
    <p class="text-sm text-ws-soft">Nothing here runs by itself: every frame is sent by a button.</p>
  </div>

  <p class="rounded-xl px-3 py-2 text-sm font-medium {link.state === 'linked' ? 'bg-success/12' : 'bg-warn/15'}" data-testid="mpc-state">
    <span aria-hidden="true">{link.state === "linked" ? "✓" : "!"}</span>
    {stateLine}
  </p>

  <div class="flex max-w-md flex-col gap-1 text-sm">
    <span class="font-medium">Output (Private carries the pad lights)</span>
    <Picker label="Output (Private carries the pad lights)" value={outputId ?? ""} placeholder="No outputs{midi.enabled ? '' : ' (MIDI is off)'}" disabled={!midi.outputs.length} options={midi.outputs.map((o) => ({ value: o.id, label: `${o.name}${o.manufacturer ? `, ${o.manufacturer}` : ""}` }))} onchange={(v) => (chosen = v)} />
  </div>

  <div class="flex flex-wrap gap-2">
    <button
      type="button"
      class={btnPrimary}
      disabled={!ready}
      onclick={async () => {
        await midi.linkMpc(outputId);
        announce(midi.mpcLink.state === "linked" ? `Linked ${outName(outputId)}: handshake sent, heartbeat running.` : `Saved the link, but it cannot run yet: ${stateLine}`);
      }}>Keep linked (init + heartbeat)</button
    >
    <button
      type="button"
      class={btn}
      disabled={!linkedId}
      onclick={async () => {
        await midi.unlinkMpc();
        announce("Unlinked: pads switched off and the heartbeat stopped. The MPC will stop sending pad notes.");
      }}>Unlink</button
    >
    <button type="button" class={btn} disabled={!ready} onclick={() => report(midi.lightPad(0, PAD_COLORS.fire, outputId), "Pad 1 red")}>Light pad 1 red</button>
    <button type="button" class={btn} disabled={!ready} onclick={() => report(midi.rainbow(outputId), "Rainbow")}>Test rainbow</button>
    <button type="button" class={btn} disabled={!ready} onclick={() => report(midi.allOff(outputId), "All off")}>All off</button>
  </div>
  <p class="text-sm text-ws-soft">
    Pad 1 lit means this is the right output. The rainbow runs red to violet from pad index 0, so you can read the order off the unit.
  </p>

  <dl class="grid gap-3 text-sm sm:grid-cols-2">
    <div class="min-w-0">
      <dt class="text-ws-soft">Last frame sent</dt>
      <dd class="mt-1 rounded-lg bg-ws-raised px-3 py-2 font-mono text-xs break-all" data-testid="mpc-out">{midi.lastOutboundFrame || "nothing yet"}</dd>
    </div>
    <div class="min-w-0">
      <dt class="text-ws-soft">Last SysEx received</dt>
      <dd class="mt-1 rounded-lg bg-ws-raised px-3 py-2 font-mono text-xs break-all">{midi.lastInboundSysex || "nothing yet: the device has not answered"}</dd>
    </div>
  </dl>
  <a href="/music/pads" class="self-start font-medium text-instr-ink underline underline-offset-4">Try the pads drill</a>
</section>
