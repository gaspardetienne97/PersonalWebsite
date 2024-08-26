<script lang="ts">
	import Counter from './Counter.svelte';
	import welcome from '$lib/images/svelte-welcome.webp';
	import welcome_fallback from '$lib/images/svelte-welcome.png';
	import { onMount } from 'svelte';
	import { fade } from 'svelte/transition';
	import * as Card from '$lib/components/ui/card';
let projects = [{name:"test"},{name:"test2"}]
</script>

<svelte:head>
	<title>Home</title>
	<meta name="description" content="Gaspard Michel Etienne Personal Website" />
</svelte:head>

<section>
<h2>Projects</h2>
{#each projects as project}
	<Card.Root>
<Card.Header>
    <Card.Title>{project.name}</Card.Title>
    <Card.Description>Card Description</Card.Description>
  </Card.Header>
  		<Card.Content class="p-4 flex flex-col items-center">
			<h1 class="text-5xl font-bold" in:fade={{ delay: 250, duration: 1000 }}>
				Gaspard Michel Etienne
			</h1>
			<h2 class="text-2xl">Software Engineer</h2>
		</Card.Content>
	</Card.Root>
{/each}
</section>

<style>
</style>
