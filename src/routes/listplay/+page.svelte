<script lang="ts">
	//import { page } from '$app/stores';
	import PlaylistsView from './PlaylistsView.svelte';
	/* import { createSpotifyStore } from './spotifyStore';
	const redirectURL = $page.url.href.split('?')[0] ?? `${$page.url.protocol}//${$page.url.host}`;
	createSpotifyStore(redirectURL); */
</script>

<PlaylistsView />
