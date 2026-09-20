<!--
  @component LinhaAtencao
  @description Uma pendência do bloco "Precisa de atenção": ícone, o que houve,
  os fatos que sustentam a afirmação e a ação que resolve.

  O `ApprovalCard` não serve aqui — ele é construído em torno de avatar e de
  expandir/recolher, e estas linhas são ícone + ação direta, sem nada a expandir.
-->
<script lang="ts">
	import Icon, { type IconName } from '@/components/ui/Icon.svelte';

	type Tone = 'danger' | 'warning' | 'info' | 'neutral';

	interface Props {
		icone: IconName;
		tone?: Tone;
		titulo: string;
		/** Os fatos que sustentam o título ("Previsto 08:30 · sem registro há 2h12"). */
		detalhe?: string;
		acaoRotulo: string;
		/** Link da ação. Com `onclick`, vira botão. */
		href?: string;
		onclick?: () => void;
	}

	let {
		icone,
		tone = 'neutral',
		titulo,
		detalhe = '',
		acaoRotulo,
		href,
		onclick
	}: Props = $props();
</script>

<div class="linha">
	<span class="linha__icone linha__icone--{tone}" aria-hidden="true">
		<Icon name={icone} size={18} />
	</span>

	<span class="linha__texto">
		<span class="linha__titulo">{titulo}</span>
		{#if detalhe}<span class="linha__detalhe">{detalhe}</span>{/if}
	</span>

	{#if href}
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- o href chega pronto por prop; quem monta a linha é que chama resolve() -->
		<a class="linha__acao" {href}>{acaoRotulo}</a>
	{:else}
		<button type="button" class="linha__acao" {onclick}>{acaoRotulo}</button>
	{/if}
</div>

<style>
	.linha {
		display: flex;
		align-items: center;
		gap: 0.875rem;
		padding: 0.875rem 0;
		border-bottom: 1px solid var(--color-border-soft);
	}

	.linha:last-child {
		border-bottom: none;
	}

	.linha__icone {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2.25rem;
		height: 2.25rem;
		flex-shrink: 0;
		border-radius: var(--radius-sm);
	}

	.linha__icone--danger {
		background: var(--color-danger-bg);
		color: var(--color-danger);
	}
	.linha__icone--warning {
		background: var(--color-warning-bg);
		color: var(--color-warning);
	}
	.linha__icone--info {
		background: var(--color-info-bg);
		color: var(--color-info);
	}
	.linha__icone--neutral {
		background: var(--color-surface-muted);
		color: var(--color-text-muted);
	}

	.linha__texto {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
		flex: 1;
		min-width: 0;
	}

	.linha__titulo {
		font-size: 0.9375rem;
		font-weight: 600;
		color: var(--color-text);
	}

	.linha__detalhe {
		font-size: 0.8125rem;
		color: var(--color-text-muted);
	}

	.linha__acao {
		flex-shrink: 0;
		padding: 0.5rem 0.875rem;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		background: var(--color-surface);
		color: var(--color-text);
		font: inherit;
		font-size: 0.8125rem;
		font-weight: 600;
		text-decoration: none;
		cursor: pointer;
		white-space: nowrap;
		transition: border-color 0.12s ease;
	}

	.linha__acao:hover {
		border-color: var(--color-primary);
	}

	@media (max-width: 640px) {
		.linha {
			flex-wrap: wrap;
		}

		.linha__acao {
			margin-left: 3.125rem;
		}
	}
</style>
