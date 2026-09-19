<!--
  @page /colaborador/registro
  @description Página de registro de ponto — bater ponto e ver registros do dia.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import Button from '@/components/ui/Button.svelte';
	import Card from '@/components/ui/Card.svelte';
	import Icon from '@/components/ui/Icon.svelte';
	import { timesheetService } from '@/services/timesheet.service';
	import type { RegistroType, DailySummary, ComprovanteItem } from '@/services/timesheet.service';
	import { formatDate, formatTime, diffInMinutes } from '@/utils/date';
	import { dataBrasiliaExtenso, horaBrasilia } from '@/utils/relogio';

	const REGISTRO_LABELS: Record<RegistroType, string> = {
		entrada: 'Entrada',
		saida_almoco: 'Saída Almoço',
		retorno_almoco: 'Retorno Almoço',
		saida: 'Saída'
	};

	const REGISTRO_SEQUENCE: RegistroType[] = ['entrada', 'saida_almoco', 'retorno_almoco', 'saida'];

	const REGISTRO_DOT: Record<RegistroType, string> = {
		entrada: '#22c55e',
		saida_almoco: '#f97316',
		retorno_almoco: '#3b82f6',
		saida: '#8b5cf6'
	};

	let summary = $state<DailySummary | null>(null);
	let loading = $state(false);
	let registrando = $state(false);
	let errorMsg = $state('');
	let now = $state(new Date());
	// Relógio do REP: hora do servidor (não a do dispositivo), em Brasília.
	// null = ainda não sincronizou ou falhou → mostra a hora do dispositivo.
	let desvioMs = $state<number | null>(null);
	const RESSINCRONIZAR_MS = 5 * 60_000;

	async function sincronizarRelogio(): Promise<void> {
		try {
			desvioMs = await timesheetService.sincronizarRelogio();
			now = new Date(Date.now() + desvioMs);
		} catch {
			desvioMs = null;
		}
	}
	let lastSuccess = $state('');

	const nextRegistroType: RegistroType | null = $derived.by(() => {
		if (!summary) return 'entrada';
		const registered = summary.registros.map((p) => p.type);
		return REGISTRO_SEQUENCE.find((type) => !registered.includes(type)) ?? null;
	});

	const totalMinutes = $derived.by(() => {
		if (!summary || summary.registros.length < 2) return 0;
		const byType = new Map(summary.registros.map((p) => [p.type, p.timestamp]));
		let total = 0;
		const ent = byType.get('entrada');
		const saA = byType.get('saida_almoco');
		const reA = byType.get('retorno_almoco');
		const sai = byType.get('saida');
		if (ent && saA) total += diffInMinutes(ent, saA);
		if (reA && sai) total += diffInMinutes(reA, sai);
		else if (reA && !sai) total += diffInMinutes(reA, now);
		return Math.max(0, total);
	});

	async function loadToday(): Promise<void> {
		loading = true;
		try {
			summary = await timesheetService.today();
		} catch {
			errorMsg = 'Erro ao carregar registros do dia.';
		} finally {
			loading = false;
		}
	}

	// Comprovantes das últimas 48h (Portaria 671/2021, art. 80, parágrafo único).
	let comprovantes = $state<ComprovanteItem[]>([]);
	let baixandoComprovante = $state<string | null>(null);

	async function loadComprovantes(): Promise<void> {
		try {
			comprovantes = await timesheetService.comprovantes();
		} catch {
			comprovantes = [];
		}
	}

	async function baixarComprovante(registroId: string): Promise<void> {
		baixandoComprovante = registroId;
		errorMsg = '';
		try {
			await timesheetService.baixarComprovante(registroId);
		} catch {
			errorMsg = 'Erro ao baixar o comprovante.';
		} finally {
			baixandoComprovante = null;
		}
	}

	async function handleRegistrar(): Promise<void> {
		const type = nextRegistroType;
		if (!type) return;

		registrando = true;
		errorMsg = '';
		try {
			await timesheetService.registrar({ type, method: 'manual' });
			lastSuccess = REGISTRO_LABELS[type];
			setTimeout(() => (lastSuccess = ''), 3000);
			await Promise.all([loadToday(), loadComprovantes()]);
		} catch {
			errorMsg = 'Erro ao registrar ponto.';
		} finally {
			registrando = false;
		}
	}

	onMount(() => {
		loadToday();
		loadComprovantes();
		sincronizarRelogio();
		const timer = setInterval(() => (now = new Date(Date.now() + (desvioMs ?? 0))), 1000);
		const ressinc = setInterval(sincronizarRelogio, RESSINCRONIZAR_MS);
		return () => {
			clearInterval(timer);
			clearInterval(ressinc);
		};
	});

	function registroAt(type: RegistroType): string | null {
		return summary?.registros.find((p) => p.type === type)?.timestamp ?? null;
	}
