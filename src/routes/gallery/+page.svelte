<script lang="ts">
	import doodle1 from '$lib/images/gallery/web back1.svg';
	import doodle2 from '$lib/images/gallery/web back2.svg';
	import doodle3 from '$lib/images/gallery/web back3.svg';
	import doodle4 from '$lib/images/gallery/web back4.svg';
	import doodle5 from '$lib/images/gallery/web back5.svg';
	import doodle6 from '$lib/images/gallery/web back6.svg';
	import doodle7 from '$lib/images/gallery/web back7.svg';
	import doodle8 from '$lib/images/gallery/web back8.svg';
	import doodle9 from '$lib/images/gallery/web back9.svg';
	const imageArr = [
		doodle1,
		doodle2,
		doodle3,
		doodle4,
		doodle5,
		doodle6,
		doodle7,
		doodle8,
		doodle9
	];
</script>

<svelte:head>
	<title>Gallery</title>
	<meta name="description" content="A gallery of my art" />
</svelte:head>

{#each imageArr as image}
	<div class="bg-white">
		<img class="h-auto min-w-96 columns-md" src={image} alt="" />
	</div>
{/each}
