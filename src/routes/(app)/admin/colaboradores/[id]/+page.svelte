<!--
  @page /admin/colaboradores/[id]
  @description Perfil do colaborador para o dono do negócio, em três alturas: o
  dia (hoje, ou o último com expediente), a semana dele e quatro cards do período
  — presença, pontualidade, onde atrasa e saldo de horas. Regras em
  `src/lib/server/perfil/montar.ts`.
-->
<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import Avatar from '@/components/ui/Avatar.svelte';
	import CartaoPerfil from '@/components/perfil/CartaoPerfil.svelte';
	import DiaReferencia from '@/components/perfil/DiaReferencia.svelte';
	import SemanaTabela from '@/components/perfil/SemanaTabela.svelte';
	import {
		perfilService,
		type CardsPerfil,
		type PerfilColaborador,
		type PeriodoPerfil
	} from '@/services/perfil.service';
	import { formatDia, formatMinutos } from '@/utils/perfil';

	const PERIODOS: { id: PeriodoPerfil; rotulo: string; titulo: string }[] = [
		{ id: '30d', rotulo: '30 dias', titulo: 'Últimos 30 dias' },
		{ id: '3m', rotulo: '3 meses', titulo: 'Últimos 3 meses' },
		{ id: '6m', rotulo: '6 meses', titulo: 'Últimos 6 meses' },
		{ id: '12m', rotulo: '12 meses', titulo: 'Últimos 12 meses' }
	];

	const colaboradorId = $derived(page.params.id!);
	let periodo = $state<PeriodoPerfil>('30d');
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

	/** "a, b e c". */
	function lista(itens: string[]): string {
		return itens.length <= 1
			? (itens[0] ?? '')
			: `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}`;
	}

	/** Segunda-feira da semana corrente, no calendário de Brasília. */
	function segundaDaSemanaAtual(): string {
		const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(
			new Date()
		);
		const meioDia = Date.parse(`${hoje}T12:00:00Z`);
		const recuo = (new Date(meioDia).getUTCDay() + 6) % 7;
		return new Date(meioDia - recuo * 86_400_000).toISOString().slice(0, 10);
	}

	function textosCards(c: CardsPerfil) {
		const { presenca, pontualidade, ondeAtrasa, saldo } = c;

		const excluidos = [
			plural(presenca.ferias, 'dia de férias', 'dias de férias'),
			...(presenca.atestado
				? [plural(presenca.atestado, 'dia de atestado', 'dias de atestado')]
				: []),
			...(presenca.outrasAusencias
				? [plural(presenca.outrasAusencias, 'dia de outra ausência', 'dias de outras ausências')]
				: []),
			plural(presenca.folgas, 'folga', 'folgas')
		];

		const ONDE = {
			entrada: 'Na entrada',
			volta: 'Na volta do intervalo',
			ambos: 'Na entrada e na volta',
			nenhum: 'Sem atrasos'
		} as const;
		const tipico = [
			ondeAtrasa.tipicoEntradaMin !== null &&
				`${formatMinutos(ondeAtrasa.tipicoEntradaMin, true)} na entrada`,
			ondeAtrasa.tipicoVoltaMin !== null &&
				`${formatMinutos(ondeAtrasa.tipicoVoltaMin, true)} na volta`
		].filter(Boolean);

		const fora = [
			saldo.diasComAjuste && plural(saldo.diasComAjuste, 'dia com ajuste', 'dias com ajuste'),
			saldo.diasComBatidaFaltando &&
				plural(saldo.diasComBatidaFaltando, 'com batida faltando', 'com batida faltando')
		].filter(Boolean);

		return {
			presenca: {
				valor: `${presenca.diasComMarcacao} de ${presenca.diasPrevistos}`,
				linha: `${pct(presenca.percentual)} dos dias previstos · ${plural(presenca.faltas, 'falta', 'faltas')}`,
				rodape: `Exclui ${lista(excluidos)}`
			},
			pontualidade: {
				valor: pct(pontualidade.percentual),
				linha: `${pontualidade.diasSemAtraso} de ${plural(pontualidade.diasAvaliados, 'dia', 'dias')} sem atraso`,
				rodape: 'Considera entrada e volta do intervalo, fora os dias com ajuste'
			},
			ondeAtrasa: {
				valor: ONDE[ondeAtrasa.onde],
				linha: `${plural(ondeAtrasa.entradas, 'entrada', 'entradas')} · ${plural(ondeAtrasa.voltas, 'volta', 'voltas')} do intervalo`,
				rodape: tipico.length ? `Típico: ${tipico.join(' · ')}` : 'Nenhum atraso no período'
			},
			saldo: {
				valor: formatMinutos(saldo.saldoMin, true),
				linha: `${formatMinutos(saldo.realizadoMin)} feitas de ${formatMinutos(saldo.previstoMin)} previstas`,
				rodape: fora.length
					? `Fora da conta: ${fora.join(' · ')} (o espelho conta esses dias)`
					: 'Todos os dias trabalhados entraram na conta'
			}
		};
	}

	const textos = $derived(dados ? textosCards(dados.cards) : null);
	const tituloPeriodo = $derived(PERIODOS.find((p) => p.id === periodo)!.titulo);
	const queryEspelho = $derived(
		dados ? `?colaboradorId=${colaboradorId}&mes=${dados.intervalo.fim.slice(0, 7)}` : ''
	);
