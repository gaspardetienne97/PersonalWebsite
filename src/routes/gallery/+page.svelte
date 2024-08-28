<script lang="ts">
	import doodle1 from '$lib/images/gallery/Web back.svg';
	import doodle2 from '$lib/images/gallery/Web back1.svg';
	import doodle3 from '$lib/images/gallery/Web back2.svg';
	import doodle4 from '$lib/images/gallery/Web back3.svg';
	import doodle5 from '$lib/images/gallery/Web back4.svg';
	import doodle6 from '$lib/images/gallery/Web back5.svg';
	import doodle7 from '$lib/images/gallery/Web back6.svg';
	import doodle8 from '$lib/images/gallery/Web back7.svg';
	import doodle9 from '$lib/images/gallery/Web back8.svg';
	import doodle10 from '$lib/images/gallery/Web back9.svg';
	const imageArr = [
		doodle1,
		doodle2,
		doodle3,
		doodle4,
		doodle5,
		doodle6,
		doodle7,
		doodle8,
		doodle9,
		doodle10
	];
	function chunkArray<T>(array: T[], n: number) {
		const result = [];
		for (let i = 0; i < array.length; i += n) {
			result.push(array.slice(i, i + n));
		}
		return result;
	}
	const numPerRow = 3;
	const imageRows = chunkArray(imageArr, numPerRow);
	console.log({ imageArr, imageRows });
</script>

<svelte:head>
	<title>Gallery</title>
	<meta name="description" content="A gallery of my art" />
</svelte:head>

<div class="grid grid-cols-2 gap-4 p-4 md:grid-cols-4">
	{#each imageRows as row}
		<div class="grid gap-4">
			{#each row as image, i}
				<div class="bg-white">
					<img class="h-auto max-w-full rounded-lg" src={image} alt="" />
				</div>
			{/each}
		</div>
	{/each}
</div>
