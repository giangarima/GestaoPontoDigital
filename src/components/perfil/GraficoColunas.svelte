<!--
  @component GraficoColunas
  @description Gráfico de colunas de uma série só (SVG, sem dependência). Uma cor
  — o título diz o que está plotado, então não há legenda. Cada coluna tem dica no
  hover; no teclado e no leitor de tela os valores ficam na tabela de "Ver dados".
  Coluna sem dado (`valor: null`) não é desenhada, mas mantém o lugar no eixo.
-->
<script lang="ts">
	export interface ItemColuna {
		rotulo: string;
		valor: number | null;
		/** Texto da dica e da tabela (o valor já formatado, com contexto). */
		dica: string;
	}

	interface Props {
		titulo: string;
		itens: ItemColuna[];
		/** Topo fixo do eixo (ex.: 100 para percentual); sem ele, o maior valor. */
		maximo?: number;
		formatarEixo?: (v: number) => string;
		altura?: number;
	}

	let { titulo, itens, maximo, formatarEixo = (v) => String(v), altura = 180 }: Props = $props();

	const ESQ = 40;
	const DIR = 8;
	const TOPO = 12;
	const BASE = 24;

	let largura = $state(0);
	let ativo = $state<number | null>(null);

	const topo = $derived.by(() => {
		if (maximo !== undefined) return maximo;
		const m = Math.max(0, ...itens.map((i) => i.valor ?? 0));
		if (m === 0) return 1;
		// Arredonda para um número "limpo" acima do maior valor.
		const passo = 10 ** Math.floor(Math.log10(m));
		return Math.ceil(m / passo) * passo;
	});
	const plotW = $derived(Math.max(0, largura - ESQ - DIR));
	const plotH = $derived(altura - TOPO - BASE);
	const banda = $derived(itens.length ? plotW / itens.length : 0);
	const barraW = $derived(Math.max(4, Math.min(24, banda - 4)));
	const y = (v: number) => TOPO + plotH - (v / topo) * plotH;
	const ticks = $derived([0, topo / 2, topo]);
	// Rótulos do eixo X sem encavalar: ~1 a cada 44px.
	const saltoRotulo = $derived(Math.max(1, Math.ceil(44 / Math.max(banda, 1))));

	/** Coluna com o topo arredondado (4px) e a base reta. */
	function coluna(x: number, v: number): string {
		const h = Math.max(1, plotH - (y(v) - TOPO));
		const r = Math.min(4, barraW / 2, h);
		const b = TOPO + plotH;
		const t = b - h;
		return `M${x},${b} V${t + r} Q${x},${t} ${x + r},${t} H${x + barraW - r} Q${x + barraW},${t} ${x + barraW},${t + r} V${b} Z`;
	}
</script>

<figure class="grafico">
	<figcaption class="grafico__titulo">{titulo}</figcaption>
	<div class="grafico__area" bind:clientWidth={largura}>
		{#if largura > 0}
			<svg width={largura} height={altura} role="list" aria-label={titulo}>
				{#each ticks as t (t)}
					<line class="grade" x1={ESQ} x2={largura - DIR} y1={y(t)} y2={y(t)} />
					<text class="eixo" x={ESQ - 6} y={y(t) + 4} text-anchor="end">{formatarEixo(t)}</text>
				{/each}
				{#each itens as item, i (i)}
					{@const x0 = ESQ + i * banda}
					{@const xb = x0 + (banda - barraW) / 2}
					<g
						role="listitem"
						aria-label={item.dica}
						onpointerenter={() => (ativo = i)}
						onpointerleave={() => (ativo = null)}
					>
						<rect class="alvo" x={x0} y={TOPO} width={banda} height={plotH} />
						{#if item.valor !== null && item.valor > 0}
							<path class="barra" class:barra--ativa={ativo === i} d={coluna(xb, item.valor)} />
						{/if}
					</g>
					{#if i % saltoRotulo === 0}
						<text class="eixo" x={x0 + banda / 2} y={altura - 6} text-anchor="middle"
							>{item.rotulo}</text
						>
					{/if}
				{/each}
			</svg>
			{#if ativo !== null}
				{@const item = itens[ativo]}
				<div
					class="dica"
					style="left: {Math.min(
						Math.max(ESQ + ativo * banda + banda / 2, 70),
						largura - 70
					)}px; top: {y(item.valor ?? 0) - 6}px"
					role="tooltip"
				>
					<strong>{item.dica}</strong>
					<span>{item.rotulo}</span>
				</div>
			{/if}
		{/if}
	</div>
	<details class="grafico__dados">
		<summary>Ver dados</summary>
		<table>
			<tbody>
				{#each itens as item, i (i)}
					<tr><th scope="row">{item.rotulo}</th><td>{item.dica}</td></tr>
				{/each}
			</tbody>
		</table>
	</details>
</figure>

<style>
	.grafico {
		margin: 0;
		min-width: 0;
	}
	.grafico__titulo {
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--color-text);
		margin-bottom: 0.5rem;
	}
	.grafico__area {
		position: relative;
		width: 100%;
	}
	svg {
		display: block;
		overflow: visible;
	}
	.grade {
		stroke: var(--color-border-soft);
		stroke-width: 1;
	}
	.eixo {
		fill: var(--color-text-subtle);
		font-size: 11px;
		font-variant-numeric: tabular-nums;
	}
	.alvo {
		fill: transparent;
		cursor: default;
	}
	.barra {
		fill: var(--color-primary);
	}
	.barra--ativa {
		fill: var(--color-primary-hover);
	}
	.dica {
		position: absolute;
		transform: translate(-50%, -100%);
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
		padding: 0.375rem 0.625rem;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		box-shadow: 0 4px 12px rgba(15, 23, 42, 0.12);
		font-size: 0.75rem;
		color: var(--color-text-muted);
		white-space: nowrap;
		pointer-events: none;
		z-index: 2;
	}
	.dica strong {
		color: var(--color-text);
		font-size: 0.8125rem;
	}
	.grafico__dados {
		margin-top: 0.5rem;
		font-size: 0.8125rem;
		color: var(--color-text-muted);
	}
	.grafico__dados summary {
		cursor: pointer;
	}
	.grafico__dados table {
		margin-top: 0.5rem;
		border-collapse: collapse;
	}
	.grafico__dados th,
	.grafico__dados td {
		padding: 0.125rem 0.75rem 0.125rem 0;
		text-align: left;
		font-weight: 400;
	}
</style>
