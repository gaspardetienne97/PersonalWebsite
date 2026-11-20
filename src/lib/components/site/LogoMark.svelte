<!-- The G and E sharing one ring, as a small static mark for the header, footer and favicon. -->
<script lang="ts">
  let { size = 28, class: className = "" }: { size?: number; class?: string } = $props();
  const uid = $props.id();
</script>

<svg
  class={className}
  width={size}
  height={size}
  viewBox="-305 -305 610 610"
  aria-hidden="true"
  fill="none"
  stroke="url(#{uid})"
  stroke-width="60"
>
  <defs>
    <linearGradient id={uid} gradientUnits="userSpaceOnUse" x1="0" y1="-300" x2="0" y2="300">
      <stop offset="0" stop-color="#2bc4ff" />
      <stop offset="0.22" stop-color="#c531f2" />
      <stop offset="0.48" stop-color="#ff1f2a" />
      <stop offset="0.68" stop-color="#ff6fa6" />
      <stop offset="0.85" stop-color="#a98bff" />
      <stop offset="1" stop-color="#1fa2ff" />
    </linearGradient>
  </defs>
  <path d="M 270 0 A 270 270 0 1 1 190.92 -190.92 M 300 0 H 35 M -300 0 H -35" />
</svg>
