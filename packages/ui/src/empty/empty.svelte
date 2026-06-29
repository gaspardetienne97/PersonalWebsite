<script lang="ts">
	import type { Snippet } from "svelte";
	import type { HTMLAttributes } from "svelte/elements";
	import { cn } from "../utils.js";

	let {
		title,
		description,
		icon,
		class: className,
		children,
		...restProps
	}: HTMLAttributes<HTMLDivElement> & {
		title: string;
		description?: string;
		icon?: Snippet;
		children?: Snippet;
	} = $props();
</script>

<div
	class={cn(
		"flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-6 py-10 text-center",
		className,
	)}
	{...restProps}
>
	{#if icon}
		<div class="text-muted-foreground/70 [&_svg]:size-8">{@render icon()}</div>
	{/if}
	<div class="flex flex-col gap-1">
		<p class="text-sm font-semibold text-foreground">{title}</p>
		{#if description}
			<p class="mx-auto max-w-sm text-sm text-muted-foreground">{description}</p>
		{/if}
	</div>
	{#if children}
		<div class="mt-1 flex flex-wrap items-center justify-center gap-2">{@render children()}</div>
	{/if}
</div>
