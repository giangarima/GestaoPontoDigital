<!--
  @page /admin/relatorios
  @description Espelho individual e consolidado mensal.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { SvelteMap } from 'svelte/reactivity';
	import {
		relatorioService,
		type ConsolidadoLinha,
		type ConsolidadoRelatorio
	} from '@/services/relatorio.service';
	import { colaboradorService } from '@/services/colaborador.service';
	import { baixar } from '@/services/api';
	import type { Colaborador } from '@/types/colaborador';
	import { formatHoursMinutes } from '@/utils/date';
	import EspelhoMensal from '@/components/timesheet/EspelhoMensal.svelte';
	import Avatar from '@/components/ui/Avatar.svelte';
	import Button from '@/components/ui/Button.svelte';
	import Card from '@/components/ui/Card.svelte';
	import Icon from '@/components/ui/Icon.svelte';
	import StatCard from '@/components/ui/StatCard.svelte';

	type Aba = 'espelho' | 'consolidado';

	let aba = $state<Aba>('espelho');
	let colaboradores = $state<Colaborador[]>([]);
	let errorMsg = $state('');
	let avisoMsg = $state('');

	const AVISO_SEM_ASSINATURA =
		'Arquivo gerado SEM assinatura digital (.p7s): certificado do REP não configurado no servidor.';
	const AVISO_PDF_SEM_ASSINATURA =
		'Espelho gerado SEM assinatura digital: certificado não configurado no servidor.';

	const hoje = new Date();
	const mesDefault = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;

	let espColaboradorId = $state('');
	let espMes = $state(mesDefault);
	const colaboradorSelecionado = $derived(
		colaboradores.find((c) => c.id === espColaboradorId) ?? null
	);

	let mes = $state(mesDefault);
	let conResult = $state<ConsolidadoRelatorio | null>(null);
	let conLoading = $state(false);
	let filtroDepartamentoId = $state<string>('todos');

	const departamentosDisponiveis = $derived.by(() => {
		const mapa = new SvelteMap<string, string>();
		for (const c of colaboradores) {
			if (c.departamento) mapa.set(c.departamento.id, c.departamento.nome);
		}
		return [...mapa.entries()]
			.map(([id, nome]) => ({ id, nome }))
			.sort((a, b) => a.nome.localeCompare(b.nome));
	});

	const linhasFiltradas = $derived.by(() => {
		if (!conResult) return [];
		if (filtroDepartamentoId === 'todos') return conResult.linhas;
		const idsDoDepto = new Set(
			colaboradores.filter((c) => c.departamentoId === filtroDepartamentoId).map((c) => c.id)
		);
		return conResult.linhas.filter((l) => idsDoDepto.has(l.colaboradorId));
	});

	const avatarColors = ['#2563eb', '#7c3aed', '#0891b2', '#16a34a', '#d97706'];

	type Ordem = 'cumprimento' | 'faltas' | 'diasEmAberto' | 'saldo';
	// Padrão: quem mais deve no topo.
	let ordem = $state<Ordem>('saldo');
	let asc = $state(true);

	/** Horas realizadas sobre as previstas, em %; null sem jornada. */
	const cumprimento = (horas: number, previstas: number) =>
		previstas > 0 ? Math.round((horas / previstas) * 100) : null;

	const linhasOrdenadas = $derived.by(() => {
		const valor = (l: ConsolidadoLinha) =>
			ordem === 'cumprimento' ? (cumprimento(l.horas, l.horasPrevistas) ?? Infinity) : l[ordem];
		return [...linhasFiltradas].sort(
			(a, b) =>
				(asc ? valor(a) - valor(b) : valor(b) - valor(a)) ||
				a.colaboradorNome.localeCompare(b.colaboradorNome)
		);
	});

	function ordenarPor(coluna: Ordem) {
		if (ordem === coluna) asc = !asc;
		else {
			ordem = coluna;
			// Cumprimento: o menor é o que preocupa; nas contagens, o maior.
			asc = coluna === 'cumprimento' || coluna === 'saldo';
		}
	}

	const totais = $derived.by(() => {
		const t = {
			horas: 0,
			horasPrevistas: 0,
			credito: 0,
			debito: 0,
			faltas: 0,
			comFalta: 0,
			emAberto: 0
		};
		for (const l of linhasFiltradas) {
			t.horas += l.horas;
			t.horasPrevistas += l.horasPrevistas;
			if (l.saldo > 0) t.credito += l.saldo;
			else t.debito += l.saldo;
			t.faltas += l.faltas;
			if (l.faltas > 0) t.comFalta++;
			t.emAberto += l.diasEmAberto;
		}
		return { ...t, saldo: t.credito + t.debito };
	});

	// Escala comum das barras de saldo: o maior desvio ocupa meia trilha.
	const maxSaldo = $derived(Math.max(1, ...linhasFiltradas.map((l) => Math.abs(l.saldo))));

	/** Saldo com sinal explícito: "+4h 29min", "-7h 34min". */
	const formatSaldo = (horas: number) => (horas > 0 ? '+' : '') + formatHoursMinutes(horas * 60);

	// Cor do avatar presa à pessoa (ordem alfabética da resposta), não à posição na tabela.
	const corDoColaborador = $derived(
		new Map(
			(conResult?.linhas ?? []).map((l, i) => [
				l.colaboradorId,
				avatarColors[i % avatarColors.length]
			])
		)
	);

	function abrirEspelho(colaboradorId: string) {
		espColaboradorId = colaboradorId;
		espMes = mes;
		aba = 'espelho';
	}

	async function carregarConsolidado(e?: Event) {
		e?.preventDefault();
		errorMsg = '';
		conLoading = true;
		try {
			conResult = await relatorioService.consolidado(mes);
		} catch {
			errorMsg = 'Erro ao gerar consolidado.';
		} finally {
			conLoading = false;
		}
	}

	function exportarCsv() {
		if (!conResult) return;
		const headers = [
			'Colaborador',
			'Dias',
			'Dias previstos',
			'Horas',
			'Horas previstas',
			'Faltas',
			'Em aberto',
			'Extras',
			'Déficit',
			'Saldo',
			'Férias',
			'Justificadas'
		];
		const rows = conResult.linhas.map((l) => [
			l.colaboradorNome,
			l.diasTrabalhados,
			l.diasPrevistos,
			l.horas,
			l.horasPrevistas,
			l.faltas,
			l.diasEmAberto,
			l.extras,
			l.deficit,
			l.saldo,
			l.periodosFerias,
			l.faltasJustificadas
		]);
		const csv = [headers, ...rows].map((r) => r.join(';')).join('\n');
		const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `consolidado-${conResult.mes}.csv`;
		a.click();
		URL.revokeObjectURL(url);
	}

	type Arquivo = 'afd' | 'aej' | 'espelho' | 'atestado';
	let baixando = $state<Arquivo | null>(null);

	/** Baixa um arquivo legal e avisa quando saiu sem assinatura digital. */
	async function baixarArquivo(
		qual: Arquivo,
		endpoint: string,
		nomePadrao: string,
		avisoSemAssinatura: string,
		avisoAssinado = ''
	) {
		baixando = qual;
		errorMsg = '';
		try {
			const { assinado } = await baixar(endpoint, nomePadrao);
			avisoMsg = assinado ? avisoAssinado : avisoSemAssinatura;
		} catch {
			errorMsg = `Falha ao gerar o ${nomePadrao}.`;
		} finally {
			baixando = null;
		}
	}

	function baixarAfd() {
		baixarArquivo('afd', '/relatorios/afd', 'AFD', AVISO_SEM_ASSINATURA);
	}

	function baixarAej() {
		const { inicio, fim } = limitesDoMes(mes || mesDefault);
		baixarArquivo(
			'aej',
			`/relatorios/aej?inicio=${inicio}&fim=${fim}`,
			'AEJ',
			AVISO_SEM_ASSINATURA
		);
	}

	function baixarEspelhoPdf() {
		const { inicio, fim } = limitesDoMes(espMes);
		baixarArquivo(
			'espelho',
			`/relatorios/espelho/pdf?colaboradorId=${espColaboradorId}&inicio=${inicio}&fim=${fim}`,
			'espelho de ponto',
			AVISO_PDF_SEM_ASSINATURA
		);
	}

	// Art. 89, § 2º: vale a assinatura qualificada (e-CPF) de cada responsável.
	const AVISO_ATESTADO =
		'Atestado gerado. Para ter validade, o responsável legal e o responsável técnico precisam assiná-lo com certificado ICP-Brasil (e-CPF).';

	function baixarAtestado() {
		baixarArquivo(
			'atestado',
			'/relatorios/atestado',
			'Atestado Técnico',
			AVISO_ATESTADO,
			`${AVISO_ATESTADO} A assinatura digital incluída é só de demonstração.`
		);
	}

	/** Primeiro e último dia (AAAA-MM-dd) do mês AAAA-MM. */
	function limitesDoMes(mesRef: string): { inicio: string; fim: string } {
		const [ano, mesNum] = mesRef.split('-');
		const ultimoDia = new Date(Number(ano), Number(mesNum), 0).getDate();
		return { inicio: `${mesRef}-01`, fim: `${mesRef}-${String(ultimoDia).padStart(2, '0')}` };
	}

	function initialsFromName(name: string): string {
		return name
			.split(' ')
			.filter(Boolean)
			.slice(0, 2)
			.map((p) => p[0])
			.join('')
			.toUpperCase();
	}

	onMount(async () => {
		colaboradores = await colaboradorService.listar();
	});
