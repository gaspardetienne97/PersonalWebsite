<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();
	// Keep where to go back to after signing in (the form action replaces the query).
	const back = $derived(page.url.searchParams.get('redirectTo'));
	const keep = $derived(back ? `&redirectTo=${encodeURIComponent(back)}` : '');
</script>

<h1>Login/Register</h1>
<form method="post" action="?/login{keep}" use:enhance>
	<label>
		Username
		<input
			name="username"
			class="mt-1 rounded-md border border-gray-300 bg-white px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
		/>
	</label>
	<label>
		Password
		<input
			type="password"
			name="password"
			class="mt-1 rounded-md border border-gray-300 bg-white px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
		/>
	</label>
	<button class="rounded-md bg-blue-600 px-4 py-2 text-white transition hover:bg-blue-700"
		>Login</button
	>
	<button
		formaction="?/register{keep}"
		class="rounded-md bg-blue-600 px-4 py-2 text-white transition hover:bg-blue-700"
		>Register</button
	>
</form>
<p style="color: red">{form?.message ?? ''}</p>
