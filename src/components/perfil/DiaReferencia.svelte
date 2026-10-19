<!--
  @component DiaReferencia
  @description Card do dia no perfil: hoje (ou o último dia com expediente), as
  batidas contra o horário previsto, a situação em poucas palavras e uma leitura
  do dia à luz do período. A cor sempre vem acompanhada de texto ("+1h16",
  "curto", "admin").
-->
<script lang="ts">
	import type { PerfilColaborador } from '@/services/perfil.service';
	import { diaDaSemana, diaMes, formatMinutos } from '@/utils/perfil';

	interface Props {
		dado: NonNullable<PerfilColaborador['dia']>;
	}

	let { dado }: Props = $props();

	const d = $derived(dado.dia);
	const meioPeriodo = $derived(d.previstas.length === 2);
	const rotulos = $derived(
		meioPeriodo ? ['Entrada', 'Saída'] : ['Entrada', 'Saída intervalo', 'Volta intervalo', 'Saída']
	);
	const extras = $derived(Math.max(0, d.marcacoes.length + d.posicaoInicial - rotulos.length));

	interface Bloco {
		rotulo: string;
		hora: string | null;
		incluida: boolean;
		detalhe: string;
		destaque: 'atraso' | 'curto' | null;
	}

	const blocos = $derived<Bloco[]>(
		rotulos.map((rotulo, i) => {
			const ultimo = i === rotulos.length - 1;
			// Entrada esquecida: as marcações começam na posição em que caem.
			const m = d.marcacoes[i - d.posicaoInicial] ?? null;
			const previsto = d.previstas[i] ?? null;
			const base = { rotulo, hora: m?.hora ?? null, incluida: m?.incluida ?? false };

			if (i === 0 && d.desvios.atrasoEntrada)
				return {
					...base,
					detalhe: `${formatMinutos(d.desvios.entradaMin!, true)} · previsto ${previsto}`,
					destaque: 'atraso'
				};
			if (i === 2 && !meioPeriodo && d.desvios.voltaAtrasada)
				return {
					...base,
					detalhe: `Intervalo de ${formatMinutos(d.desvios.intervaloMin!)} · ${formatMinutos(d.desvios.voltaMin!, true)}`,
					destaque: 'atraso'
				};
			if (i === 2 && !meioPeriodo && d.desvios.intervaloMin !== null)
				return {
					...base,
					detalhe: `Intervalo de ${formatMinutos(d.desvios.intervaloMin)}${d.desvios.intervaloCurto ? ' · curto' : ''}`,
					destaque: d.desvios.intervaloCurto ? 'curto' : null
				};
			if (ultimo && extras > 0)
				return {
					...base,
					detalhe: `+${extras} ${extras === 1 ? 'marcação' : 'marcações'} no dia`,
					destaque: null
				};
			return { ...base, detalhe: previsto ? `Previsto ${previsto}` : '', destaque: null };
		})
	);

	const alerta = $derived(dado.chip.tom === 'aviso' || dado.chip.tom === 'alerta');
</script>

<section class="dia" class:dia--alerta={alerta} aria-labelledby="dia-titulo">
	<header class="dia__topo">
		<h2 id="dia-titulo">
			{dado.rotulo === 'hoje' ? 'Hoje' : 'Último dia'}
			<span class="dia__data">{diaDaSemana(d.dia)}, {diaMes(d.dia)}</span>
		</h2>
		<span class="chip chip--{dado.chip.tom}">
			<span class="chip__ponto" aria-hidden="true"></span>
			{dado.chip.texto}
		</span>
	</header>

	{#if d.previstas.length === 0 && d.marcacoes.length === 0}
		<p class="dia__vazio">Sem horário previsto e sem batida no dia.</p>
	{:else}
		<div class="blocos" class:blocos--dois={meioPeriodo}>
			{#each blocos as b (b.rotulo)}
				<div class="bloco" class:bloco--atraso={b.destaque === 'atraso'}>
					<span class="bloco__rotulo">{b.rotulo}</span>
					<span class="bloco__hora" class:bloco__hora--atraso={b.destaque === 'atraso'}>
						{#if b.hora}
							<span
								class:incluida={b.incluida}
								title={b.incluida ? 'Incluída pelo admin' : undefined}>{b.hora}</span
							>
							{#if b.incluida}<span class="tag">admin</span>{/if}
						{:else}
							—
						{/if}
					</span>
					{#if b.detalhe}
						<span
							class="bloco__detalhe"
							class:bloco__detalhe--atraso={b.destaque === 'atraso'}
							class:bloco__detalhe--curto={b.destaque === 'curto'}>{b.detalhe}</span
						>
					{/if}
				</div>
			{/each}
		</div>
	{/if}

	{#if dado.leitura}
		<p class="dia__leitura">{dado.leitura}</p>
	{/if}
</section>

<style>
	.dia {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding: 1.25rem;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-card);
	}
	.dia--alerta {
		border-color: var(--color-warning-soft-border);
	}
	.dia__topo {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		align-items: center;
		gap: 0.5rem 1rem;
	}
	.dia__topo h2 {
		margin: 0;
		font-size: 1rem;
		font-weight: 700;
		color: var(--color-text);
	}
	.dia__data {
		margin-left: 0.5rem;
		font-size: 0.8125rem;
		font-weight: 400;
		color: var(--color-text-muted);
	}
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.9375rem;
		font-weight: 600;
	}
	.chip__ponto {
		width: 0.5rem;
		height: 0.5rem;
		border-radius: 50%;
		background: currentColor;
	}
	.chip--aviso {
		color: var(--color-warning);
	}
	.chip--alerta {
		color: var(--color-danger);
	}
	.chip--ok {
		color: var(--color-success);
	}
	.chip--neutro {
		color: var(--color-text-muted);
	}
	.blocos {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 0.75rem;
	}
	.blocos--dois {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
	.bloco {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		padding: 0.75rem 0.875rem;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		background: var(--color-surface-muted);
		min-width: 0;
	}
	.bloco--atraso {
		border-color: var(--color-warning-soft-border);
		background: var(--color-warning-bg);
	}
	.bloco__rotulo {
		font-size: 0.8125rem;
		color: var(--color-text-muted);
	}
	.bloco__hora {
		display: flex;
		align-items: baseline;
		gap: 0.375rem;
		font-size: 1.5rem;
		font-weight: 700;
		color: var(--color-text);
		font-variant-numeric: tabular-nums;
	}
	.bloco__hora--atraso {
		color: var(--color-warning);
	}
	.bloco__detalhe {
		font-size: 0.8125rem;
		color: var(--color-text-subtle);
	}
	.bloco__detalhe--atraso {
		color: var(--color-warning-strong);
	}
	.bloco__detalhe--curto {
		color: var(--color-danger);
	}
	.incluida {
		text-decoration: underline dashed;
		text-underline-offset: 0.2em;
		text-decoration-thickness: 1px;
	}
	.tag {
		font-size: 0.75rem;
		font-weight: 400;
		color: var(--color-text-subtle);
	}
	.dia__leitura {
		margin: 0;
		font-size: 0.875rem;
		color: var(--color-text);
		line-height: 1.5;
	}
	.dia__vazio {
		margin: 0;
		font-size: 0.875rem;
		color: var(--color-text-muted);
	}
	@media (max-width: 640px) {
		.blocos {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
</style>
