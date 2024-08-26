<script>
	import { page } from '$app/stores';
	import logo from '$lib/images/svelte-logo.svg';
	import github from '$lib/images/github.svg';
	import { cn } from '$lib/utils';
</script>

<header class="flex h-14 items-center justify-between p-4 outline outline-blue-400">
	<div class="h-14 rounded-full bg-blue-500">
		<a href="https://gaspardetienne.com">
			<img src={logo} alt="Gaspard Michel Etienne" class="h-14" />
		</a>
	</div>
	<nav>
		<ul class="flex gap-4">
			<li aria-current={$page.url.pathname === '/' ? 'page' : undefined}>
				<a
					href="/"
					class={cn(
						'transition-colors hover:text-foreground/80',
						$page.url.pathname === '/' ? 'text-foreground' : 'text-foreground/60'
					)}>Home</a
				>
			</li>
			<li aria-current={$page.url.pathname === '/about' ? 'page' : undefined}>
				<a
					href="/about"
					class={cn(
						'transition-colors hover:text-foreground/80',
						$page.url.pathname === '/about' ? 'text-foreground' : 'text-foreground/60'
					)}>About Me</a
				>
			</li>
			<li aria-current={$page.url.pathname === '/gallery' ? 'page' : undefined}>
				<a
					href="/gallery"
					class={cn(
						'transition-colors hover:text-foreground/80',
						$page.url.pathname === '/gallery' ? 'text-foreground' : 'text-foreground/60'
					)}>Gallery</a
				>
			</li>
			<li aria-current={$page.url.pathname.startsWith('/listplay') ? 'page' : undefined}>
				<a
					href="/listplay"
					class={cn(
						'transition-colors hover:text-foreground/80',
						$page.url.pathname.startsWith('/listplay') ? 'text-foreground' : 'text-foreground/60'
					)}>ListPlay</a
				>
			</li>
		</ul>
	</nav>
</header>

<style>
</style>
