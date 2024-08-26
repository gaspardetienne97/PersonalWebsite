<script>
	import { page } from '$app/stores';
	import logo from '$lib/images/svelte-logo.svg';
	import github from '$lib/images/github.svg';
</script>

<header class="flex justify-between border-b border-blue">
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
			<li aria-current={$page.url.pathname.startsWith('/sverdle') ? 'page' : undefined}>
				<a href="/sverdle">Sverdle</a>
			</li>
		</ul>
		
	</nav>

	<div class="flex">
		<a class="h-12 w-12"    href="https://github.com/sveltejs/kit">
			<img src={github} alt="GitHub" />
		</a>
	</div>
</div>
</header>

<style>
</style>
