<!--
  @page /colaborador/historico
  @description Histórico de registros de ponto do colaborador.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { timesheetService } from '@/services/timesheet.service';
	import type { DailySummary, RegistroType } from '@/services/timesheet.service';
	import { formatTime, formatHoursMinutes, toDateKey } from '@/utils/date';
	import { SvelteDate } from 'svelte/reactivity';
	import { baixar } from '@/services/api';
	import Button from '@/components/ui/Button.svelte';
	import Card from '@/components/ui/Card.svelte';
	import Icon from '@/components/ui/Icon.svelte';

	const REGISTRO_LABELS: Record<RegistroType, string> = {
		entrada: 'Entrada',
		saida_almoco: 'Saída Almoço',
		retorno_almoco: 'Retorno Almoço',
		saida: 'Saída'
	};

	const REGISTRO_DOT: Record<RegistroType, string> = {
		entrada: '#22c55e',
		saida_almoco: '#f97316',
		retorno_almoco: '#3b82f6',
		saida: '#8b5cf6'
	};

	type Filter = 'todos' | 'extras' | 'deficit';

	let history = $state<DailySummary[]>([]);
	let loading = $state(false);
	let errorMsg = $state('');
	let filter = $state<Filter>('todos');
	let openDay = $state<string | null>(null);

	function defaultDateRange(): { startDate: string; endDate: string } {
		const end = new SvelteDate();
		const start = new SvelteDate();
		start.setDate(end.getDate() - 30);
		return {
			startDate: toDateKey(start),
			endDate: toDateKey(end)
		};
	}

	async function loadHistory(): Promise<void> {
		loading = true;
		errorMsg = '';
		try {
			history = await timesheetService.history(defaultDateRange());
		} catch {
			errorMsg = 'Erro ao carregar histórico.';
		} finally {
			loading = false;
		}
	}

	const filtered = $derived(
		history.filter((d) => {
			if (filter === 'extras') return d.overtime > 0;
			if (filter === 'deficit') return d.deficit > 0;
			return true;
		})
	);

	const totalExtraMin = $derived(history.reduce((a, d) => a + d.overtime * 60, 0));
	const totalDeficitMin = $derived(history.reduce((a, d) => a + d.deficit * 60, 0));
	const totalDias = $derived(history.length);
	const bancoMin = $derived(totalExtraMin - totalDeficitMin);

	function formatDayHeader(dateStr: string): string {
		const d = new Date(`${dateStr}T12:00:00`);
		return d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' });
	}

	// Espelho de ponto mensal em PDF (Portaria 671/2021, art. 84, parágrafo único).
	let espelhoMes = $state(toDateKey(new Date()).slice(0, 7));
	let baixandoEspelho = $state(false);
	let espelhoAviso = $state('');

	async function baixarEspelho(): Promise<void> {
		if (!espelhoMes) return;
		baixandoEspelho = true;
		errorMsg = '';
		try {
			const { assinado } = await baixar(`/timesheet/espelho?mes=${espelhoMes}`, 'espelho.pdf');
			espelhoAviso = assinado ? '' : 'Espelho gerado sem assinatura digital.';
		} catch {
			errorMsg = 'Erro ao gerar o espelho de ponto.';
		} finally {
			baixandoEspelho = false;
		}
	}

	onMount(loadHistory);
</script>

<svelte:head>
	<title>Histórico — Ponto Digital</title>
</svelte:head>