</script>

<svelte:head><title>{dados?.colaborador.nome ?? 'Perfil'} — Admin</title></svelte:head>

<section class="admin-page perfil">
	<a class="voltar" href={resolve('/admin/colaboradores', {})}>← Colaboradores</a>

	{#if erro}
		<div class="erro" role="alert">{erro}</div>
	{/if}

	{#if dados && textos}
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
						{#if c.desligamento}· <strong>Desligado em {formatDia(c.desligamento)}</strong>{/if}
					</p>
				</div>
			</div>
			<nav class="links" aria-label="Atalhos">
				<a href="{resolve('/admin/ajustes', {})}{queryEspelho}">Ver espelho</a>
				<a href={resolve('/admin/banco-horas', {})}>Banco de horas</a>
			</nav>
		</header>

		{#if dados.semJornada}
			<div class="aviso" role="status">
				Sem jornada cadastrada: não há horário contratual para medir atraso, faltas e horas.
			</div>
		{/if}

		{#if dados.dia}
			<DiaReferencia dado={dados.dia} />
		{:else}
			<div class="aviso" role="status">
				Nenhum dia com expediente nas últimas três semanas (férias, afastamento ou desligamento).
			</div>
		{/if}

		{#if dados.semana && dados.dia}
			<SemanaTabela
				semana={dados.semana}
				destaque={dados.dia.dia.dia}
				titulo={dados.semana.inicio === segundaDaSemanaAtual()
					? 'Esta semana'
					: 'Semana do último dia'}
			/>
		{/if}

		<div class="periodo">
			<h2>
				{tituloPeriodo}
				<span class="periodo__datas"
					>{formatDia(dados.intervalo.inicio)} a {formatDia(dados.intervalo.fim)}</span
				>
			</h2>
			<div class="periodos" role="group" aria-label="Período">
				{#each PERIODOS as p (p.id)}
					{@const disponivel = dados.periodosDisponiveis.includes(p.id)}
					<button
						type="button"
						class="periodo-btn"
						class:periodo-btn--ativo={periodo === p.id}
						aria-pressed={periodo === p.id}
						disabled={carregando || !disponivel}
						title={disponivel ? undefined : 'Maior que o tempo de casa'}
						onclick={() => (periodo = p.id)}>{p.rotulo}</button
					>
				{/each}
			</div>
		</div>

		<div class="cards">
			<CartaoPerfil
				rotulo="Presença"
				valor={textos.presenca.valor}
				linha={textos.presenca.linha}
				rodape={textos.presenca.rodape}
				tom={dados.cards.presenca.faltas > 0 ? 'alerta' : 'normal'}
			/>
			<CartaoPerfil
				rotulo="Pontualidade"
				valor={textos.pontualidade.valor}
				linha={textos.pontualidade.linha}
				rodape={textos.pontualidade.rodape}
				tom={(dados.cards.pontualidade.percentual ?? 100) < 80 ? 'alerta' : 'normal'}
			/>
			<CartaoPerfil
				rotulo="Onde atrasa"
				valor={textos.ondeAtrasa.valor}
				linha={textos.ondeAtrasa.linha}
				rodape={textos.ondeAtrasa.rodape}
				tom={dados.cards.ondeAtrasa.onde === 'nenhum' ? 'normal' : 'alerta'}
			/>
			<CartaoPerfil
				rotulo="Saldo de horas"
				valor={textos.saldo.valor}
				linha={textos.saldo.linha}
				rodape={textos.saldo.rodape}
			/>
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
		align-items: center;
		gap: 1rem 2rem;
	}
	.pessoa {
		display: flex;
		gap: 1rem;
		align-items: center;
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
	.links {
		display: flex;
		gap: 1rem;
		font-size: 0.875rem;
	}
	.links a {
		color: var(--color-primary);
	}
	.periodo {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		align-items: center;
		gap: 0.75rem;
		margin-top: 0.5rem;
	}
	.periodo h2 {
		margin: 0;
		font-size: 1rem;
		font-weight: 700;
		color: var(--color-text);
	}
	.periodo__datas {
		margin-left: 0.5rem;
		font-size: 0.8125rem;
		font-weight: 400;
		color: var(--color-text-muted);
	}
	.periodos {
		display: inline-flex;
		gap: 0.25rem;
		padding: 0.25rem;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		background: var(--color-surface);
	}
	.periodo-btn {
		padding: 0.375rem 0.75rem;
		border: none;
		border-radius: calc(var(--radius-sm) - 2px);
		background: transparent;
		color: var(--color-text-muted);
		font-size: 0.8125rem;
		cursor: pointer;
	}
	.periodo-btn--ativo {
		background: var(--color-primary-soft);
		color: var(--color-primary-soft-fg);
		font-weight: 600;
	}
	.periodo-btn:disabled {
		cursor: not-allowed;
		opacity: 0.45;
	}
	.periodo-btn--ativo:disabled {
		opacity: 1;
	}
	.cards {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
		gap: 0.75rem;
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
</style>
