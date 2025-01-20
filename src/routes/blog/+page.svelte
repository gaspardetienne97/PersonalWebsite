<script lang="ts">
	import { formatDate } from '$lib/utils';
	import * as config from '$lib/config';
	import * as Card from '$lib/components/ui/card';

	export let data;
</script>

<svelte:head>
	<title>{config.title}</title>
</svelte:head>

<!-- Posts -->
<section>
	<ul class="flex flex-col gap-4">
		{#each data.posts as post}
			<Card.Root class="border-none">
				<Card.Content class="p-0">
					<a href={`blog/${post.slug}`} class="flex items-center justify-between">
						<div class="p-4">
							<h2 class="text-3xl font-bold">
								{post.title}
							</h2>
							<p class="date">{formatDate(post.date)}</p>
							<p class="description">{post.description}</p>
						</div>
						<img class={'w-64 rounded object-cover '} src={post.thumbnail} alt={post.title} />
					</a>
				</Card.Content>
			</Card.Root>
		{/each}
	</ul>
</section>

<style>
</style>
