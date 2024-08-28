<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils.js';

	type $$Props = HTMLAttributes<HTMLDivElement>;

	let className: $$Props['class'] = undefined;
	export { className as class };
</script>

<div
	class={cn(
		'rounded-lg border bg-card bg-opacity-30 text-card-foreground shadow-sm backdrop-blur-md backdrop-filter',
		className
	)}
	{...$$restProps}
>
	<slot />
</div>
