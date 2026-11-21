<script lang="ts">
	import { resolve } from '$app/paths';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import { Button } from '@repo/ui/button';
	import { m } from '@repo/i18n/messages.js';
	import PlaylistCard from '../../PlaylistCard.svelte';
	import { readSpotifyStore } from '../../spotifyStore';
	const { data }: { data: { id: string } } = $props();

	const spotify = readSpotifyStore();
</script>

<Button variant="ghost" href={resolve('/listplay')} class="-ml-3 mb-4">
	<ChevronLeft data-icon="inline-start" aria-hidden="true" />
	{m.listplay_all_playlists()}
</Button>
<div class="track-container">
	{#await spotify.getPlaylist(data.id) then tracks}
		{#each tracks as track, i (i)}
			<PlaylistCard
				name={track.track.name}
				imageUrl={track.track.preview_url ?? ''}
				id={track.track.id}
			/>
		{:else}
			<p class="text-muted-foreground">{m.listplay_playlist_empty()}</p>
		{/each}
	{:catch}
		<p class="text-muted-foreground" role="alert">{m.listplay_playlist_missing()}</p>
	{/await}
</div>
