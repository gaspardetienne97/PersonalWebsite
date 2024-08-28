<script lang="ts">
	import Counter from './Counter.svelte';
	import welcome from '$lib/images/svelte-welcome.webp';
	import welcome_fallback from '$lib/images/svelte-welcome.png';
	import { onMount } from 'svelte';
	import { fade } from 'svelte/transition';
	import * as Card from '$lib/components/ui/card';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import SplashScreen from './SplashScreen.svelte';

	let projects = [
		{
			title: 'test1',
			subtitle: 'test1',
			description: 'test1 and more',
			imgURL: 'https://picsum.photos/250/250?random=1',
			projectURL: 'https://picsum.photos/250/250?random=1'
		},
		{
			title: 'test2',
			subtitle: 'test2',
			description: 'test2 and more',
			imgURL: 'https://picsum.photos/250/250?random=2',
			projectURL: 'https://picsum.photos/250/250?random=2'
		},
		{
			title: 'test3',
			subtitle: 'test3',
			description: 'test3 and more',
			imgURL: 'https://picsum.photos/250/250?random=3',
			projectURL: 'https://picsum.photos/250/250?random=3'
		},
		{
			title: 'test4',
			subtitle: 'test4',
			description: 'test4 and more',
			imgURL: 'https://picsum.photos/250/250?random=4',
			projectURL: 'https://picsum.photos/250/250?random=4'
		}
	];
</script>

<svelte:head>
	<title>Home</title>
	<meta name="description" content="Gaspard Michel Etienne Personal Website" />
</svelte:head>

<SplashScreen />

<section>
	<h2 class="p-4 text-3xl font-bold">Projects</h2>
	<div class="flex gap-4 p-4">
		{#each projects as project}
			<Dialog.Root>
				<Dialog.Trigger>
					<Card.Root>
						<Card.Content class="flex flex-col items-center overflow-hidden p-0">
							<img
								class={'aspect-square h-96 w-96 object-cover transition-all hover:scale-105'}
								src={project.imgURL}
								alt={project.title}
							/>
						</Card.Content>
						<Card.Footer class="flex flex-col items-start gap-4 p-4">
							<Card.Title>{project.title}</Card.Title>
							<Card.Description>{project.subtitle}</Card.Description>
						</Card.Footer>
					</Card.Root>
				</Dialog.Trigger>
				<Dialog.Content class="flex flex-col p-4 sm:w-5/6 md:w-1/2">
					<Dialog.Header class="justify-self-start">
						<Dialog.Title class="text-3xl">{project.title}</Dialog.Title>
					</Dialog.Header>
					<div class=" gap-4">
						<img
							class={'aspect-square w-5/6  justify-center object-cover '}
							src={project.imgURL}
							alt={project.title}
						/>
						<div class="justify-start">
							{project.description}
						</div>
					</div>
					<Dialog.Footer>
						<Button href={project.projectURL}>View Source</Button>
					</Dialog.Footer>
				</Dialog.Content>
			</Dialog.Root>
		{/each}
	</div>
</section>

<style>
</style>
