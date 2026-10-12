<!--
  @component Card
  @description Wrapper branco com raio e sombra padronizados.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		children: Snippet;
		padding?: string;
	}

	let { children, padding = '1.25rem' }: Props = $props();
</script>

<div class="card" style="padding: {padding};">
	{@render children()}
</div>

<style>
	.card {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-card);
	}
</style>
