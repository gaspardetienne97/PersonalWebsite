<script lang="ts">
	import * as Carousel from '$lib/components/ui/carousel/index.js';
	import PlaylistCard from './PlaylistCard.svelte';
	import { readSpotifyStore } from './spotifyStore';
	import Button from '$lib/components/ui/button/button.svelte';
	import Separator from '$lib/components/ui/separator/separator.svelte';
	import TrendUpIcon from 'lucide-svelte/icons/trending-up';
	import LoaderCircle from 'lucide-svelte/icons/loader';

	const spotify = readSpotifyStore();
	let createTopMonthlySongPlaylistLoading = $state(false);
	async function handleCreateTopMonthlySongPlaylist() {
		createTopMonthlySongPlaylistLoading = true;
		await spotify.createTopPlaylist();
		createTopMonthlySongPlaylistLoading = false;
	}
</script>

{#if !spotify.isAuthenticated}
	<button onclick={spotify.login}>Login with Spotify</button>
{:else}
	<section class="">
		<h2 class="text-2xl font-semibold tracking-tight">Your Playlists</h2>
		<Carousel.Root
			opts={{
				align: 'start',
				loop: true
			}}
			class="w-full"
		>
			<Carousel.Content class="-ml-5">
				{#await spotify.getUserPlaylists() then userPlaylists}
					{#each userPlaylists as playlist}
						{console.log({ playlist })}
						<Carousel.Item class=" basis-1/2 pl-5 md:basis-1/5">
							<PlaylistCard
								name={playlist.name}
								imageUrl={playlist.images[0].url}
								trackCount={playlist.tracks?.total}
								id={playlist.id}
							/>
						</Carousel.Item>
					{/each}
				{/await}
			</Carousel.Content>
			<Carousel.Previous class="-left-0" />
			<Carousel.Next class="-right-0" />
		</Carousel.Root>
	</section>
	<Separator class="my-4" />
	<section>
		<Button onclick={handleCreateTopMonthlySongPlaylist}
			>{#if createTopMonthlySongPlaylistLoading}
				<LoaderCircle class="animate-spin p-1" />
			{:else}
				<TrendUpIcon class="p-1" />
			{/if}
			Create Playlist</Button
		>
	</section>
{/if}

<style>
	.playlist-container {
		display: flex;
		flex: 1;
	}
</style>
