<!--
  @component CartaoPerfil
  @description Card de um indicador do período no perfil: rótulo, valor em
  destaque, uma linha de contexto e um rodapé com o que entrou (ou não) na conta.
-->
<script lang="ts">
	interface Props {
		rotulo: string;
		valor: string;
		linha?: string;
		rodape?: string;
		/** `alerta` pinta o valor na cor de atenção (sempre com texto ao lado). */
		tom?: 'normal' | 'alerta';
	}

	let { rotulo, valor, linha = '', rodape = '', tom = 'normal' }: Props = $props();
</script>

<div class="cartao">
	<span class="cartao__rotulo">{rotulo}</span>
	<span class="cartao__valor" class:cartao__valor--alerta={tom === 'alerta'}>{valor}</span>
	{#if linha}<span class="cartao__linha">{linha}</span>{/if}
	{#if rodape}<span class="cartao__rodape">{rodape}</span>{/if}
</div>

<style>
	.cartao {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		padding: 1rem 1.125rem;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-card);
		min-width: 0;
	}
	.cartao__rotulo {
		font-size: 0.875rem;
		color: var(--color-text-muted);
	}
	.cartao__valor {
		font-size: 1.625rem;
		font-weight: 700;
		color: var(--color-text);
		font-variant-numeric: tabular-nums;
		line-height: 1.2;
	}
	.cartao__valor--alerta {
		color: var(--color-warning);
	}
	.cartao__linha {
		font-size: 0.8125rem;
		color: var(--color-text);
	}
	.cartao__rodape {
		font-size: 0.75rem;
		color: var(--color-text-subtle);
	}
</style>
