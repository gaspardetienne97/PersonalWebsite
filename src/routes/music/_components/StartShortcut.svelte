<script lang="ts">
  // Space starts (or restarts) the drill — the last mouse dependency in the
  // practice loop after QWERTY notes (U3) and R/− summary shortcuts (U5).
  // The page's start handler keeps its own !ready/pending/active guards; this
  // only adds the key binding plus the usual input-safety checks. Space is
  // not in the QWERTY-piano map, so playing notes never starts a run.
  let {
    onStart,
    enabled = true,
  }: {
    onStart: () => void;
    /** Gate for pages where a mid-run Space would reset the attempt. */
    enabled?: boolean;
  } = $props();

  function onWindowKeydown(event: KeyboardEvent): void {
    if (!enabled || event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key !== " ") return;
    const target = event.target;
    if (
      target instanceof HTMLElement &&
      (target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        // A focused button/link already activates on Space — don't double-fire.
        target instanceof HTMLButtonElement ||
        target instanceof HTMLAnchorElement ||
        target.isContentEditable)
    ) {
      return;
    }
    event.preventDefault();
    onStart();
  }
</script>

<svelte:window onkeydown={onWindowKeydown} />

<span class="hidden text-xs text-muted-foreground sm:inline" data-testid="start-shortcut-hint">
  <kbd class="rounded border bg-muted px-1 font-mono">Space</kbd> to start
</span>
