<script>
	import * as Card from '$lib/components/ui/card';
	import { fade } from 'svelte/transition';
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';
	let visited = $state(false);
	let hidden = $state(true);
	onMount(() => {
		//visited = window.localStorage.getItem('visited') === 'true';

		window.localStorage.setItem('visited', 'true');
	});

	const scrollToBottom = () => {
		window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
	};
	const handleClick = () => {
		hidden = false;
	};
</script>

<svelte:document onclick={() => (hidden = false)} />
{#if !visited}
	<section class={'flex h-screen items-center justify-center'}>
		<Card.Root>
			<Card.Content class="flex flex-col items-center p-4">
				{#if !hidden}
					<h1
						class="text-5xl font-bold"
						onintroend={scrollToBottom}
						transition:fade={{ delay: 250, duration: 1000 }}
					>
						Gaspard Michel Etienne
					</h1>
					<h2 class="text-2xl">Software Engineer</h2>
				{/if}
			</Card.Content>
		</Card.Root>
	</section>
{/if}

<style>
</style>
