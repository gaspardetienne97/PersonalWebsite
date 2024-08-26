<script>
	import { page } from '$app/stores';
	import Drawer from './Drawer.svelte';
	import { createSpotifyStore } from './spotifyStore';
	const redirectURL = $page.url.href.split('?')[0] ?? `${$page.url.protocol}//${$page.url.host}`;
	createSpotifyStore(redirectURL);
</script>

<div class="grid grid-cols-5 gap-1">
	<aside class="flex h-full flex-col gap-1 p-1">
		<Drawer />
	</aside>
	<main class="col-span-4 h-full p-1">
		<slot />
	</main>
</div>
