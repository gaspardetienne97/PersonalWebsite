<script lang="ts">
	import * as Card from '@repo/ui/card';
	const { name, imageUrl, trackCount, id }: {
		name: string;
		imageUrl: string;
		trackCount?: number;
		id: string;
	} = $props();
</script>

<Card.Root class="overflow-hidden rounded">
	<Card.Content class="p-0">
		<a href={`/listplay/playlist/${id}`}>
			{#if imageUrl}
				<img
					class="aspect-square h-auto w-auto object-cover transition-all hover:scale-105"
					src={imageUrl}
					alt={name}
				/>
			{:else}
				<!-- No cover: an empty square, so the card keeps its shape. -->
				<div class="aspect-square bg-muted"></div>
			{/if}
		</a>
	</Card.Content>
	<Card.Footer class="flex items-center justify-between p-1">
		<Card.Title>{name}</Card.Title>
		<Card.Description>{trackCount}</Card.Description>
	</Card.Footer>
</Card.Root>
