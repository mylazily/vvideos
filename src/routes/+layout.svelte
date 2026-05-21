<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { applySubdomainSEO } from '$lib/subdomain';
	import { initDomainGuard } from '$lib/domain-guard';
	import UserGuide from '$components/UserGuide.svelte';

	onMount(() => {
		applySubdomainSEO();
		initDomainGuard();
	});
</script>

<slot />
<UserGuide />
