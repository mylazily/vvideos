<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { applySubdomainSEO } from '$lib/subdomain';

	onMount(() => {
		applySubdomainSEO();
	});
</script>

<slot />
