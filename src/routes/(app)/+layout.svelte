<!--
  @layout (app)
  @description Layout compartilhado para rotas autenticadas (admin + colaborador).
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { get } from 'svelte/store';
	import type { Snippet } from 'svelte';
	import AppShell from '@/components/layout/AppShell.svelte';
	import { hydrateFromStorage, isAdmin } from '@/store/auth.store';
	import { recarregarResumo } from '@/store/resumo.store';

	interface Props {
		children: Snippet;
	}
	let { children }: Props = $props();

	onMount(() => {
		hydrateFromStorage();
		// Contadores dos badges do menu. Só para admin: o endpoint é restrito, e
		// um colaborador tomaria 403 a cada navegação.
		if (get(isAdmin)) recarregarResumo();
	});
</script>

<AppShell>
	{@render children()}
</AppShell>
