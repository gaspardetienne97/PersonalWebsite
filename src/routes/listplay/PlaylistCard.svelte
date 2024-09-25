<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	const { name, imageUrl, trackCount, id } = $props<{
		name: string;
		imageUrl: string;
		trackCount?: number;
		id: string;
	}>();
</script>

<Card.Root class="overflow-hidden rounded">
	<Card.Content class="p-0">
		<a href={`/listplay/playlist/${id}`}>
			<img
				class="aspect-square h-auto w-auto object-cover transition-all hover:scale-105"
				src={imageUrl}
				alt={name}
			/>
		</a>
	</Card.Content>
	<Card.Footer class="flex items-center justify-between p-1">
		<Card.Title>{name}</Card.Title>
		<Card.Description>{trackCount}</Card.Description>
	</Card.Footer>
</Card.Root>
