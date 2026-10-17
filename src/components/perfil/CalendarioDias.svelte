<!--
  @component CalendarioDias
  @description Um quadrado por dia do período, em colunas de semana (seg–dom).
  Só os problemas ganham cor forte — atraso, falta e dia em aberto (tokens
  `--color-dia-*`, validados para daltonismo nos dois temas); o resto fica neutro. A cor
  nunca vem sozinha: legenda com contagem, dica com a data e a situação, e
  clique leva ao espelho do mês em Ajustes.
-->
<script lang="ts">
	import { resolve } from '$app/paths';
	import type { DiaPerfil, SituacaoDiaPerfil } from '@/services/perfil.service';
	import { formatDia, formatMinutos } from '@/utils/perfil';

	interface Props {
		dias: DiaPerfil[];
		colaboradorId: string;
	}

	let { dias, colaboradorId }: Props = $props();

	const ROTULO: Record<SituacaoDiaPerfil, string> = {
		atraso: 'Atraso',
		falta: 'Falta',
		aberto: 'Dia em aberto',
		no_horario: 'No horário',
		ausencia: 'Férias/atestado',
		folga: 'Folga',
		sem_jornada: 'Sem jornada',
		fora_vinculo: 'Fora do vínculo'
	};
	const LEGENDA: SituacaoDiaPerfil[] = [
		'atraso',
		'falta',
		'aberto',
		'no_horario',
		'ausencia',
		'folga'
	];
	const SEMANA = ['Seg', '', 'Qua', '', 'Sex', '', 'Dom'];

	/** Colunas de semana; o primeiro dia entra na linha do seu dia da semana. */
	const semanas = $derived.by(() => {
		const cols: (DiaPerfil | null)[][] = [];
		let col: (DiaPerfil | null)[] = [];
		for (const d of dias) {
			const linha = (new Date(`${d.dia}T12:00:00Z`).getUTCDay() + 6) % 7; // seg = 0
			if (col.length === 0) col = Array(linha).fill(null);
			col.push(d);
			if (linha === 6) {
				cols.push(col);
				col = [];
			}
		}
		if (col.length) cols.push(col);
		return cols;
	});

	const contagem = $derived(
		dias.reduce(
			(acc, d) => ({ ...acc, [d.situacao]: (acc[d.situacao] ?? 0) + 1 }),
			{} as Partial<Record<SituacaoDiaPerfil, number>>
		)
	);

	function dica(d: DiaPerfil): string {
		let texto = `${formatDia(d.dia)} · ${ROTULO[d.situacao]}`;
		if (d.situacao === 'atraso' && d.chegadaMin !== null)
			texto += ` (${formatMinutos(d.chegadaMin)})`;
		return texto;
	}

	const queryMes = (dia: string) => `?colaboradorId=${colaboradorId}&mes=${dia.slice(0, 7)}`;
</script>

<div class="calendario">
	<div class="grade" role="group" aria-label="Dias do período">
		<div class="semana semana--rotulos" aria-hidden="true">
			{#each SEMANA as s, i (i)}<span class="rotulo">{s}</span>{/each}
		</div>
		{#each semanas as semana, i (i)}
			<div class="semana">
				{#each semana as d, j (j)}
					{#if d}
						<a
							class="dia dia--{d.situacao}"
							href="{resolve('/admin/ajustes', {})}{queryMes(d.dia)}"
							title={dica(d)}
							aria-label={dica(d)}
						></a>
					{:else}
						<span class="dia dia--vazio" aria-hidden="true"></span>
					{/if}
				{/each}
			</div>
		{/each}
	</div>

	<ul class="legenda">
		{#each LEGENDA as s (s)}
			<li>
				<span class="dia dia--{s}" aria-hidden="true"></span>
				{ROTULO[s]} <strong>{contagem[s] ?? 0}</strong>
			</li>
		{/each}
	</ul>
</div>

<style>
	.grade {
		display: flex;
		gap: 3px;
		overflow-x: auto;
		padding-bottom: 0.25rem;
	}
	.semana {
		display: grid;
		grid-template-rows: repeat(7, 14px);
		gap: 3px;
	}
	.semana--rotulos {
		margin-right: 0.25rem;
	}
	.rotulo {
		font-size: 10px;
		line-height: 14px;
		color: var(--color-text-subtle);
	}
	.dia {
		display: block;
		width: 14px;
		height: 14px;
		border-radius: 3px;
	}
	a.dia:focus-visible {
		outline: 2px solid var(--color-text);
		outline-offset: 1px;
	}
	.dia--atraso {
		background: var(--color-dia-atraso);
	}
	.dia--falta {
		background: var(--color-dia-falta);
	}
	.dia--aberto {
		background: var(--color-dia-aberto);
	}
	.dia--no_horario {
		background: var(--color-success-border);
	}
	.dia--ausencia {
		background: var(--color-border-strong);
	}
	.dia--folga,
	.dia--sem_jornada {
		background: var(--color-border);
	}
	.dia--fora_vinculo {
		border: 1px dashed var(--color-border);
	}
	.dia--vazio {
		visibility: hidden;
	}

	.legenda {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem 1rem;
		list-style: none;
		margin: 0.75rem 0 0;
		padding: 0;
		font-size: 0.8125rem;
		color: var(--color-text-muted);
	}
	.legenda li {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
	}
	.legenda strong {
		color: var(--color-text);
		font-weight: 600;
	}
</style>
