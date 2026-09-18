<script lang="ts">
	import { page } from '$app/stores';
	import logo from '$lib/images/logo.svg';
	import Sun from 'lucide-svelte/icons/sun';
	import Moon from 'lucide-svelte/icons/moon';
	import { toggleMode } from 'mode-watcher';
	import { Button, buttonVariants } from '@repo/ui/button';
	import * as DropdownMenu from '@repo/ui/dropdown-menu';
	import Menu from 'lucide-svelte/icons/menu';
	import { resolve } from '$app/paths';
	import { MediaQuery } from 'svelte/reactivity';

	const currentPath = $derived($page.url?.pathname ?? '/');
	const narrow = new MediaQuery('(width < 640px)');
	const links = [
		{ href: '/', label: 'Home' }, { href: '/about', label: 'About' },
		{ href: '/gallery', label: 'Gallery' }, { href: '/blog', label: 'Blog' },
		{ href: '/music', label: 'Music' }, { href: '/pdf', label: 'Narrator' }
	] as const;
	const isCurrent = (href: string) => currentPath === href || (href !== '/' && currentPath.startsWith(`${href}/`));
</script>

<header class="border-blue sticky top-0 flex min-w-0 items-center justify-between border-b bg-background">
	<div class="h-12 w-12 shrink-0 p-2">
		<a href={resolve('/')}>
			<img src={logo} alt="SvelteKit" width="100%" />
		</a>
	</div>
	<div class="flex min-w-0 flex-1 items-center justify-end gap-2">
		<nav aria-label="Site navigation" class="hidden min-w-0 sm:block">
			<ul class="flex flex-row items-center justify-center gap-3 whitespace-nowrap px-1 text-sm">
				{#each links as link (link.href)}
					<li><a href={resolve(link.href)} aria-current={isCurrent(link.href) ? 'page' : undefined}>{link.label}</a></li>
				{/each}
			</ul>
		</nav>
		{#if narrow.current}
			<DropdownMenu.Root modal={false}>
				<DropdownMenu.Trigger class={buttonVariants({ variant: 'ghost' })}>
					<Menu class="size-4" aria-hidden="true" />Site menu
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="end">
					{#each links as link (link.href)}
						<DropdownMenu.Item class="min-h-11">
							{#snippet child({ props })}
								<a {...props} href={resolve(link.href)} aria-current={isCurrent(link.href) ? 'page' : undefined}>{link.label}</a>
							{/snippet}
						</DropdownMenu.Item>
					{/each}
				</DropdownMenu.Content>
			</DropdownMenu.Root>
		{/if}

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
