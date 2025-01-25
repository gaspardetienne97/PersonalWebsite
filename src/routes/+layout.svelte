<script lang="ts">
	import { i18n } from '$lib/i18n';
	import { ParaglideJS } from '@inlang/paraglide-sveltekit';
	import Header from '$lib/components/Header.svelte';
	import '../app.css';
	import { ModeWatcher } from 'mode-watcher';
	import SplashScreen from '$lib/components/SplashScreen.svelte';
	import Footer from '$lib/components/Footer.svelte';
	let commands = $state('');
	let { children } = $props();
</script>

<svelte:window
	onkeypress={({ key, ctrlKey }) => {
		if (key === 'esc') {
			commands = '';
		} else if (ctrlKey) {
			commands.concat(key);
		}
	}}
/>

<ParaglideJS {i18n}>
	<div class="app flex min-h-screen flex-col">
		<SplashScreen />
		<ModeWatcher />
		<Header />
		<main class="grow">
			{@render children()}
		</main>
		<Footer />
	</div>
</ParaglideJS>
