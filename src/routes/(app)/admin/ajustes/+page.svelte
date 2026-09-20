<!--
  @page /admin/ajustes
  @description Ajuste de marcações de um colaborador.

  Ferramenta de edição separada do espelho (que é somente leitura): permite
  corrigir batidas (ajuste vinculado), anular avulso e cadastrar batida manual.
  Reaproveita o grid EspelhoMensal em modo `editavel`.

  Aceita `?colaboradorId=&mes=` para abrir já posicionada — é assim que
  /admin/pendencias entrega o dia em aberto pronto para tratamento.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { colaboradorService } from '@/services/colaborador.service';
	import type { Colaborador } from '@/types/colaborador';
	import EspelhoMensal from '@/components/timesheet/EspelhoMensal.svelte';
	import Card from '@/components/ui/Card.svelte';

	let colaboradores = $state<Colaborador[]>([]);
	let errorMsg = $state('');

	const hoje = new Date();
	const mesDefault = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;

	// Pré-seleção por query string, para /admin/pendencias linkar direto no dia
	// que precisa de tratamento.
	let colaboradorId = $state(page.url.searchParams.get('colaboradorId') ?? '');
	let mes = $state(page.url.searchParams.get('mes') ?? mesDefault);
	const colaboradorSelecionado = $derived(
		colaboradores.find((c) => c.id === colaboradorId) ?? null
	);

	onMount(async () => {
		try {
			colaboradores = await colaboradorService.listar();
		} catch {
			errorMsg = 'Erro ao carregar colaboradores.';
		}
	});
</script>

<svelte:head><title>Ajuste de marcações — Admin</title></svelte:head>

<section class="admin-page">
	<header class="admin-page__header">
		<h1>Ajuste de marcações</h1>
	</header>

	{#if errorMsg}<div class="error">{errorMsg}</div>{/if}

	<Card>
		<div class="filtros">
			<label class="field">
				<span>Colaborador</span>
				<select bind:value={colaboradorId}>
					<option value="">Selecione…</option>
					{#each colaboradores as c (c.id)}
						<option value={c.id}>{c.nome}</option>
					{/each}
				</select>
			</label>
			<label class="field">
				<span>Mês</span>
				<input type="month" bind:value={mes} />
			</label>
		</div>
	</Card>

	{#if colaboradorId && colaboradorSelecionado}
		<Card>
			<EspelhoMensal editavel {colaboradorId} colaboradorNome={colaboradorSelecionado.nome} {mes} />
		</Card>
	{:else}
		<p class="muted">Selecione um colaborador para ajustar as marcações.</p>
	{/if}
</section>

<style>
	.filtros {
		display: flex;
		gap: 0.75rem;
		align-items: flex-end;
		flex-wrap: wrap;
	}

	.filtros > .field {
		flex: 1;
		min-width: 180px;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		font-size: 0.8125rem;
		font-weight: 600;
		color: #374151;
	}

	.field input,
	.field select {
		padding: 0.625rem 0.875rem;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: 0.9375rem;
		color: var(--color-text);
		font-family: inherit;
		background: var(--color-surface);
	}

	.muted {
		color: var(--color-text-muted);
		font-size: 0.9rem;
		line-height: 1.5;
	}

	.error {
		background: #fef2f2;
		color: #b91c1c;
		padding: 0.625rem 0.875rem;
		border-radius: var(--radius-sm);
		font-size: 0.875rem;
	}
</style>
