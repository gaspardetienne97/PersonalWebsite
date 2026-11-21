<script lang="ts">
	import { Button } from '@repo/ui/button';
	import * as Avatar from '@repo/ui/avatar';
	import PlayListIcon from '@lucide/svelte/icons/list';
	import { readSpotifyStore } from './spotifyStore';
	import { ScrollArea } from '@repo/ui/scroll-area';
	import { m } from '@repo/i18n/messages.js';
	const spotify = readSpotifyStore();
</script>

<section class="flex items-center justify-between gap-3 rounded-md border p-4">
	{#await spotify.getUser() then spotifyUser}
		{#if spotifyUser}
			<Avatar.Root>
				<Avatar.Image src={spotifyUser.images[0]?.url} alt={spotifyUser.display_name} />
				<Avatar.Fallback>{spotifyUser.display_name[0]}</Avatar.Fallback>
			</Avatar.Root>
		{/if}
	{/await}
	<Button class="ml-auto" onclick={spotify.logout}>{m.listplay_sign_out()}</Button>
</section>
{#await spotify.getUserPlaylists() then playlists}
	{#if playlists.length > 0}
		<nav class="rounded-md border p-4" aria-labelledby="listplay-nav">
			<h2 id="listplay-nav" class="text-lg font-semibold tracking-tight">
				{m.listplay_playlists()}
			</h2>
			<ScrollArea class="max-h-96" orientation="vertical">
				{#each playlists as playlist (playlist.id)}
					<Button
						variant="link"
						href={`/listplay/playlist/${playlist.id}`}
						class="w-full justify-start font-normal"
					>
						<PlayListIcon />
						{playlist.name}
					</Button>
				{/each}
			</ScrollArea>
		</nav>
	{/if}
{/await}
