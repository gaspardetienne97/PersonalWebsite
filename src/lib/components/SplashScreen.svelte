<script lang="ts">
	export const ssr = false;

	import logo from '$lib/images/logo.svg';
	import * as Card from '$lib/components/ui/card';
	import { fade, fly } from 'svelte/transition';
	import { browser } from '$app/environment';
	import Button from '$lib/components/ui/button/button.svelte';
	import type { FlyParams, TransitionConfig } from 'svelte/transition';
	import SpaceColonizationCircuit from './SpaceColonizationCircuit.svelte';

	interface Props {}

	let {}: Props = $props();
	let visited = $state(false);
	let visible = $state(false);
	let splashCompleted = $state(false);

	visited = false; // browser ? window.localStorage.getItem('visited') === 'true' : true;

	const scrollToBottom = () => {
		visited = true;
		splashCompleted = true;
		window.localStorage.setItem('visited', 'true');
	};
	const handleClick = () => {
		startAnimation?.();
		visible = true;
	};
	/**
	 * @param {HTMLDivElement} node
	 * @param {{ fn: any; delay?: number; duration?: number; }} options
	 */

	const maybe = (node: Element, options: FlyParams & { fn: typeof fly }): TransitionConfig => {
		if (splashCompleted) {
			return options.fn(node, options);
		}
		return {};
	};
	let startAnimation: (() => void) | undefined = $state(undefined);
</script>

<svelte:window onclick={handleClick} />
{#if !visited && !splashCompleted}
	<section
		class={'absolute inset-0 z-10 flex h-screen items-center justify-center bg-background '}
		out:maybe={{ fn: fly, y: '-100%', duration: 5000 }}
	>
		{#if visible}
			<div in:fade={{ duration: 2000 }} onintroend={scrollToBottom}>
				<Card.Root>
					<Card.Content class="flex flex-col items-center  p-4">
						<h1 class="text-5xl font-bold">Gaspard Michel Etienne</h1>
						<h2 class="text-2xl">Software Engineer</h2>
					</Card.Content>
				</Card.Root>
			</div>
			<SpaceColonizationCircuit
				bind:startAnimation
				nodeCount={200}
				maxIterations={100}
				debug={false}
			/>
		{:else}
			<Button onclick={handleClick} variant="ghost" class="hover:bg-dark">
				<img src={logo} alt="logo" class="w-1/4" />
			</Button>
		{/if}
	</section>
{/if}
