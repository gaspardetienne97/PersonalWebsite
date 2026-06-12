<script>
	import { page } from '$app/stores';
	import logo from '$lib/images/logo.svg';
	import Sun from 'lucide-svelte/icons/sun';
	import Moon from 'lucide-svelte/icons/moon';
	import { toggleMode } from 'mode-watcher';
	import { Button } from '@repo/ui/button';

	const currentPath = $derived($page.url?.pathname ?? '/');
</script>

<header class="border-blue sticky top-0 flex min-w-0 items-center justify-between border-b bg-background">
	<div class="h-12 w-12 shrink-0 p-2">
		<a href="/">
			<img src={logo} alt="SvelteKit" width="100%" />
		</a>
	</div>
	<div class="flex min-w-0 flex-1 items-center justify-end gap-2">
		<nav class="min-w-0 overflow-x-auto">
			<ul class="flex flex-row items-center justify-center gap-3 whitespace-nowrap px-1 text-sm">
				<li aria-current={currentPath === '/' ? 'page' : undefined}>
					<a href="/">Home</a>
				</li>
				<li aria-current={currentPath === '/about' ? 'page' : undefined}>
					<a href="/about">About</a>
				</li>
				<li aria-current={currentPath.startsWith('/gallery') ? 'page' : undefined}>
					<a href="/gallery">Gallery</a>
				</li>
				<li aria-current={currentPath.startsWith('/blog') ? 'page' : undefined}>
					<a href="/blog">Blog</a>
				</li>
				<li aria-current={currentPath.startsWith('/music') ? 'page' : undefined}>
					<a href="/music">Music</a>
				</li>
				<li aria-current={currentPath.startsWith('/pdf') ? 'page' : undefined}>
					<a href="/pdf">Narrator</a>
				</li>
			</ul>
		</nav>

		<div class="flex shrink-0">
			<Button onclick={toggleMode} variant="ghost" size="icon">
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
