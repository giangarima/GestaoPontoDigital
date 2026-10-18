<!--
  @component SemanaTabela
  @description A semana do dia de referência no perfil: uma linha por dia com
  expediente (ou com batida), as quatro marcações e o total. Atraso, intervalo
  curto, batida faltando e inclusão do admin aparecem com cor E texto. O total do
  dia com ajuste ou batida faltando fica "—": não é confiável.
-->
<script lang="ts">
	import type { DiaDetalhe, SemanaPerfil } from '@/services/perfil.service';
	import { diaDaSemana, diaMes, formatMinutos } from '@/utils/perfil';

	interface Props {
		semana: SemanaPerfil;
		titulo: string;
		/** Dia de referência, realçado na tabela. */
		destaque: string;
	}

	let { semana, titulo, destaque }: Props = $props();

	const ROTULO_AUSENCIA: Record<string, string> = {
		ferias: 'Férias',
		atestado: 'Atestado',
		folga: 'Folga compensatória'
	};

	interface Celula {
		hora: string | null;
		incluida: boolean;
		/** Texto abaixo da hora: "+1h38", "curto", "faltando". */
		nota: string;
		tom: 'atraso' | 'curto' | 'faltando' | null;
	}

	/** As 4 colunas do dia. Meio período (2 previstas) vai para Entrada e Saída. */
	function celulas(d: DiaDetalhe): Celula[] {
		const vazia: Celula = { hora: null, incluida: false, nota: '', tom: null };
		const cols: Celula[] = [0, 1, 2, 3].map(() => ({ ...vazia }));
		const posicoes = d.previstas.length === 2 && d.marcacoes.length <= 2 ? [0, 3] : [0, 1, 2, 3];
		d.marcacoes.slice(0, 4).forEach((m, i) => {
			const col = posicoes[i];
			if (col !== undefined)
				cols[col] = { hora: m.hora, incluida: m.incluida, nota: '', tom: null };
		});
		if (d.desvios.atrasoEntrada)
			cols[0] = { ...cols[0], nota: formatMinutos(d.desvios.entradaMin!, true), tom: 'atraso' };
		if (d.desvios.voltaAtrasada)
			cols[2] = { ...cols[2], nota: formatMinutos(d.desvios.voltaMin!, true), tom: 'atraso' };
		else if (d.desvios.intervaloCurto) cols[2] = { ...cols[2], nota: 'curto', tom: 'curto' };
		if (d.situacao === 'aberto') {
			const previstas = d.previstas.length === 2 ? [0, 3] : [0, 1, 2, 3];
			for (const col of previstas)
				if (!cols[col].hora) cols[col] = { ...cols[col], nota: 'faltando', tom: 'faltando' };
		}
		const extras = d.marcacoes.length - 4;
		if (extras > 0) cols[3] = { ...cols[3], nota: `+${extras} marcações` };
		return cols;
	}

	function rotuloDoDia(d: DiaDetalhe): string | null {
		if (d.situacao === 'falta') return 'Falta';
		if (d.situacao === 'ausencia') return ROTULO_AUSENCIA[d.ausenciaTipo ?? ''] ?? 'Ausência';
		if (d.situacao === 'feriado') return d.feriado ? `Feriado · ${d.feriado}` : 'Feriado';
		return null;
	}

	function porQueSemTotal(d: DiaDetalhe): string {
		if (d.ajuste) return 'Dia com ajuste do admin: fora do total';
		if (d.situacao === 'aberto') return 'Batida faltando: fora do total';
		if (d.situacao === 'em_andamento') return 'Dia em andamento';
		return '';
	}

	const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
</script>