</script>

<svelte:head><title>Relatórios — Admin</title></svelte:head>

{#snippet th(coluna: Ordem, rotulo: string)}
	<th class="right" aria-sort={ordem === coluna ? (asc ? 'ascending' : 'descending') : 'none'}>
		<button type="button" class="th-sort" onclick={() => ordenarPor(coluna)}>
			{rotulo}
			<span class="th-sort__seta" class:is-active={ordem === coluna}>
				{ordem === coluna && !asc ? '↓' : '↑'}
			</span>
		</button>
	</th>
{/snippet}

<section class="admin-page">
	<header class="admin-page__header">
		<h1>Relatórios</h1>
		<div class="header-actions">
			{#if aba === 'consolidado' && conResult}
				<button class="export-btn" onclick={exportarCsv}>
					<Icon name="download" size={13} />
					Exportar CSV
				</button>
			{/if}
			<button
				class="export-btn"
				onclick={baixarAfd}
				disabled={baixando === 'afd'}
				title="Arquivo Fonte de Dados — Portaria 671/2021"
			>
				<Icon name="download" size={13} />
				{baixando === 'afd' ? 'Gerando…' : 'Baixar AFD'}
			</button>
			<button
				class="export-btn"
				onclick={baixarAej}
				disabled={baixando === 'aej'}
				title="Arquivo Eletrônico de Jornada — Portaria 671/2021"
			>
				<Icon name="download" size={13} />
				{baixando === 'aej' ? 'Gerando…' : 'Baixar AEJ'}
			</button>
			<button
				class="export-btn"
				onclick={baixarAtestado}
				disabled={baixando === 'atestado'}
				title="Atestado Técnico e Termo de Responsabilidade — Portaria 671/2021, art. 89"
			>
				<Icon name="download" size={13} />
				{baixando === 'atestado' ? 'Gerando…' : 'Atestado Técnico'}
			</button>
		</div>
	</header>

	<div class="tabs" role="tablist">
		<button
			class="tab"
			class:is-active={aba === 'espelho'}
			role="tab"
			aria-selected={aba === 'espelho'}
			onclick={() => (aba = 'espelho')}
		>
			Espelho individual
		</button>
		<button
			class="tab"
			class:is-active={aba === 'consolidado'}
			role="tab"
			aria-selected={aba === 'consolidado'}
			onclick={() => (aba = 'consolidado')}
		>
			Consolidado mensal
		</button>
	</div>

	{#if errorMsg}<div class="error">{errorMsg}</div>{/if}
	{#if avisoMsg}<div class="aviso" role="status">{avisoMsg}</div>{/if}

	{#if aba === 'espelho'}
		<Card>
			<div class="filtros">
				<label class="field">
					<span>Colaborador</span>
					<select bind:value={espColaboradorId}>
						<option value="">Selecione…</option>
						{#each colaboradores as c (c.id)}
							<option value={c.id}>{c.nome}</option>
						{/each}
					</select>
				</label>
				<label class="field">
					<span>Mês</span>
					<input type="month" bind:value={espMes} />
				</label>
				<button
					class="export-btn"
					onclick={baixarEspelhoPdf}
					disabled={!espColaboradorId || !espMes || baixando === 'espelho'}
					title="Espelho de Ponto Eletrônico — Portaria 671/2021, art. 84"
				>
					<Icon name="download" size={13} />
					{baixando === 'espelho' ? 'Gerando…' : 'Baixar PDF'}
				</button>
			</div>
		</Card>

		{#if espColaboradorId && colaboradorSelecionado}
			<Card>
				<EspelhoMensal
					colaboradorId={espColaboradorId}
					colaboradorNome={colaboradorSelecionado.nome}
					mes={espMes}
				/>
			</Card>
		{:else}
			<p class="muted">Selecione um colaborador para visualizar o espelho mensal.</p>
		{/if}
	{:else}
		<Card>
			<form class="filtros" onsubmit={carregarConsolidado}>
				<label class="field">
					<span>Mês</span>
					<input type="month" bind:value={mes} required />
				</label>
				<label class="field">
					<span>Departamento</span>
					<select bind:value={filtroDepartamentoId}>
						<option value="todos">Todos</option>
						{#each departamentosDisponiveis as d (d.id)}
							<option value={d.id}>{d.nome}</option>
						{/each}
					</select>
				</label>
				<Button type="submit" variant="primary" loading={conLoading}>Gerar</Button>
			</form>
		</Card>

		{#if conResult}
			<div class="stats">
				<StatCard
					tone="info"
					label="Cumprimento"
					value={cumprimento(totais.horas, totais.horasPrevistas) === null
						? '—'
						: `${cumprimento(totais.horas, totais.horasPrevistas)}%`}
					detalhe="{formatHoursMinutes(totais.horas * 60)} de {formatHoursMinutes(
						totais.horasPrevistas * 60
					)} previstas"
				/>
				<StatCard
					tone={totais.saldo < 0 ? 'danger' : 'success'}
					label="Saldo do mês"
					value={formatSaldo(totais.saldo)}
					detalhe="{formatSaldo(totais.credito)} em extras · {formatSaldo(
						totais.debito
					)} em déficit"
				/>
				<StatCard
					tone={totais.faltas > 0 ? 'danger' : 'neutral'}
					label="Faltas"
					value={totais.faltas}
					detalhe={totais.comFalta === 1 ? 'em 1 pessoa' : `em ${totais.comFalta} pessoas`}
				/>
				<StatCard
					tone={totais.emAberto > 0 ? 'warning' : 'neutral'}
					label="Dias em aberto"
					value={totais.emAberto}
					detalhe={totais.emAberto > 0 ? 'o saldo ainda pode mudar →' : 'nada a tratar'}
					href="{resolve('/admin/pendencias', {})}?mes={mes}"
				/>
			</div>

			<Card>
				<header class="card-header">
					<h2 class="card-title">Detalhamento</h2>
				</header>

				<div class="table-wrap">
					<table>
						<thead>
							<tr>
								<th>Colaborador</th>
								{@render th('cumprimento', 'Cumpr.')}
								<th class="right">Dias trab.</th>
								{@render th('faltas', 'Faltas')}
								{@render th('diasEmAberto', 'Em aberto')}
								<th class="right">Justif.</th>
								{@render th('saldo', 'Saldo do mês')}
							</tr>
						</thead>
						<tbody>
							{#each linhasOrdenadas as l (l.colaboradorId)}
								{@const pct = cumprimento(l.horas, l.horasPrevistas)}
								<tr>
									<td>
										<button
											type="button"
											class="cell-name"
											onclick={() => abrirEspelho(l.colaboradorId)}
											title="Abrir espelho de ponto"
										>
											<Avatar
												initials={initialsFromName(l.colaboradorNome)}
												size={28}
												color={corDoColaborador.get(l.colaboradorId)}
											/>
											<span>{l.colaboradorNome}</span>
										</button>
									</td>
									<td
										class="right num"
										title="{formatHoursMinutes(l.horas * 60)} de {formatHoursMinutes(
											l.horasPrevistas * 60
										)}"
									>
										{#if pct === null}<span class="dash">—</span>{:else}{pct}%{/if}
									</td>
									<td class="right">
										{l.diasTrabalhados}{#if l.diasPrevistos > 0}<span class="previsto"
												>{` / ${l.diasPrevistos}`}</span
											>{/if}
									</td>
									<td class="right">
										{#if l.faltas > 0}
											<span class="neg">{l.faltas}</span>
										{:else}
											<span class="dash">0</span>
										{/if}
									</td>
									<td class="right">
										{#if l.diasEmAberto > 0}
											<a
												class="warn"
												href="{resolve(
													'/admin/ajustes',
													{}
												)}?colaboradorId={l.colaboradorId}&mes={mes}"
												title="Tratar nos ajustes">{l.diasEmAberto}</a
											>
										{:else}
											<span class="dash">0</span>
										{/if}
									</td>
									<td class="right">
										{#if l.faltasJustificadas > 0}
											<span class="warn">{l.faltasJustificadas}</span>
										{:else}
											<span class="dash">0</span>
										{/if}
									</td>
									<td>
										<div class="saldo">
											<div class="saldo__trilha" aria-hidden="true">
												{#if l.saldo !== 0}
													<div
														class="saldo__barra"
														class:saldo__barra--neg={l.saldo < 0}
														style="width: {(Math.abs(l.saldo) / maxSaldo) * 50}%"
													></div>
												{/if}
											</div>
											<span class="saldo__valor num">
												{#if l.saldo !== 0}
													<span class={l.saldo > 0 ? 'pos' : 'neg'}>{formatSaldo(l.saldo)}</span>
												{:else}
													<span class="dash">—</span>
												{/if}
											</span>
										</div>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</Card>
		{/if}
	{/if}
</section>

<style>
	.header-actions {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}

	.export-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.5rem 0.875rem;
		border-radius: var(--radius-sm);
		background: var(--color-border-soft);
		border: 1px solid var(--color-border);
		color: var(--color-text-muted);
		font-size: 0.8125rem;
		font-weight: 600;
		cursor: pointer;
		font-family: inherit;
	}

	.tabs {
		display: flex;
		gap: 0.5rem;
		border-bottom: 1px solid var(--color-border);
	}

	.tab {
		background: none;
		border: none;
		padding: 0.75rem 1rem;
		font-size: 0.9rem;
		cursor: pointer;
		color: var(--color-text-muted);
		border-bottom: 2px solid transparent;
		font-family: inherit;
	}

	.tab.is-active {
		color: var(--color-primary);
		border-bottom-color: var(--color-primary);
		font-weight: 600;
	}

	.filtros {
		display: flex;
		gap: 0.75rem;
		align-items: flex-end;
		flex-wrap: wrap;
	}

	.filtros > .field {
		flex: 1;
		min-width: 180px;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		font-size: 0.8125rem;
		font-weight: 600;
		color: var(--color-text-secondary);
	}

	.field input,
	.field select {
		padding: 0.625rem 0.875rem;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: 0.9375rem;
		color: var(--color-text);
		font-family: inherit;
		background: var(--color-surface);
	}

	.stats {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 0.75rem;
	}

	@media (max-width: 700px) {
		.stats {
			grid-template-columns: repeat(2, 1fr);
		}
	}

	.card-title {
		margin: 0;
		font-size: 0.9375rem;
		font-weight: 700;
		color: var(--color-text);
	}

	.card-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1rem;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.table-wrap {
		overflow-x: auto;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.875rem;
	}

	th {
		text-align: left;
		padding: 0.5rem 0.75rem;
		color: var(--color-text-subtle);
		font-weight: 700;
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		border-bottom: 2px solid var(--color-border-soft);
		white-space: nowrap;
	}

	th.right,
	td.right {
		text-align: right;
	}

	td {
		padding: 0.75rem;
		border-bottom: 1px solid var(--color-surface-muted);
	}

	td.num {
		font-variant-numeric: tabular-nums;
		font-weight: 700;
		color: var(--color-text);
	}

	.cell-name {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-weight: 600;
		color: var(--color-text);
		background: none;
		border: none;
		padding: 0;
		font: inherit;
		font-weight: 600;
		cursor: pointer;
		text-align: left;
	}

	.cell-name:hover span {
		color: var(--color-primary);
		text-decoration: underline;
	}

	.th-sort {
		background: none;
		border: none;
		padding: 0;
		font: inherit;
		color: inherit;
		text-transform: inherit;
		letter-spacing: inherit;
		cursor: pointer;
		display: inline-flex;
		/* Seta à esquerda: invisível até o hover, ela ainda ocupa espaço, e à direita
		   afastava o título da borda em que os números se alinham. */
		flex-direction: row-reverse;
		align-items: center;
		gap: 0.25rem;
	}

	.th-sort__seta {
		opacity: 0;
		transition: opacity 0.15s;
	}

	.th-sort:hover .th-sort__seta {
		opacity: 0.4;
	}

	.th-sort__seta.is-active {
		opacity: 1;
		color: var(--color-primary);
	}

	/* Saldo do mês: barra divergente com o zero no centro + valor com sinal. */
	.saldo {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		min-width: 15rem;
	}

	.saldo__trilha {
		position: relative;
		flex: 1;
		height: 0.5rem;
		border-radius: var(--radius-pill);
		background: var(--color-surface-muted);
	}

	.saldo__trilha::after {
		content: '';
		position: absolute;
		left: 50%;
		top: -0.25rem;
		bottom: -0.25rem;
		width: 1px;
		background: var(--color-border-strong);
	}

	.saldo__barra {
		position: absolute;
		top: 0;
		bottom: 0;
		left: 50%;
		border-radius: 0 var(--radius-pill) var(--radius-pill) 0;
		background: var(--color-success);
	}

	.saldo__barra--neg {
		left: auto;
		right: 50%;
		border-radius: var(--radius-pill) 0 0 var(--radius-pill);
		background: var(--color-danger);
	}

	.saldo__valor {
		width: 6.5rem;
		text-align: right;
		font-variant-numeric: tabular-nums;
	}

	a.warn {
		text-decoration: none;
	}

	a.warn:hover {
		text-decoration: underline;
	}

	.pos {
		color: var(--color-success);
		font-weight: 600;
	}

	.neg {
		color: var(--color-danger);
		font-weight: 600;
	}

	.warn {
		color: var(--color-warning);
		font-weight: 600;
	}

	.dash {
		color: var(--color-border-strong);
	}

	.previsto {
		color: var(--color-text-muted);
		font-weight: 500;
	}

	.muted {
		color: var(--color-text-muted);
		margin: 0;
	}

	h2 {
		margin: 0 0 0.5rem;
		font-size: 1rem;
		font-weight: 700;
	}

	.error {
		background: var(--color-danger-bg);
		color: var(--color-danger);
		padding: 0.75rem 1rem;
		border-radius: var(--radius-sm);
	}

	.aviso {
		background: var(--color-warning-soft);
		color: var(--color-warning-strong);
		border: 1px solid var(--color-warning-soft-border);
		padding: 0.75rem 1rem;
		border-radius: var(--radius-sm);
	}
</style>
