<script lang="ts">
	import * as Avatar from '$lib/components/ui/avatar';
	import { formatDate } from '$lib/utils';

	const { data } = $props();
	const { meta, Content } = data;
</script>

<!-- SEO -->
<svelte:head>
	<title>{meta.title}</title>
	<meta property="og:type" content="article" />
	<meta property="og:title" content={meta.title} />
</svelte:head>

<article class="flex flex-col items-center">
	<img class={'w-full rounded object-cover'} src={meta.thumbnail} alt={meta.title} />
	<!-- Title -->
	<hgroup class="">
		<h1 class="text-5xl font-bold">{meta.title}</h1>
		<Avatar.Root>
			<Avatar.Image src={meta.author?.imageUrl} alt={meta.author?.name} />
			<Avatar.Fallback>{meta.author?.name[0]}</Avatar.Fallback>
		</Avatar.Root>
		<p>Published at {formatDate(meta.date)}</p>
	</hgroup>

	<!-- Tags -->
	<div class="tags">
		{#each meta.categories as category}
			<span class="surface-4">&num;{category}</span>
		{/each}
	</div>

	<!-- Post -->
	<div>
		<Content />
	</div>
</article>

<style>
</style>
