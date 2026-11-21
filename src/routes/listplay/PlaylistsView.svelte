<script lang="ts">
	import * as Carousel from '@repo/ui/carousel';
	import PlaylistCard from './PlaylistCard.svelte';
	import { readSpotifyStore } from './spotifyStore';
	import { Button } from '@repo/ui/button';
	import { Separator } from '@repo/ui/separator';
	import TrendUpIcon from '@lucide/svelte/icons/trending-up';
	import LoaderCircle from '@lucide/svelte/icons/loader';
	import { m } from '@repo/i18n/messages.js';

	const spotify = readSpotifyStore();
	let createTopMonthlySongPlaylistLoading = $state(false);
	async function handleCreateTopMonthlySongPlaylist() {
		createTopMonthlySongPlaylistLoading = true;
		await spotify.createTopPlaylist();
		createTopMonthlySongPlaylistLoading = false;
	}
</script>

<!-- Only drawn for someone signed in: the layout shows the signed-out state. -->
<section>
	<h2 class="text-2xl font-semibold tracking-tight">{m.listplay_your_playlists()}</h2>
	{#await spotify.getUserPlaylists() then userPlaylists}
		{#if userPlaylists.length === 0}
			<p class="mt-3 text-muted-foreground">{m.listplay_no_playlists()}</p>
		{:else}
			<!-- The arrows sit at the middle of the cards, so with no card there is no carousel. -->
			<Carousel.Root
				opts={{
					align: 'start',
					loop: true
				}}
				class="mt-4 w-full"
			>
				<Carousel.Content class="-ml-5">
					{#each userPlaylists as playlist (playlist.id)}
						<Carousel.Item class=" basis-1/2 pl-5 md:basis-1/5">
							<PlaylistCard
								name={playlist.name}
								imageUrl={playlist.images?.[0]?.url ?? ''}
								trackCount={playlist.tracks?.total}
								id={playlist.id}
							/>
						</Carousel.Item>
					{/each}
				</Carousel.Content>
				<Carousel.Previous class="-left-0" />
				<Carousel.Next class="-right-0" />
			</Carousel.Root>
		{/if}
	{:catch}
		<p class="mt-3 text-muted-foreground" role="alert">{m.listplay_load_failed()}</p>
	{/await}
</section>
<Separator class="my-4" />
<section>
	<Button onclick={handleCreateTopMonthlySongPlaylist}
		>{#if createTopMonthlySongPlaylistLoading}
			<LoaderCircle class="animate-spin p-1" />
		{:else}
			<TrendUpIcon class="p-1" />
		{/if}
		{m.listplay_create_playlist()}</Button
	>
</section>

<style>
</style>
