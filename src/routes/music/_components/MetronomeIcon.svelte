<script lang="ts">
  let { class: cls = "size-4" }: { class?: string } = $props();
</script>

<svg
  class={cls}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="1.8"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  <!-- body -->
  <path d="M8.5 21h7l-2.2-17h-2.6z" />
  <!-- base -->
  <path d="M7.5 21h9" />
  <!-- scale line -->
  <path d="M9.6 15.5h4.8" />
  <!-- pendulum rod + weight -->
  <path d="M12 19.5 14 8" />
  <rect x="12.4" y="10.4" width="2.6" height="1.7" rx="0.4" transform="rotate(9 13.7 11.2)" fill="currentColor" stroke="none" />
</svg>
