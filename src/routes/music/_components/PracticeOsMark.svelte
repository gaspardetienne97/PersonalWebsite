<script lang="ts">
  // The Practice OS mark: three level bars in the active instrument's hue.
  // Decorative; the wordmark next to it carries the name.
  let { class: cls = "" }: { class?: string } = $props();
</script>

<span class="inline-flex h-4 items-end gap-0.5 {cls}" aria-hidden="true" data-testid="practice-os-mark">
  <span class="w-1 rounded-[2px] bg-instr" style="height: 56%"></span>
  <span class="w-1 rounded-[2px] bg-instr" style="height: 100%"></span>
  <span class="w-1 rounded-[2px] bg-instr" style="height: 75%"></span>
</span>
