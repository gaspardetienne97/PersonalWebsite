<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import * as Avatar from '$lib/components/ui/avatar';
	import { fly } from 'svelte/transition';
	import PlayListIcon from 'lucide-svelte/icons/list-music';
	import { readSpotifyStore } from './spotifyStore';
	import Separator from '$lib/components/ui/separator/separator.svelte';
	import { ScrollArea } from '$lib/components/ui/scroll-area';
	const snapPoints = ['148px', '355px', 1];
	let open = $state(true);
	let activeSnapPoint = $state(snapPoints[0]);
	const spotify = readSpotifyStore();
</script>

<section class="flex justify-between rounded-md border p-4">
	{#await spotify.getUser() then spotifyUser}
		<Avatar.Root>
			<Avatar.Image src={spotifyUser?.images[0].url} alt={spotifyUser?.display_name} />
			<Avatar.Fallback>{spotifyUser?.display_name[0]}</Avatar.Fallback>
		</Avatar.Root>
	{/await}
	{#await spotify.isAuthenticated() then isAuthenticated}
		{#if isAuthenticated}
			<Button onclick={spotify.logout}>Logout</Button>
		{:else}
			<Button onclick={spotify.login}>Login</Button>
		{/if}
	{/await}
</section>
<nav class="h-full rounded-md border p-4">
	<h2 class="relative text-lg font-semibold tracking-tight">Playlists</h2>
	<ScrollArea class="max-h-96 " orientation="vertical">
		{#await spotify.getUserPlaylists() then playlists}
			{#each playlists as playlist}
				<Button
					variant="link"
					href={`/listplay/playlist/${playlist.id}`}
					class="w-full justify-start font-normal"
				>
					<PlayListIcon />
					{playlist.name}
				</Button>
			{/each}
		{/await}
	</ScrollArea>
</nav>