<section class="semana" aria-labelledby="semana-titulo">
	<header class="semana__topo">
		<h2 id="semana-titulo">
			{titulo}
			<span class="semana__datas">{diaMes(semana.inicio)} a {diaMes(semana.fim)}</span>
		</h2>
		<p class="semana__resumo">
			<span>
				<strong>{formatMinutos(semana.realizadoMin)}</strong>
				de {formatMinutos(semana.previstoMin)}
				{#if semana.diasForaDaConta > 0}
					· sem {plural(semana.diasForaDaConta, 'dia', 'dias')} de ajuste
				{/if}
			</span>
			<span
				><strong class:numero--atraso={semana.atrasosEntrada > 0}>{semana.atrasosEntrada}</strong>
				{semana.atrasosEntrada === 1 ? 'atraso' : 'atrasos'} na entrada</span
			>
			<span
				><strong class:numero--atraso={semana.voltasAtrasadas > 0}>{semana.voltasAtrasadas}</strong>
				{semana.voltasAtrasadas === 1 ? 'volta atrasada' : 'voltas atrasadas'}</span
			>
			<span
				><strong class:numero--falta={semana.faltas > 0}>{semana.faltas}</strong>
				{semana.faltas === 1 ? 'falta' : 'faltas'}</span
			>
		</p>
	</header>

	{#if semana.dias.length === 0}
		<p class="semana__vazio">Nenhum dia com expediente na semana até aqui.</p>
	{:else}
		<div class="rolagem">
			<table>
				<thead>
					<tr>
						<th scope="col">Dia</th>
						<th scope="col">Entrada</th>
						<th scope="col">Saída intervalo</th>
						<th scope="col">Volta intervalo</th>
						<th scope="col">Saída</th>
						<th scope="col" class="num">Total</th>
					</tr>
				</thead>
				<tbody>
					{#each semana.dias as d (d.dia)}
						{@const rotulo = rotuloDoDia(d)}
						<tr class:ref={d.dia === destaque}>
							<th scope="row">{diaDaSemana(d.dia)} {diaMes(d.dia)}</th>
							{#if rotulo}
								<td colspan="4" class="rotulo" class:rotulo--falta={d.situacao === 'falta'}
									>{rotulo}</td
								>
							{:else}
								{#each celulas(d) as c, i (i)}
									<td>
										{#if c.hora}
											<span
												class="hora"
												class:hora--atraso={c.tom === 'atraso'}
												class:incluida={c.incluida}
												title={c.incluida ? 'Incluída pelo admin' : undefined}>{c.hora}</span
											>
										{:else}
											<span class="hora hora--vazia">—</span>
										{/if}
										{#if c.nota}
											<span class="nota nota--{c.tom ?? 'neutra'}">{c.nota}</span>
										{:else if c.incluida}
											<span class="nota nota--neutra">admin</span>
										{/if}
									</td>
								{/each}
							{/if}
							<td class="num">
								{#if d.totalMin !== null}
									<strong>{formatMinutos(d.totalMin)}</strong>
								{:else if d.situacao === 'falta'}
									<span class="sem-total">0 min</span>
								{:else}
									<span class="sem-total" title={porQueSemTotal(d)}>—</span>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}

	<footer class="legenda">
		<span><span class="marca marca--atraso" aria-hidden="true"></span>Atraso</span>
		<span><span class="marca marca--faltando" aria-hidden="true"></span>Batida faltando</span>
		<span><span class="incluida">08:30</span> Incluída pelo admin</span>
		<span>— Total fora da conta (ajuste ou batida faltando)</span>
	</footer>
</section>

<style>
	.semana {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: 1.25rem;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-card);
		min-width: 0;
	}
	.semana__topo {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		align-items: baseline;
		gap: 0.5rem 1.5rem;
	}
	.semana__topo h2 {
		margin: 0;
		font-size: 1rem;
		font-weight: 700;
		color: var(--color-text);
	}
	.semana__datas {
		margin-left: 0.5rem;
		font-size: 0.8125rem;
		font-weight: 400;
		color: var(--color-text-muted);
	}
	.semana__resumo {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 1.25rem;
		margin: 0;
		font-size: 0.8125rem;
		color: var(--color-text-muted);
	}
	.semana__resumo strong {
		font-size: 1rem;
		color: var(--color-text);
		font-variant-numeric: tabular-nums;
	}
	.semana__resumo strong.numero--atraso {
		color: var(--color-warning);
	}
	.semana__resumo strong.numero--falta {
		color: var(--color-danger);
	}
	.rolagem {
		overflow-x: auto;
	}
	table {
		width: 100%;
		min-width: 560px;
		border-collapse: collapse;
		font-size: 0.875rem;
	}
	th,
	td {
		text-align: left;
		padding: 0.625rem 0.75rem;
		border-bottom: 1px solid var(--color-border-soft);
		vertical-align: top;
	}
	thead th {
		font-size: 0.75rem;
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--color-text-subtle);
	}
	tbody th {
		font-weight: 400;
		color: var(--color-text-muted);
		white-space: nowrap;
	}
	tr.ref {
		background: var(--color-surface-muted);
	}
	.num {
		text-align: right;
		font-variant-numeric: tabular-nums;
	}
	.hora {
		display: block;
		font-weight: 600;
		color: var(--color-text);
		font-variant-numeric: tabular-nums;
	}
	.hora--atraso {
		color: var(--color-warning);
	}
	.hora--vazia {
		font-weight: 400;
		color: var(--color-text-subtle);
	}
	.nota {
		display: block;
		font-size: 0.75rem;
	}
	.nota--atraso {
		color: var(--color-warning-strong);
	}
	.nota--curto {
		color: var(--color-danger);
	}
	.nota--faltando {
		color: var(--color-dia-aberto);
	}
	.nota--neutra {
		color: var(--color-text-subtle);
	}
	.incluida {
		text-decoration: underline dashed;
		text-underline-offset: 0.2em;
		text-decoration-thickness: 1px;
	}
	.rotulo {
		color: var(--color-text-muted);
	}
	.rotulo--falta {
		color: var(--color-danger);
		font-weight: 600;
	}
	.sem-total {
		color: var(--color-text-subtle);
	}
	.semana__vazio {
		margin: 0;
		font-size: 0.875rem;
		color: var(--color-text-muted);
	}
	.legenda {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem 1.25rem;
		font-size: 0.75rem;
		color: var(--color-text-muted);
	}
	.legenda > span {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
	}
	.marca {
		width: 0.625rem;
		height: 0.625rem;
		border-radius: 2px;
	}
	.marca--atraso {
		background: var(--color-dia-atraso);
	}
	.marca--faltando {
		background: var(--color-dia-aberto);
	}
</style>
