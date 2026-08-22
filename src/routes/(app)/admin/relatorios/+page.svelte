<!--
  @page /admin/relatorios
  @description Espelho individual e consolidado mensal.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import { relatorioService, type ConsolidadoRelatorio } from '@/services/relatorio.service';
	import { colaboradorService } from '@/services/colaborador.service';
	import type { Colaborador } from '@/types/colaborador';
	import { formatHoursMinutes } from '@/utils/date';
	import EspelhoMensal from '@/components/timesheet/EspelhoMensal.svelte';
	import Avatar from '@/components/ui/Avatar.svelte';
	import Button from '@/components/ui/Button.svelte';
	import Card from '@/components/ui/Card.svelte';
	import Icon from '@/components/ui/Icon.svelte';
	import StatCard from '@/components/ui/StatCard.svelte';

	type Aba = 'espelho' | 'consolidado';
	type Filtro = 'todos' | 'extras' | 'deficit';

	let aba = $state<Aba>('espelho');
	let colaboradores = $state<Colaborador[]>([]);
	let errorMsg = $state('');

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
	let filtro = $state<Filtro>('todos');
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
		let linhas = conResult.linhas;
		if (filtroDepartamentoId !== 'todos') {
			const idsDoDepto = new Set(
				colaboradores.filter((c) => c.departamentoId === filtroDepartamentoId).map((c) => c.id)
			);
			linhas = linhas.filter((l) => idsDoDepto.has(l.colaboradorId));
		}
		if (filtro === 'extras') return linhas.filter((l) => l.extras > 0);
		if (filtro === 'deficit') return linhas.filter((l) => l.deficit > 0);
		return linhas;
	});

	const totais = $derived.by(() => {
		if (!conResult) return { horas: 0, extras: 0, deficit: 0, faltas: 0 };
		return conResult.linhas.reduce(
			(acc, l) => ({
				horas: acc.horas + l.horas,
				extras: acc.extras + l.extras,
				deficit: acc.deficit + l.deficit,
				faltas: acc.faltas + l.faltasJustificadas
			}),
			{ horas: 0, extras: 0, deficit: 0, faltas: 0 }
		);
	});

	const maxHoras = $derived(
		conResult ? Math.max(1, ...conResult.linhas.flatMap((l) => [l.horas, l.horasEsperadas])) : 1
	);

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
		const headers = ['Colaborador', 'Dias', 'Horas', 'Extras', 'Déficit', 'Férias', 'Justificadas'];
		const rows = conResult.linhas.map((l) => [
			l.colaboradorNome,
			l.diasTrabalhados,
			l.horas,
			l.extras,
			l.deficit,
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

	let baixandoAfd = $state(false);
	async function baixarAfd() {
		baixandoAfd = true;
		errorMsg = '';
		try {
			const token = localStorage.getItem('auth_token');
			const res = await fetch('/api/relatorios/afd', {
				headers: token ? { Authorization: `Bearer ${token}` } : {}
			});
			if (!res.ok) throw new Error('Falha ao gerar o AFD.');
			const blob = await res.blob();
			const disp = res.headers.get('Content-Disposition') ?? '';
			const nome = disp.match(/filename="(.+?)"/)?.[1] ?? 'AFD.txt';
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = nome;
			a.click();
			URL.revokeObjectURL(url);
		} catch (e) {
			errorMsg = e instanceof Error ? e.message : 'Erro ao gerar o AFD.';
		} finally {
			baixandoAfd = false;
		}
	}

	let baixandoAej = $state(false);
	async function baixarAej() {
		baixandoAej = true;
		errorMsg = '';
		try {
			const mesRef = mes || mesDefault;
			const [ano, mesNum] = mesRef.split('-');
			const inicio = `${ano}-${mesNum}-01`;
			const ultimoDia = new Date(Number(ano), Number(mesNum), 0).getDate();
			const fim = `${ano}-${mesNum}-${String(ultimoDia).padStart(2, '0')}`;

			const token = localStorage.getItem('auth_token');
			const res = await fetch(`/api/relatorios/aej?inicio=${inicio}&fim=${fim}`, {
				headers: token ? { Authorization: `Bearer ${token}` } : {}
			});
			if (!res.ok) throw new Error('Falha ao gerar o AEJ.');
			const blob = await res.blob();
			const disp = res.headers.get('Content-Disposition') ?? '';
			const nome = disp.match(/filename="(.+?)"/)?.[1] ?? 'AEJ.txt';
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = nome;
			a.click();
			URL.revokeObjectURL(url);
		} catch (e) {
			errorMsg = e instanceof Error ? e.message : 'Erro ao gerar o AEJ.';
		} finally {
			baixandoAej = false;
		}
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

	const avatarColors = ['#2563eb', '#7c3aed', '#0891b2', '#16a34a', '#d97706'];

	onMount(async () => {
		colaboradores = await colaboradorService.listar();
	});
</script>

<svelte:head><title>Relatórios — Admin</title></svelte:head>

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
				disabled={baixandoAfd}
				title="Arquivo Fonte de Dados — Portaria 671/2021"
			>
				<Icon name="download" size={13} />
				{baixandoAfd ? 'Gerando…' : 'Baixar AFD'}
			</button>
			<button
				class="export-btn"
				onclick={baixarAej}
				disabled={baixandoAej}
				title="Arquivo Eletrônico de Jornada — Portaria 671/2021"
			>
				<Icon name="download" size={13} />
				{baixandoAej ? 'Gerando…' : 'Baixar AEJ'}
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
					label="Total de horas"
					value={formatHoursMinutes(totais.horas * 60)}
				/>
				<StatCard
					tone="success"
					label="Horas extras"
					value="+{formatHoursMinutes(totais.extras * 60)}"
				/>
				<StatCard
					tone="danger"
					label="Déficit acum."
					value="-{formatHoursMinutes(totais.deficit * 60)}"
				/>
				<StatCard tone="warning" label="Justificadas" value={totais.faltas} />
			</div>

			<Card>
				<h2 class="card-title">Horas trabalhadas por colaborador</h2>
				<div class="bars">
					{#each conResult.linhas as l, i (l.colaboradorId)}
						<div class="bar-row">
							<div class="bar__name">{l.colaboradorNome.split(' ')[0]}</div>
							<div class="bar__track">
								{#if l.horasEsperadas > 0}
									<div
										class="bar__expected"
										style="width: {(l.horasEsperadas / maxHoras) * 100}%"
										title="Esperado: {formatHoursMinutes(l.horasEsperadas * 60)}"
									></div>
								{/if}
								<div
									class="bar__fill"
									style="width: {(l.horas / maxHoras) * 100}%; background: {avatarColors[
										i % avatarColors.length
									]};"
								>
									<span class="bar__value">{formatHoursMinutes(l.horas * 60)}</span>
								</div>
							</div>
						</div>
					{/each}
				</div>
			</Card>

			<Card>
				<header class="card-header">
					<h2 class="card-title">Detalhamento</h2>
					<div class="chips">
						{#each [['todos', 'Todos'], ['extras', 'Com extras'], ['deficit', 'Com déficit']] as [val, label] (val)}
							<button
								class="chip"
								class:is-active={filtro === val}
								onclick={() => (filtro = val as Filtro)}
							>
								{label}
							</button>
						{/each}
					</div>
				</header>

				<div class="table-wrap">
					<table>
						<thead>
							<tr>
								<th>Colaborador</th>
								<th class="right">Dias trab.</th>
								<th class="right">Horas</th>
								<th class="right">Extras</th>
								<th class="right">Déficit</th>
								<th class="right">Justif.</th>
							</tr>
						</thead>
						<tbody>
							{#each linhasFiltradas as l, i (l.colaboradorId)}
								<tr>
									<td>
										<div class="cell-name">
											<Avatar
												initials={initialsFromName(l.colaboradorNome)}
												size={28}
												color={avatarColors[i % avatarColors.length]}
											/>
											<span>{l.colaboradorNome}</span>
										</div>
									</td>
									<td class="right">{l.diasTrabalhados}</td>
									<td class="right num">{formatHoursMinutes(l.horas * 60)}</td>
									<td class="right">
										{#if l.extras > 0}
											<span class="pos">+{formatHoursMinutes(l.extras * 60)}</span>
										{:else}
											<span class="dash">—</span>
										{/if}
									</td>
									<td class="right">
										{#if l.deficit > 0}
											<span class="neg">-{formatHoursMinutes(l.deficit * 60)}</span>
										{:else}
											<span class="dash">—</span>
										{/if}
									</td>
									<td class="right">
										{#if l.faltasJustificadas > 0}
											<span class="warn">{l.faltasJustificadas}</span>
										{:else}
											<span class="dash">0</span>
										{/if}
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
		color: #475569;
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
		color: #374151;
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

	.bars {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		margin-top: 0.75rem;
	}

	.bar-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.bar__name {
		width: 90px;
		font-size: 0.8rem;
		color: #334155;
		font-weight: 500;
		flex-shrink: 0;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.bar__track {
		flex: 1;
		height: 28px;
		background: var(--color-border-soft);
		border-radius: var(--radius-pill);
		overflow: hidden;
		position: relative;
	}

	.bar__expected {
		position: absolute;
		left: 0;
		top: 0;
		height: 100%;
		background: #d1d5db;
		border-radius: var(--radius-pill);
	}

	.bar__fill {
		height: 100%;
		border-radius: var(--radius-pill);
		opacity: 0.85;
		transition: width 0.6s ease;
		display: flex;
		align-items: center;
		justify-content: flex-end;
		padding-right: 8px;
		position: relative;
		z-index: 1;
	}

	.bar__value {
		color: #fff;
		font-size: 0.7rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}

	.chips {
		display: flex;
		gap: 0.375rem;
	}

	.chip {
		padding: 0.25rem 0.625rem;
		border-radius: var(--radius-pill);
		font-size: 0.75rem;
		font-weight: 500;
		cursor: pointer;
		font-family: inherit;
		background: var(--color-border-soft);
		color: var(--color-text-muted);
		border: none;
	}

	.chip.is-active {
		background: var(--color-primary);
		color: #fff;
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
		color: #cbd5e1;
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
</style>
