<script lang="ts">
	import PlaylistCard from '../../PlaylistCard.svelte';
	import { readSpotifyStore } from '../../spotifyStore';
	const { data } = $props<{ data: { id: string } }>();

	const spotify = readSpotifyStore();
</script>

<div class="track-container">
	{#await spotify.getPlaylist(data.id) then tracks}
		{#each tracks ?? [] as track}
			<PlaylistCard
				name={track.track.name}
				imageUrl={track.track.preview_url ?? ''}
				id={track.track.id}
			/>
		{/each}
	{/await}
</div>
