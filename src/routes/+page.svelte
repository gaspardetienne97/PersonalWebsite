<script lang="ts">
	import * as Carousel from '$lib/components/ui/carousel/index.js';

	import * as Card from '$lib/components/ui/card';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	const { data } = $props();
	const { posts, projects } = data;
</script>

<svelte:head>
	<title>Home</title>
	<meta name="description" content="Gaspard Michel Etienne Personal Website" />
</svelte:head>
<div class="container">
	<section class="bg-gradient m-4 rounded p-4">
		<h1 class="p-4 text-5xl font-bold">welcome!</h1>
		<h2 class="p-4 text-3xl">My name is Gaspard and I'm a fullstack Software Engineer!</h2>
	</section>

	<section class="bg-gradient m-4 flex flex-col rounded p-4">
		<h2 class="p-4 text-3xl font-bold">Blog Posts</h2>

		<Carousel.Root
			opts={{
				align: 'start',
				loop: true
			}}
			class="p-4"
		>
			<Carousel.Content class="gap-4">
				{#each posts as post}
					<Carousel.Item class="basis-1/5">
						<Card.Root class="">
							<Card.Content class="flex shrink-0 flex-col items-center overflow-hidden p-0">
								<img
									class={'aspect-square  w-64 object-cover transition-all hover:scale-105'}
									src={post.thumbnail}
									alt={post.title}
								/>
							</Card.Content>
						</Card.Root>
					</Carousel.Item>
				{/each}
			</Carousel.Content>
			<Carousel.Previous class="-left-0" />
			<Carousel.Next class="-right-0" />
		</Carousel.Root>
		<Button href="/blog" variant="link" class="self-end">More</Button>
	</section>
	<section class="bg-gradient m-4 flex flex-col rounded p-4">
		<h2 class="p-4 text-3xl font-bold">Projects</h2>
		<div class="flex gap-4 p-4">
			{#each projects as project}
				<Dialog.Root>
					<Dialog.Trigger>
						<Card.Root class="shrink-0">
							<Card.Content class="flex flex-col items-center overflow-hidden p-0">
								<img
									class={'aspect-square  w-96 object-cover transition-all hover:scale-105'}
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
						<div class="flex flex-col gap-4">
							<img
								class={'aspect-square w-5/6  self-center object-cover '}
								src={project.imgURL}
								alt={project.title}
							/>
							<div class="self-start">
								{project.description}
							</div>
						</div>
						<Dialog.Footer>
							<Button href={project.projectURL} variant="secondary">View Source</Button>
							<Button href={project.projectURL}>View Source</Button>
						</Dialog.Footer>
					</Dialog.Content>
				</Dialog.Root>
			{/each}
		</div>
		<!-- <Button href="/projects variant="link" class="self-end">More</Button> -->
	</section>
</div>

<style>
</style>
