<script lang="ts">
	import Header from '../lib/components/Header.svelte';
	import '../app.css';
	import { ModeWatcher } from 'mode-watcher';
	import SplashScreen from '../lib/components/SplashScreen.svelte';
	import type { Snippet } from 'svelte';
	import Footer from '$lib/components/Footer.svelte';
	let commands = $state('');
	let {
		children
	}: {
		children: Snippet;
	} = $props();
</script>

<svelte:document
	onkeypress={({ key, ctrlKey }) => {
		if (key === 'esc') {
			commands = '';
		} else if (ctrlKey) {
			commands.concat(key);
		}
	}}
/>

<div class="app flex min-h-screen flex-col">
	<SplashScreen />
	<ModeWatcher />
	<Header />
	<main class="grow">
		{@render children()}
	</main>
	<Footer />
</div>
