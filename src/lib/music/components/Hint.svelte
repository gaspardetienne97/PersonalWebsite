<script lang="ts">
  import { m } from "@repo/i18n/messages.js";
  // An explanation that stays out of the page's flow: an info button beside a
  // label, with the text in a tooltip on hover, focus or tap. Screen readers get
  // the text as the button's description, so nothing is hidden from them.
  import * as Tooltip from "@repo/ui/tooltip";
  import Info from "@lucide/svelte/icons/info";

  let { text, about }: { text: string; about: string } = $props();
  let open = $state(false);
  const id = `hint-${Math.random().toString(36).slice(2, 8)}`;
</script>

<Tooltip.Provider delayDuration={150}>
  <Tooltip.Root bind:open disableCloseOnTriggerClick>
    <Tooltip.Trigger>
      {#snippet child({ props })}
        <button
          {...props}
          type="button"
          class="-my-2 inline-grid size-11 shrink-0 place-items-center rounded-full align-middle text-ws-soft hover:text-ws-ink"
          aria-label={m.music_shell_hint_about({ about })}
          aria-describedby={id}
          onclick={() => (open = !open)}
        >
          <span class="grid size-6 place-items-center rounded-full hover:bg-ws-raised"><Info class="size-4" aria-hidden="true" /></span>
        </button>
      {/snippet}
    </Tooltip.Trigger>
    <Tooltip.Content class="max-w-72 text-sm leading-snug">{text}</Tooltip.Content>
  </Tooltip.Root>
</Tooltip.Provider>
<span {id} class="sr-only">{text}</span>
