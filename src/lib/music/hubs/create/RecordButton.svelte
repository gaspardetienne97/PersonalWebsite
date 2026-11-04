<script lang="ts">
  // The one big control on Record: a round button that reads Record or Stop.
  let { recording, disabled = false, onclick }: { recording: boolean; disabled?: boolean; onclick: () => void } = $props();
</script>

<button
  type="button"
  class="rec relative grid size-20 shrink-0 place-items-center rounded-full disabled:opacity-40 sm:size-28"
  class:on={recording}
  aria-pressed={recording}
  {disabled}
  {onclick}
>
  <span class="mark" aria-hidden="true"></span>
  <span class="absolute -bottom-6 text-sm font-semibold text-ws-stage-ink">{recording ? "Stop" : "Record"}</span>
</button>

<style>
  .rec {
    margin-bottom: 1.25rem;
    background: radial-gradient(circle at 35% 30%, #ffffff26, transparent 60%), color-mix(in oklch, var(--ws-stage-ink) 12%, var(--ws-stage));
    box-shadow:
      inset 0 0 0 3px color-mix(in oklch, var(--ws-stage-ink) 30%, transparent),
      0 6px 20px #0006;
  }
  .mark {
    width: 44%;
    height: 44%;
    border-radius: 999px;
    background: var(--destructive);
    box-shadow: 0 0 0 4px #0003;
    transition:
      border-radius 150ms,
      width 150ms,
      height 150ms;
  }
  .rec.on {
    box-shadow:
      inset 0 0 0 3px var(--destructive),
      0 0 28px color-mix(in oklch, var(--destructive) 50%, transparent);
    animation: ws-pulse 1.4s ease-in-out infinite;
  }
  .rec.on .mark {
    width: 34%;
    height: 34%;
    border-radius: 0.3rem;
  }
  @keyframes ws-pulse {
    50% {
      box-shadow:
        inset 0 0 0 3px var(--destructive),
        0 0 8px color-mix(in oklch, var(--destructive) 30%, transparent);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .rec.on {
      animation: none;
    }
  }
</style>
