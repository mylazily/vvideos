<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { applySubdomainSEO } from '$lib/subdomain';
	import UserGuide from '$components/UserGuide.svelte';

	onMount(() => {
		applySubdomainSEO();
	});
</script>

<slot />
<UserGuide />
