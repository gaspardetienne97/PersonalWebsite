<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Drawer as DrawerPrimitive } from 'vaul-svelte';

	type $$Props = DrawerPrimitive.Props & { children: Snippet };
	export let shouldScaleBackground: $$Props['shouldScaleBackground'] = true;
	export let open: $$Props['open'] = false;
	export let activeSnapPoint: $$Props['activeSnapPoint'] = undefined;
</script>

<DrawerPrimitive.Root {shouldScaleBackground} bind:open bind:activeSnapPoint {...$$restProps}>
	<slot />
</DrawerPrimitive.Root>
