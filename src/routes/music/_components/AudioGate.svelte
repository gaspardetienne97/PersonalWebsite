<script lang="ts">
  import Volume2 from "lucide-svelte/icons/volume-2";

  import { Button } from "@repo/ui/button";

  import type { MusicRuntime } from "../_runtime.svelte";

  let { runtime }: { runtime: MusicRuntime } = $props();
</script>

<section
  aria-label="Audio controls"
  class="sticky top-12 z-20 flex items-center justify-between gap-4 border-b bg-background px-4 py-3 md:px-6"
>
  <div class="flex min-w-0 items-center gap-3">
    <Volume2 class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    <p class="truncate text-sm text-muted-foreground" aria-live="polite">
      {runtime.audioMessage}
    </p>
  </div>
  <Button
    type="button"
    size="sm"
    disabled={runtime.audioEnabled || runtime.audioPending}
    onclick={() => runtime.enableAudio()}
  >
    {runtime.audioEnabled ? "Audio enabled" : runtime.audioPending ? "Enabling audio" : "Enable audio"}
  </Button>
</section>