<section class="historico">
	<header class="historico__header">
		<h1>Histórico de Ponto</h1>
		<div class="espelho-pdf">
			<label class="espelho-pdf__mes">
				<span>Espelho do mês</span>
				<input type="month" bind:value={espelhoMes} />
			</label>
			<Button
				variant="outline"
				size="sm"
				onclick={baixarEspelho}
				loading={baixandoEspelho}
				disabled={!espelhoMes}
			>
				<Icon name="download" size={13} />
				Baixar PDF
			</Button>
		</div>
	</header>
	{#if espelhoAviso}<p class="aviso" role="status">{espelhoAviso}</p>{/if}

	{#if errorMsg}
		<div class="error" role="alert">{errorMsg}</div>
	{/if}

	<div class="summary">
		<Card>
			<span class="summary__label">Dias trabalhados</span>
			<span class="summary__value">{totalDias}</span>
		</Card>
		<Card>
			<span class="summary__label">Banco de horas</span>
			<span
				class="summary__value"
				style="color: {bancoMin >= 0 ? 'var(--color-success)' : 'var(--color-danger)'}"
			>
				{bancoMin >= 0 ? '+' : '-'}{formatHoursMinutes(Math.abs(bancoMin))}
			</span>
		</Card>
		<Card>
			<span class="summary__label">Horas extras</span>
			<span class="summary__value" style="color: var(--color-primary)">
				{formatHoursMinutes(totalExtraMin)}
			</span>
		</Card>
	</div>

	<div class="tabs">
		{#each [['todos', 'Todos'], ['extras', 'Com extras'], ['deficit', 'Com déficit']] as [val, label] (val)}
			<button class="tab" class:is-active={filter === val} onclick={() => (filter = val as Filter)}>
				{label}
			</button>
		{/each}
	</div>

	{#if loading}
		<p class="empty">Carregando...</p>
	{:else if filtered.length === 0}
		<p class="empty">Nenhum registro encontrado.</p>
	{:else}
		<div class="list">
			{#each filtered as day (day.date)}
				{@const isOpen = openDay === day.date}
				<div class="day">
					<button class="day__header" onclick={() => (openDay = isOpen ? null : day.date)}>
						<div class="day__title">
							<div class="day__date">{formatDayHeader(day.date)}</div>
							<div class="day__sub">{day.registros.length} registros</div>
						</div>
						<div class="day__right">
							{#if day.overtime > 0}
								<span class="badge badge--success">+{formatHoursMinutes(day.overtime * 60)}</span>
							{/if}
							{#if day.deficit > 0}
								<span class="badge badge--danger">-{formatHoursMinutes(day.deficit * 60)}</span>
							{/if}
							<span class="day__hours">{formatHoursMinutes(day.totalHours * 60)}</span>
							<span class="day__chevron" class:is-open={isOpen}>
								<Icon name="chevron-down" size={14} />
							</span>
						</div>
					</button>

					{#if isOpen}
						<div class="day__details">
							{#each day.registros as registro (registro)}
								<div class="day__punch">
									<div class="day__punch-head">
										<span class="day__punch-dot" style="background: {REGISTRO_DOT[registro.type]};"
										></span>
										<span class="day__punch-label">{REGISTRO_LABELS[registro.type]}</span>
									</div>
									<span class="day__punch-time">{formatTime(registro.timestamp)}</span>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</section>

<style>
	.historico {
		max-width: 1200px;
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}

	.historico__header {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		justify-content: space-between;
		gap: 0.75rem;
	}

	.espelho-pdf {
		display: flex;
		align-items: flex-end;
		gap: 0.5rem;
	}

	.espelho-pdf__mes {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		font-size: 0.75rem;
		color: var(--color-text-muted);
	}

	.espelho-pdf__mes input {
		padding: 0.375rem 0.5rem;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		background: var(--color-surface);
		color: var(--color-text);
		font: inherit;
		font-size: 0.8125rem;
	}

	.aviso {
		margin: 0;
		font-size: 0.8125rem;
		color: var(--color-warning-strong);
	}

	.historico h1 {
		margin: 0;
		font-size: 1.375rem;
		font-weight: 700;
		color: var(--color-text);
		letter-spacing: -0.02em;
	}

	.summary {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.75rem;
	}

	.summary__label {
		display: block;
		font-size: 0.75rem;
		color: var(--color-text-muted);
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.summary__value {
		display: block;
		font-size: 1.25rem;
		font-weight: 800;
		color: var(--color-text);
		letter-spacing: -0.02em;
		font-variant-numeric: tabular-nums;
		margin-top: 0.25rem;
	}

	.tabs {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.tab {
		padding: 0.375rem 0.875rem;
		border-radius: var(--radius-pill);
		font-size: 0.8125rem;
		font-weight: 500;
		cursor: pointer;
		font-family: inherit;
		background: var(--color-surface);
		color: var(--color-text-muted);
		border: 1px solid var(--color-border);
	}

	.tab.is-active {
		background: var(--color-primary);
		color: #fff;
		border-color: var(--color-primary);
	}

	.list {
		display: flex;
		flex-direction: column;
		gap: 0.625rem;
	}

	.day {
		background: var(--color-surface);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-card);
		overflow: hidden;
	}

	.day__header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		background: none;
		border: none;
		cursor: pointer;
		padding: 1rem 1.25rem;
		font-family: inherit;
		text-align: left;
	}

	.day__title {
		min-width: 0;
	}

	.day__date {
		font-weight: 700;
		color: var(--color-text);
		font-size: 0.9375rem;
		text-transform: capitalize;
	}

	.day__sub {
		font-size: 0.75rem;
		color: var(--color-text-subtle);
		margin-top: 0.125rem;
	}

	.day__right {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.badge {
		font-size: 0.7rem;
		font-weight: 700;
		padding: 0.2rem 0.5rem;
		border-radius: 0.375rem;
	}

	.badge--success {
		background: var(--color-success-bg);
		color: var(--color-success);
	}

	.badge--danger {
		background: var(--color-danger-bg);
		color: var(--color-danger);
	}

	.day__hours {
		font-weight: 700;
		color: var(--color-primary);
		font-variant-numeric: tabular-nums;
		font-size: 0.9375rem;
	}

	.day__chevron {
		display: inline-flex;
		color: var(--color-text-subtle);
		transition: transform 200ms ease;
	}

	.day__chevron.is-open {
		transform: rotate(180deg);
	}

	.day__details {
		border-top: 1px solid var(--color-border-soft);
		padding: 0.875rem 1.25rem;
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 0.5rem;
	}

	.day__punch {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
	}

	.day__punch-head {
		display: flex;
		align-items: center;
		gap: 0.375rem;
	}

	.day__punch-dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
	}

	.day__punch-label {
		font-size: 0.7rem;
		color: var(--color-text-muted);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		font-weight: 600;
	}

	.day__punch-time {
		font-weight: 700;
		color: var(--color-text);
		font-variant-numeric: tabular-nums;
		font-size: 1rem;
		padding-left: 1rem;
	}

	.empty {
		text-align: center;
		color: var(--color-text-subtle);
		padding: 2rem;
	}

	.error {
		background: var(--color-danger-bg);
		color: var(--color-danger);
		padding: 0.75rem 1rem;
		border-radius: var(--radius-sm);
		text-align: center;
	}
</style>
