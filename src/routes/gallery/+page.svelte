<script lang="ts">
	import { ScrollArea } from '$lib/components/ui/scroll-area';
	import * as Card from '$lib/components/ui/card';
	import { AspectRatio } from '$lib/components/ui/aspect-ratio';
	import { Root } from 'postcss';

	const images: string = ['1', '2'];
</script>

<h1>Gallery Page</h1>
<h2>To show my art</h2>
<ScrollArea class="max-h-96 rounded-md border p-4">
	{#each images as image}
		<Card.Root class="overflow-hidden rounded">
			<Card.Content class="p-0">
				<AspectRatio ratio={3 / 3} class="bg-blue-300"
					>{image}
					<img src="..." alt="..." class="rounded-md object-cover" />
				</AspectRatio>
			</Card.Content>
		</Card.Root>
	{/each}
</ScrollArea>