</script>

<svelte:head>
	<title>Registrar Ponto — Ponto Digital</title>
</svelte:head>

<section class="registro">
	<div class="clock">
		<span class="clock__date">{dataBrasiliaExtenso(now)}</span>
		<span class="clock__time">{horaBrasilia(now)}</span>
		<span class="clock__fonte" class:clock__fonte--local={desvioMs === null}>
			{desvioMs === null
				? 'Hora do dispositivo — sem sincronizar com o servidor'
				: 'Hora do servidor de ponto · Brasília'}
		</span>
		{#if totalMinutes > 0}
			<span class="clock__worked">
				<Icon name="clock" size={13} />
				{Math.floor(totalMinutes / 60)}h {String(totalMinutes % 60).padStart(2, '0')}min trabalhados
			</span>
		{/if}
	</div>

	<Card>
		<div class="steps">
			{#each REGISTRO_SEQUENCE as type, i (type)}
				{@const ts = registroAt(type)}
				{@const isDone = !!ts}
				{@const isNext = !isDone && nextRegistroType === type}
				<div class="step">
					<div class="step__dot" class:is-done={isDone} class:is-next={isNext}>
						{#if isDone}
							<Icon name="check" size={12} stroke={3} />
						{:else if isNext}
							<span class="step__inner"></span>
						{/if}
					</div>
					<span class="step__label" class:is-done={isDone} class:is-next={isNext}>
						{REGISTRO_LABELS[type]}
						{#if isDone}
							<br /><span class="step__time">{formatTime(ts!)}</span>
						{/if}
					</span>
				</div>
				{#if i < REGISTRO_SEQUENCE.length - 1}
					<div class="step__line" class:is-done={isDone}></div>
				{/if}
			{/each}
		</div>
	</Card>

	{#if errorMsg}
		<div class="error" role="alert">{errorMsg}</div>
	{/if}

	<div class="action">
		{#if nextRegistroType}
			<Button variant="primary" size="lg" loading={registrando} onclick={handleRegistrar}>
				{REGISTRO_LABELS[nextRegistroType]}
			</Button>
		{:else}
			<div class="done-box">
				<Icon name="check-circle" size={28} />
				<span>Todos os registros do dia concluídos</span>
			</div>
		{/if}
		{#if lastSuccess}
			<div class="success-toast">
				<Icon name="check" size={14} stroke={2.5} />
				{lastSuccess} registrado com sucesso
			</div>
		{/if}
	</div>

	{#if summary && summary.registros.length > 0}
		<Card>
			<h2 class="list-title">Registros de hoje</h2>
			<div class="punches">
				{#each summary.registros as registro (registro)}
					<div class="punch">
						<div class="punch__left">
							<span class="punch__dot" style="background: {REGISTRO_DOT[registro.type]};"></span>
							<span class="punch__type">{REGISTRO_LABELS[registro.type]}</span>
						</div>
						<span class="punch__time">{formatTime(registro.timestamp)}</span>
					</div>
				{/each}
			</div>
		</Card>
	{:else if loading}
		<p class="empty">Carregando...</p>
	{/if}

	{#if comprovantes.length > 0}
		<Card>
			<h2 class="list-title">Comprovantes (últimas 48h)</h2>
			<ul class="comprovantes">
				{#each comprovantes as c (c.registroId)}
					<li class="comprovante">
						<div class="comprovante__info">
							<span class="comprovante__tipo">{REGISTRO_LABELS[c.tipo]}</span>
							<span class="comprovante__meta">
								{formatDate(c.marcadoEm)} às {formatTime(c.marcadoEm)} · NSR {c.nsr}
							</span>
						</div>
						<Button
							variant="outline"
							size="sm"
							loading={baixandoComprovante === c.registroId}
							onclick={() => baixarComprovante(c.registroId)}
						>
							<Icon name="download" size={13} />
							PDF
						</Button>
					</li>
				{/each}
			</ul>
		</Card>
	{/if}
</section>

<style>
	.registro {
		max-width: 480px;
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}

	.clock {
		background: var(--color-sidebar);
		border-radius: var(--radius-lg);
		padding: 1.75rem;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.25rem;
	}

	.clock__date {
		color: var(--color-text-muted);
		font-size: 0.8125rem;
		text-transform: capitalize;
	}

	.clock__time {
		color: #f8fafc;
		font-size: 3rem;
		font-weight: 700;
		letter-spacing: -0.03em;
		font-variant-numeric: tabular-nums;
		line-height: 1.1;
	}

	.clock__fonte {
		color: var(--color-text-muted);
		font-size: 0.6875rem;
		letter-spacing: 0.02em;
	}

	.clock__fonte--local {
		color: var(--color-warning);
	}

	.clock__worked {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		background: var(--color-sidebar-border);
		color: var(--color-sidebar-item-fg);
		padding: 0.3rem 0.75rem;
		border-radius: var(--radius-pill);
		font-size: 0.8rem;
		margin-top: 0.5rem;
	}

	.steps {
		display: flex;
		align-items: flex-start;
	}

	.step {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.375rem;
		min-width: 64px;
	}

	.step__dot {
		width: 28px;
		height: 28px;
		border-radius: 50%;
		background: var(--color-border-soft);
		border: 2px solid var(--color-border);
		display: flex;
		align-items: center;
		justify-content: center;
		color: #fff;
	}

	.step__dot.is-done {
		background: var(--color-primary);
		border-color: var(--color-primary);
	}

	.step__dot.is-next {
		background: var(--color-primary-soft);
		border: 2px solid var(--color-primary);
	}

	.step__inner {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--color-primary);
	}

	.step__label {
		font-size: 0.7rem;
		color: var(--color-text-subtle);
		text-align: center;
		line-height: 1.2;
	}

	.step__label.is-done {
		color: var(--color-primary);
		font-weight: 600;
	}

	.step__label.is-next {
		color: #334155;
		font-weight: 600;
	}

	.step__time {
		color: var(--color-text-muted);
		font-weight: 400;
	}

	.step__line {
		flex: 1;
		height: 2px;
		background: var(--color-border);
		margin-top: 14px;
	}

	.step__line.is-done {
		background: var(--color-primary);
	}

	.action {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.75rem;
	}

	.action :global(.btn--lg) {
		width: 100%;
		font-size: 1.0625rem;
		padding: 1rem 2.5rem;
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-primary);
	}

	.done-box {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		background: var(--color-success-bg);
		color: var(--color-success);
		border-radius: var(--radius-md);
		padding: 1rem 1.5rem;
		width: 100%;
		font-weight: 600;
		font-size: 1rem;
	}

	.success-toast {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		background: var(--color-success-bg);
		color: #15803d;
		padding: 0.5rem 1rem;
		border-radius: var(--radius-pill);
		font-size: 0.875rem;
		font-weight: 500;
	}

	.list-title {
		font-size: 0.9375rem;
		font-weight: 700;
		color: var(--color-text);
		margin: 0 0 0.875rem;
	}

	.punches {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.punch {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.75rem 1rem;
		background: var(--color-surface);
		border-radius: var(--radius-sm);
		border: 1px solid var(--color-border-soft);
	}

	.punch__left {
		display: flex;
		align-items: center;
		gap: 0.625rem;
	}

	.punch__dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
	}

	.punch__type {
		font-weight: 600;
		color: #334155;
		font-size: 0.9rem;
	}

	.punch__time {
		font-weight: 700;
		color: var(--color-text);
		font-variant-numeric: tabular-nums;
		font-size: 0.9375rem;
	}

	.empty {
		text-align: center;
		color: var(--color-text-subtle);
	}

	.error {
		background: var(--color-danger-bg);
		color: var(--color-danger);
		padding: 0.75rem 1rem;
		border-radius: var(--radius-sm);
		text-align: center;
	}

	.comprovantes {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
	}

	.comprovante {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.625rem 0;
		border-bottom: 1px solid var(--color-border-soft);
	}

	.comprovante:last-child {
		border-bottom: none;
	}

	.comprovante__info {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
		min-width: 0;
	}

	.comprovante__tipo {
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--color-text);
	}

	.comprovante__meta {
		font-size: 0.75rem;
		color: var(--color-text-muted);
		font-variant-numeric: tabular-nums;
	}
</style>
