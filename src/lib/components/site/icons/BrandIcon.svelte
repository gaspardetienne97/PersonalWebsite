<!--
  Outline brand icons in Lucide's style. Lucide 1.0 dropped brand icons, so the
  few the site needs live here, drawn on the same 24px grid and 2px stroke so they
  sit beside Lucide icons unnoticed. Takes the same size, strokeWidth and class.
-->
<script lang="ts">
  import type { Snippet } from "svelte";
  import type { SVGAttributes } from "svelte/elements";

  let {
    size = 24,
    strokeWidth = 2,
    class: className = "",
    children,
    ...rest
  }: SVGAttributes<SVGSVGElement> & {
    size?: number | string;
    strokeWidth?: number | string;
    children: Snippet;
  } = $props();
</script>

<svg
  xmlns="http://www.w3.org/2000/svg"
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width={strokeWidth}
  stroke-linecap="round"
  stroke-linejoin="round"
  class="lucide {className}"
  {...rest}
>
  {@render children()}
</svg>
