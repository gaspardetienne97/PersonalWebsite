<script lang="ts">
	export const ssr = false;

	import * as Card from '$lib/components/ui/card';
	import { fade, fly } from 'svelte/transition';
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import type { FlyParams, TransitionConfig } from 'svelte/transition';
	let visited = $state(false);
	let visible = $state(false);
	let splashCompleted = $state(false);

	visited = browser ? window.localStorage.getItem('visited') === 'true' : true;

	const scrollToBottom = () => {
		visited = true;
		window.localStorage.setItem('visited', 'true');
		splashCompleted = true;
	};
	const handleClick = () => {
		visible = true;
	};
	/**
	 * @param {HTMLDivElement} node
	 * @param {{ fn: any; delay?: number; duration?: number; }} options
	 */

	const maybe = (node: Element, options: FlyParams & { fn: typeof fly }): TransitionConfig => {
		if (!visited) {
			return options.fn(node, options);
		}
		return {};
	};
</script>

<svelte:document onclick={handleClick} />
{#if !visited && !splashCompleted}
	<section
		class={'absolute inset-0 z-10 flex h-screen items-center justify-center bg-primary'}
		out:maybe={{ fn: fly, y: '-100%', duration: 2000 }}
	>
		{#if visible}
			<div in:fade={{ delay: 250, duration: 1000 }} onintroend={scrollToBottom}>
				<Card.Root>
					<Card.Content class="flex flex-col items-center p-4">
						<h1 class="text-5xl font-bold">Gaspard Michel Etienne</h1>
						<h2 class="text-2xl">Software Engineer</h2>
					</Card.Content>
				</Card.Root>
			</div>
		{:else}
			<Button onclick={handleClick} class="text-5xl">G</Button>
		{/if}
	</section>
{/if}

<style>
</style>
