<!--
  @page /admin/colaboradores/[id]
  @description Perfil do colaborador para o dono do negócio: como a pessoa marca
  o ponto ao longo do tempo — pontualidade e tendência de atraso, assiduidade,
  horas, banco e local da batida —, contra o período anterior de mesmo tamanho.
  Tudo vem da mesma apuração do espelho (ver `src/lib/server/perfil/`).
-->
<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import Avatar from '@/components/ui/Avatar.svelte';
	import Card from '@/components/ui/Card.svelte';
	import IndicadorPerfil from '@/components/perfil/IndicadorPerfil.svelte';
	import GraficoColunas, { type ItemColuna } from '@/components/perfil/GraficoColunas.svelte';
	import CalendarioDias from '@/components/perfil/CalendarioDias.svelte';
	import {
		perfilService,
		type FaixaChegada,
		type PerfilColaborador,
		type PeriodoPerfil
	} from '@/services/perfil.service';
	import { formatDia, formatMinutos, rotuloSerie, variacao } from '@/utils/perfil';

	const PERIODOS: { id: PeriodoPerfil; rotulo: string }[] = [
		{ id: '30d', rotulo: '30 dias' },
		{ id: '3m', rotulo: '3 meses' },
		{ id: '6m', rotulo: '6 meses' },
		{ id: '12m', rotulo: '12 meses' }
	];
	const DIA_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
	const FAIXAS: { id: FaixaChegada; rotulo: string }[] = [
		{ id: 'antes', rotulo: 'Antes' },
		{ id: 'pontual', rotulo: 'No horário' },
		{ id: 'ate15', rotulo: '6–15 min' },
		{ id: 'ate30', rotulo: '16–30 min' },
		{ id: 'acima30', rotulo: '+30 min' }
	];

	const colaboradorId = $derived(page.params.id!);
	let periodo = $state<PeriodoPerfil>('3m');
	let dados = $state<PerfilColaborador | null>(null);
	let carregando = $state(false);
	let erro = $state('');

	$effect(() => {
		const id = colaboradorId;
		const p = periodo;
		carregando = true;
		erro = '';
		perfilService
			.get(id, p)
			.then((r) => (dados = r))
			.catch(() => {
				erro = 'Não foi possível carregar o perfil.';
				dados = null;
			})
			.finally(() => (carregando = false));
	});

	const resumo = $derived(dados?.perfil.resumo);
	const anterior = $derived(dados?.resumoAnterior);

	function iniciais(nome: string): string {
		return nome
			.split(' ')
			.filter(Boolean)
			.slice(0, 2)
			.map((p) => p[0])
			.join('')
			.toUpperCase();
	}

	const pct = (v: number | null) =>
		v === null ? '—' : `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
	const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

	const serie = $derived<ItemColuna[]>(
		(dados?.perfil.serie ?? []).map((p) => ({
			rotulo: rotuloSerie(p.chave, dados!.granularidade),
			valor: p.percentualAtraso,
			dica:
				p.percentualAtraso === null
					? 'Sem dia avaliado'
					: `${pct(p.percentualAtraso)} com atraso · ${p.diasComAtraso} de ${p.diasAvaliados} dias` +
						(p.atrasoMedioMin !== null ? ` · média ${formatMinutos(p.atrasoMedioMin)}` : '')
		}))
	);

	// Seg a sáb sempre; domingo só se a pessoa trabalha nele.
	const porDiaSemana = $derived<ItemColuna[]>(
		[1, 2, 3, 4, 5, 6, 0]
			.map((d) => dados?.perfil.porDiaSemana[d])
			.filter((p) => p && (p.diaSemana !== 0 || p.diasAvaliados > 0))
			.map((p) => ({
				rotulo: DIA_SEMANA[p!.diaSemana],
				valor: p!.percentualAtraso,
				dica:
					p!.percentualAtraso === null
						? 'Sem dia avaliado'
						: `${pct(p!.percentualAtraso)} com atraso · ${p!.diasComAtraso} de ${p!.diasAvaliados} dias`
			}))
	);

	const chegada = $derived.by<ItemColuna[]>(() => {
		const c = dados?.perfil.chegada;
		if (!c) return [];
		const total = Object.values(c).reduce((s, n) => s + n, 0);
		return FAIXAS.map((f) => ({
			rotulo: f.rotulo,
			valor: c[f.id],
			dica: `${plural(c[f.id], 'dia', 'dias')}${total ? ` · ${pct(Math.round((c[f.id] / total) * 1000) / 10)}` : ''}`
		}));
	});

	const queryEspelho = $derived(
		dados ? `?colaboradorId=${colaboradorId}&mes=${dados.atual.fim.slice(0, 7)}` : ''
	);
</script>

<svelte:head><title>{dados?.colaborador.nome ?? 'Perfil'} — Admin</title></svelte:head>

<section class="admin-page perfil">
	<a class="voltar" href={resolve('/admin/colaboradores', {})}>← Colaboradores</a>

	{#if erro}
		<div class="erro" role="alert">{erro}</div>
	{/if}

	{#if dados && resumo && anterior}
		{@const c = dados.colaborador}
		<header class="cabecalho">
			<div class="pessoa">
				<Avatar initials={iniciais(c.nome)} size={56} />
				<div>
					<h1>{c.nome}</h1>
					<p class="pessoa__sub">
						{[c.cargo, c.departamento, c.jornada && `Jornada ${c.jornada}`]
							.filter(Boolean)
							.join(' · ') || 'Sem cargo e departamento'}
					</p>
					<p class="pessoa__sub">
						{c.admissao ? `Admissão em ${formatDia(c.admissao)}` : 'Admissão não informada'}
						{#if c.desligamento}· <strong>Desligado em {formatDia(c.desligamento)}</strong>{/if}
					</p>
				</div>
			</div>
			<div class="acoes">
				<div class="periodos" role="group" aria-label="Período">
					{#each PERIODOS as p (p.id)}
						<button
							type="button"
							class="periodo"
							class:periodo--ativo={periodo === p.id}
							aria-pressed={periodo === p.id}
							disabled={carregando}
							onclick={() => (periodo = p.id)}>{p.rotulo}</button
						>
					{/each}
				</div>
				<p class="intervalo">
					{formatDia(dados.atual.inicio)} a {formatDia(dados.atual.fim)}
				</p>
				<div class="links">
					<a href="{resolve('/admin/ajustes', {})}{queryEspelho}">Ver espelho</a>
					<a href={resolve('/admin/banco-horas', {})}>Banco de horas</a>
				</div>
			</div>
		</header>

		{#if dados.perfil.semJornada}
			<div class="aviso" role="status">
				Sem jornada cadastrada: não há horário contratual para medir atraso, faltas e horas.
			</div>
		{/if}

		<div class="indicadores">
			<IndicadorPerfil
				rotulo="Pontualidade"
				valor={pct(resumo.pontualidade.percentualNoHorario)}
				detalhe={resumo.pontualidade.diasAvaliados
					? `${resumo.pontualidade.diasAvaliados - resumo.pontualidade.diasComAtraso} de ${plural(resumo.pontualidade.diasAvaliados, 'dia', 'dias')} no horário`
					: 'Nenhum dia avaliado no período'}
				variacao={variacao(
					resumo.pontualidade.percentualNoHorario,
					anterior.pontualidade.percentualNoHorario,
					{ menorEhMelhor: false, unidade: 'pp' }
				)}
			/>
			<IndicadorPerfil
				rotulo="Atraso médio"
				valor={resumo.pontualidade.atrasoMedioMin === null
					? '—'
					: formatMinutos(resumo.pontualidade.atrasoMedioMin)}
				detalhe={resumo.pontualidade.maiorAtrasoMin === null
					? 'Sem atrasos no período'
					: `Maior: ${formatMinutos(resumo.pontualidade.maiorAtrasoMin)} · total ${formatMinutos(resumo.pontualidade.atrasoTotalMin)}`}
				variacao={variacao(
					resumo.pontualidade.atrasoMedioMin,
					anterior.pontualidade.atrasoMedioMin,
					{ menorEhMelhor: true, unidade: 'min' }
				)}
			/>
			<IndicadorPerfil
				rotulo="Faltas"
				valor={String(resumo.assiduidade.faltas)}
				detalhe={`em ${plural(resumo.assiduidade.diasPrevistos, 'dia previsto', 'dias previstos')}`}
				alerta={resumo.assiduidade.faltas > 0}
				variacao={variacao(resumo.assiduidade.faltas, anterior.assiduidade.faltas, {
					menorEhMelhor: true
				})}
			/>
			<IndicadorPerfil
				rotulo="Dias em aberto"
				valor={String(resumo.assiduidade.diasEmAberto)}
				detalhe="Batida esquecida (marcação ímpar)"
				alerta={resumo.assiduidade.diasEmAberto > 0}
				variacao={variacao(resumo.assiduidade.diasEmAberto, anterior.assiduidade.diasEmAberto, {
					menorEhMelhor: true
				})}
			/>
			<IndicadorPerfil
				rotulo="Banco de horas"
				valor={dados.banco ? formatMinutos(dados.banco.saldoMin, true) : '—'}
				detalhe={dados.banco
					? `Ciclo ${formatDia(dados.banco.inicio)} a ${formatDia(dados.banco.fim)}`
					: 'A empresa não usa banco de horas'}
			/>
			<IndicadorPerfil
				rotulo="Batidas fora do local"
				valor={resumo.local.conferidas ? String(resumo.local.fora) : '—'}
				detalhe={resumo.local.conferidas
					? `${plural(resumo.local.semLocalizacao, 'sem localização', 'sem localização')} · ${resumo.local.conferidas} conferidas`
					: 'Sem conferência de local no período'}
				alerta={resumo.local.fora + resumo.local.semLocalizacao > 0}
				variacao={resumo.local.conferidas && anterior.local.conferidas
					? variacao(resumo.local.fora, anterior.local.fora, { menorEhMelhor: true })
					: null}
			/>
		</div>

		<Card>
			<GraficoColunas
				titulo={`Dias com atraso, por ${dados.granularidade === 'mes' ? 'mês' : 'semana'} (%)`}
				itens={serie}
				maximo={100}
				formatarEixo={(v) => `${v}%`}
			/>
		</Card>

		<div class="duas">
			<Card>
				<GraficoColunas
					titulo="Atraso por dia da semana (%)"
					itens={porDiaSemana}
					maximo={100}
					formatarEixo={(v) => `${v}%`}
				/>
			</Card>
			<Card>
				<GraficoColunas
					titulo="Chegada em relação ao horário (dias)"
					itens={chegada}
					formatarEixo={(v) => String(Math.round(v))}
				/>
			</Card>
		</div>

		<Card>
			<h2 class="secao">Dia a dia</h2>
			<CalendarioDias dias={dados.perfil.dias} {colaboradorId} />
		</Card>

		<div class="duas">
			<Card>
				<h2 class="secao">Horas</h2>
				<dl class="lista">
					<dt>Realizado</dt>
					<dd>{formatMinutos(resumo.horas.realizadoMin)}</dd>
					<dt>Previsto</dt>
					<dd>{formatMinutos(resumo.horas.previstoMin)}</dd>
					<dt>Extras</dt>
					<dd>{formatMinutos(resumo.horas.extraMin)}</dd>
					<dt>Déficit</dt>
					<dd>{formatMinutos(resumo.horas.deficitMin)}</dd>
					<dt>Saídas antecipadas</dt>
					<dd>
						{resumo.horas.saidasAntecipadas}
						{#if resumo.horas.saidaAntecipadaMediaMin !== null}
							<span class="sub">média {formatMinutos(resumo.horas.saidaAntecipadaMediaMin)}</span>
						{/if}
					</dd>
					<dt>Intervalo curto</dt>
					<dd>
						{resumo.horas.intervalosCurtos}
						<span class="sub">menos que o previsto (art. 71)</span>
					</dd>
					<dt>Intervalo longo</dt>
					<dd>{resumo.horas.intervalosLongos}</dd>
				</dl>
			</Card>
			<Card>
				<h2 class="secao">Assiduidade e tratamento</h2>
				<dl class="lista">
					<dt>Atestado</dt>
					<dd>{plural(resumo.assiduidade.diasAtestado, 'dia', 'dias')}</dd>
					<dt>Férias</dt>
					<dd>{plural(resumo.assiduidade.diasFerias, 'dia', 'dias')}</dd>
					<dt>Outras ausências</dt>
					<dd>{plural(resumo.assiduidade.diasOutrasAusencias, 'dia', 'dias')}</dd>
					<dt>Marcações incluídas pelo admin</dt>
					<dd>
						{resumo.assiduidade.inclusoes}
						<span class="sub">batida esquecida lançada depois</span>
					</dd>
					<dt>Marcações desconsideradas</dt>
					<dd>{resumo.assiduidade.desconsideradas}</dd>
				</dl>
				<p class="nota">
					A batida incluída pelo admin costuma entrar no horário previsto: um atraso naquele dia não
					aparece na pontualidade.
				</p>
			</Card>
		</div>
	{:else if carregando}
		<p class="vazio">Carregando…</p>
	{/if}
</section>

<style>
	.voltar {
		font-size: 0.875rem;
		color: var(--color-text-muted);
		text-decoration: none;
		align-self: flex-start;
	}
	.voltar:hover {
		color: var(--color-text);
	}
	.cabecalho {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		gap: 1rem 2rem;
	}
	.pessoa {
		display: flex;
		gap: 1rem;
		align-items: flex-start;
		min-width: 0;
	}
	.pessoa h1 {
		margin: 0;
		font-size: 1.625rem;
		font-weight: 700;
		color: var(--color-text);
	}
	.pessoa__sub {
		margin: 0.125rem 0 0;
		font-size: 0.875rem;
		color: var(--color-text-muted);
	}
	.acoes {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 0.375rem;
	}
	.periodos {
		display: inline-flex;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		overflow: hidden;
	}
	.periodo {
		padding: 0.375rem 0.75rem;
		border: none;
		background: var(--color-surface);
		color: var(--color-text-muted);
		font-size: 0.8125rem;
		cursor: pointer;
	}
	.periodo + .periodo {
		border-left: 1px solid var(--color-border);
	}
	.periodo--ativo {
		background: var(--color-primary-soft);
		color: var(--color-primary-soft-fg);
		font-weight: 600;
	}
	.intervalo {
		margin: 0;
		font-size: 0.75rem;
		color: var(--color-text-subtle);
	}
	.links {
		display: flex;
		gap: 1rem;
		font-size: 0.875rem;
	}
	.links a {
		color: var(--color-primary);
	}
	.indicadores {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
		gap: 0.75rem;
	}
	.duas {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
		gap: 1.5rem;
	}
	.secao {
		margin: 0 0 0.75rem;
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--color-text);
	}
	.lista {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 0.5rem 1.5rem;
		margin: 0;
		font-size: 0.875rem;
	}
	.lista dt {
		color: var(--color-text-muted);
	}
	.lista dd {
		margin: 0;
		color: var(--color-text);
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}
	.sub {
		font-weight: 400;
		color: var(--color-text-subtle);
		margin-left: 0.375rem;
	}
	.nota {
		margin: 1rem 0 0;
		font-size: 0.75rem;
		color: var(--color-text-subtle);
	}
	.aviso {
		background: var(--color-warning-bg);
		color: var(--color-warning-strong);
		padding: 0.75rem 1rem;
		border-radius: var(--radius-sm);
		font-size: 0.875rem;
	}
	.erro {
		background: var(--color-danger-bg);
		color: var(--color-danger);
		padding: 0.75rem 1rem;
		border-radius: var(--radius-sm);
	}
	.vazio {
		color: var(--color-text-muted);
	}
	@media (max-width: 640px) {
		.acoes {
			align-items: flex-start;
		}
		.duas {
			grid-template-columns: 1fr;
		}
	}
</style>
