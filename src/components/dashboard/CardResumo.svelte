<!--
  @component CardResumo
  @description Card de contagem do painel, clicável para filtrar a lista.

  O `StatCard` de `ui/` só mostra rótulo e valor. Aqui é preciso mais três
  coisas: uma frase com os nomes por trás do número, um estado selecionado (o
  card é o filtro da lista abaixo) e uma barra de proporção no card de presença.
-->
<script lang="ts">
	import Icon from '@/components/ui/Icon.svelte';

	type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

	interface Props {
		rotulo: string;
		valor: number | string;
		/** Frase com os nomes por trás do número — o que dá utilidade à contagem. */
		descricao?: string;
		tone?: Tone;
		/** Barra de proporção (ex.: 8 de 12 previstos). */
		progresso?: { atual: number; total: number };
		/** Card selecionado: o filtro correspondente está aplicado na lista. */
		ativo?: boolean;
		onclick?: () => void;
	}

	let {
		rotulo,
		valor,
		descricao = '',
		tone = 'neutral',
		progresso,
		ativo = false,
		onclick
	}: Props = $props();

	const pct = $derived(
		progresso && progresso.total > 0
			? Math.min(100, Math.round((progresso.atual / progresso.total) * 100))
			: 0
	);
</script>

<button
	type="button"
	class="card card--{tone}"
	class:card--ativo={ativo}
	{onclick}
	aria-pressed={ativo}
>
	<span class="card__topo">
		<span class="card__rotulo">{rotulo}</span>
		<span class="card__seta" aria-hidden="true"><Icon name="chevron-right" size={16} /></span>
	</span>

	<span class="card__valor">
		{valor}
		{#if progresso}
			<small class="card__de">de {progresso.total} previstos</small>
		{/if}
	</span>

	{#if progresso}
		<span class="card__barra" aria-hidden="true">
			<span class="card__barra-cheia" style="width: {pct}%"></span>
		</span>
	{/if}

	{#if descricao}
		<span class="card__descricao">{descricao}</span>
	{/if}
</button>

<style>
	.card {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		width: 100%;
		padding: 1rem;
		border-radius: var(--radius-md);
		border: 1px solid transparent;
		font: inherit;
		text-align: left;
		cursor: pointer;
		transition:
			box-shadow 0.12s ease,
			border-color 0.12s ease;
	}

	.card:hover {
		box-shadow: var(--shadow-card);
	}

	/* Selecionado: contorno, para o card e o chip da lista contarem a mesma história. */
	.card--ativo {
		border-color: currentColor;
		box-shadow: var(--shadow-card);
	}

	.card--success {
		background: var(--color-success-bg);
		color: var(--color-success);
	}
	.card--warning {
		background: var(--color-warning-bg);
		color: var(--color-warning);
	}
	.card--danger {
		background: var(--color-danger-bg);
		color: var(--color-danger);
	}
	.card--info {
		background: var(--color-info-bg);
		color: var(--color-info);
	}
	.card--neutral {
		background: var(--color-surface-muted);
		color: var(--color-text-muted);
	}

	.card__topo {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}

	.card__rotulo {
		font-size: 0.72rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		opacity: 0.85;
	}

	.card__seta {
		display: inline-flex;
		opacity: 0.6;
	}

	.card__valor {
		display: flex;
		align-items: baseline;
		gap: 0.375rem;
		font-size: 1.75rem;
		font-weight: 800;
		font-variant-numeric: tabular-nums;
		line-height: 1.1;
	}

	.card__de {
		font-size: 0.75rem;
		font-weight: 600;
		opacity: 0.75;
	}

	.card__barra {
		display: block;
		height: 4px;
		border-radius: var(--radius-pill);
		background: currentColor;
		opacity: 0.2;
	}

	.card__barra-cheia {
		display: block;
		height: 100%;
		border-radius: var(--radius-pill);
		background: currentColor;
	}

	.card__descricao {
		font-size: 0.75rem;
		line-height: 1.35;
		opacity: 0.9;
	}
</style>
