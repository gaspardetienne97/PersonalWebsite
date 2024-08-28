<script>
	import { page } from '$app/stores';
	import logo from '$lib/images/svelte-logo.svg';
	import Sun from 'lucide-svelte/icons/sun';
	import Moon from 'lucide-svelte/icons/moon';
	import { toggleMode } from 'mode-watcher';
	import { Button } from '$lib/components/ui/button';
</script>

<header class="border-blue flex justify-between border-b">
	<div class="h-12 w-12">
		<a href="https://kit.svelte.dev">
			<img src={logo} alt="SvelteKit" />
		</a>
	</div>
	<div class="flex justify-between">
		<nav>
			<ul class="flex flex-row gap-2">
				<li aria-current={$page.url.pathname === '/' ? 'page' : undefined}>
					<a href="/">Home</a>
				</li>
				<li aria-current={$page.url.pathname === '/about' ? 'page' : undefined}>
					<a href="/about">About Me</a>
				</li>
				<li aria-current={$page.url.pathname.startsWith('/gallery') ? 'page' : undefined}>
					<a href="/gallery">Gallery</a>
				</li>
			</ul>
		</nav>

		<div class="flex">
			<Button on:click={toggleMode} variant="outline" size="icon">
				<Sun
					class="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0"
				/>
				<Moon
					class="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100"
				/>
				<span class="sr-only">Toggle theme</span>
			</Button>
		</div>
	</div>
</header>

<style>
</style>
