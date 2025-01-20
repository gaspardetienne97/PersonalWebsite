<script>
	import { page } from '$app/stores';
	import SideBar from './SideBar.svelte';
	import { createSpotifyStore } from './spotifyStore';
	const redirectURL = $page.url.href.split('?')[0] ?? `${$page.url.protocol}//${$page.url.host}`;
	createSpotifyStore(redirectURL);
</script>

<div class="grid grid-cols-5 gap-4">
	<aside class="flex h-full flex-col gap-4 p-4">
		<SideBar />
	</aside>
	<main class="col-span-4 h-full p-4">
		<slot />
	</main>
</div>
