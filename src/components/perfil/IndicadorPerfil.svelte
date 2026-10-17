<!--
  @component IndicadorPerfil
  @description Cartão de um indicador do perfil: rótulo, valor e a variação contra
  o período anterior. A cor da variação diz se melhorou ou piorou (não o sinal) e
  vem sempre com seta e texto, nunca só a cor.
-->
<script lang="ts">
	import type { Variacao } from '@/utils/perfil';

	interface Props {
		rotulo: string;
		valor: string;
		/** Contexto do número ("3 de 41 dias"). */
		detalhe?: string;
		variacao?: Variacao | null;
		/** Destaque de problema no período (ex.: houve falta). */
		alerta?: boolean;
	}

	let { rotulo, valor, detalhe = '', variacao = null, alerta = false }: Props = $props();

	const SETA = { melhor: '▲', pior: '▼', igual: '•' } as const;
	const TEXTO = { melhor: 'melhor', pior: 'pior', igual: 'sem mudança' } as const;
</script>

<div class="indicador" class:indicador--alerta={alerta}>
	<span class="indicador__rotulo">{rotulo}</span>
	<span class="indicador__valor">{valor}</span>
	{#if detalhe}<span class="indicador__detalhe">{detalhe}</span>{/if}
	{#if variacao}
		<span class="indicador__var indicador__var--{variacao.sentido}">
			<span aria-hidden="true">{SETA[variacao.sentido]}</span>
			{variacao.sentido === 'igual'
				? TEXTO.igual
				: `${variacao.texto} · ${TEXTO[variacao.sentido]}`}
			<span class="indicador__ref">vs. período anterior</span>
		</span>
	{/if}
</div>

<style>
	.indicador {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		padding: 1rem 1.125rem;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		min-width: 0;
	}
	.indicador--alerta {
		border-left: 3px solid var(--color-warning);
	}
	.indicador__rotulo {
		font-size: 0.8125rem;
		color: var(--color-text-muted);
	}
	.indicador__valor {
		font-size: 1.625rem;
		font-weight: 600;
		color: var(--color-text);
		line-height: 1.2;
	}
	.indicador__detalhe {
		font-size: 0.8125rem;
		color: var(--color-text-subtle);
	}
	.indicador__var {
		display: inline-flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.25rem;
		font-size: 0.75rem;
		font-weight: 600;
	}
	.indicador__var--melhor {
		color: var(--color-success-strong);
	}
	.indicador__var--pior {
		color: var(--color-danger-strong);
	}
	.indicador__var--igual {
		color: var(--color-text-muted);
	}
	.indicador__ref {
		font-weight: 400;
		color: var(--color-text-subtle);
	}
</style>
