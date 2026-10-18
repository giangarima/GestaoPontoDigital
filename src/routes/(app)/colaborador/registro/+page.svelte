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
	import { descreverLocalizacao, obterPosicao } from '@/utils/geolocalizacao';

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
	let obtendoLocal = $state(false);
	let avisoLocal = $state('');
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

	// A marcação nunca é bloqueada (Portaria 671/2021, art. 74): depois da 4ª o botão
	// continua, alternando entrada e saída. Contra o clique duplo, só uma pausa curta
	// após cada batida e uma confirmação quando a anterior acabou de acontecer — a
	// duplicada que passar ainda pode ser desconsiderada no tratamento.
	const PAUSA_APOS_BATIDA_MS = 5_000;
	const CONFIRMAR_SE_ULTIMA_HA_MS = 2 * 60_000;
	let pausaAte = $state(0);
	let confirmando = $state(false);

	/** Marcações que contam no dia, em ordem (as desconsideradas no tratamento saem). */
	const validas = $derived(
		(summary?.registros ?? [])
			.filter((r) => !r.anulacao)
			.sort((a, b) => a.timestamp.localeCompare(b.timestamp))
	);

	const nextRegistroType: RegistroType = $derived(
		REGISTRO_SEQUENCE[validas.length] ?? (validas.length % 2 === 0 ? 'entrada' : 'saida')
	);

	const ultima = $derived(validas.at(-1) ?? null);
	const emPausa = $derived(now.getTime() < pausaAte);

	const totalMinutes = $derived.by(() => {
		let total = 0;
		for (let i = 0; i < validas.length; i += 2) {
			const saida = validas[i + 1]?.timestamp ?? now;
			total += diffInMinutes(validas[i].timestamp, saida);
		}
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

	function handleClique(): void {
		if (emPausa || registrando) return;
		const recente =
			ultima && now.getTime() - new Date(ultima.timestamp).getTime() < CONFIRMAR_SE_ULTIMA_HA_MS;
		if (recente) confirmando = true;
		else void handleRegistrar();
	}

	async function handleRegistrar(): Promise<void> {
		const type = nextRegistroType;
		confirmando = false;
		registrando = true;
		errorMsg = '';
		avisoLocal = '';
		try {
			obtendoLocal = true;
			const posicao = await obterPosicao();
			obtendoLocal = false;
			const registro = await timesheetService.registrar({ type, method: 'manual', posicao });
			// Só informa: a batida já entrou, fora do local ou sem posição.
			if (registro.localizacao === 'fora' || registro.localizacao === 'sem_localizacao') {
				avisoLocal = `${descreverLocalizacao(registro)}. A marcação foi registrada e a empresa poderá conferir.`;
			}
			lastSuccess = REGISTRO_LABELS[type];
			pausaAte = Date.now() + (desvioMs ?? 0) + PAUSA_APOS_BATIDA_MS;
			setTimeout(() => (lastSuccess = ''), 3000);
			await Promise.all([loadToday(), loadComprovantes()]);
		} catch {
			errorMsg = 'Erro ao registrar ponto.';
		} finally {
			obtendoLocal = false;
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

	/** Horário da i-ésima marcação válida do dia (as etapas seguem a ordem, não o rótulo). */
	function registroAt(i: number): string | null {
		return validas[i]?.timestamp ?? null;
	}
</script>

<svelte:head>
	<title>Registrar Ponto</title>
</svelte:head>

<section class="registro">
	<div class="clock">
		<span class="clock__date">{dataBrasiliaExtenso(now)}</span>
		<span class="clock__time">{horaBrasilia(now)}</span>
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
				{@const ts = registroAt(i)}
				{@const isDone = !!ts}
				{@const isNext = !isDone && validas.length === i}
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
		{#if confirmando && ultima}
			<div class="confirmar" role="alertdialog" aria-labelledby="confirmar-texto">
				<p id="confirmar-texto">
					Você registrou <strong>{REGISTRO_LABELS[ultima.type]}</strong> às
					{formatTime(ultima.timestamp)}. Registrar
					<strong>{REGISTRO_LABELS[nextRegistroType]}</strong>
					agora?
				</p>
				<div class="confirmar__acoes">
					<Button variant="outline" onclick={() => (confirmando = false)}>Cancelar</Button>
					<Button variant="primary" onclick={handleRegistrar}>Registrar mesmo assim</Button>
				</div>
			</div>
		{:else}
			<Button
				variant="primary"
				size="lg"
				loading={registrando}
				disabled={emPausa}
				onclick={handleClique}
			>
				{obtendoLocal ? 'Obtendo localização…' : REGISTRO_LABELS[nextRegistroType]}
			</Button>
			<p class="aviso-lgpd">
				<Icon name="map-pin" size={12} />
				A localização é coletada só no momento da marcação, para conferir o local de trabalho.
			</p>
		{/if}
		{#if lastSuccess}
			<div class="success-toast">
				<Icon name="check" size={14} stroke={2.5} />
				{lastSuccess} registrado com sucesso
			</div>
		{/if}
		{#if avisoLocal}
			<div class="aviso-local" role="status">
				<Icon name="map-pin" size={14} />
				{avisoLocal}
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
		color: var(--color-sidebar-fg-muted);
		font-size: 0.8125rem;
		text-transform: capitalize;
	}

	.clock__time {
		color: var(--color-sidebar-fg-strong);
		font-size: 3rem;
		font-weight: 700;
		letter-spacing: -0.03em;
		font-variant-numeric: tabular-nums;
		line-height: 1.1;
	}

	.clock__fonte {
		color: var(--color-sidebar-fg-muted);
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
		color: var(--color-on-primary);
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
		color: var(--color-text-secondary);
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

	.confirmar {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		width: 100%;
		background: var(--color-warning-bg);
		color: var(--color-warning-strong);
		border-radius: var(--radius-md);
		padding: 1rem 1.25rem;
		font-size: 0.9375rem;
	}

	.confirmar p {
		margin: 0;
	}

	.confirmar__acoes {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.success-toast {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		background: var(--color-success-bg);
		color: var(--color-success);
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
		color: var(--color-text-secondary);
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

	.aviso-lgpd {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		margin: 0;
		color: var(--color-text-muted);
		font-size: 0.75rem;
		text-align: center;
	}

	.aviso-local {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		background: var(--color-warning-bg);
		color: var(--color-warning-strong);
		padding: 0.5rem 1rem;
		border-radius: var(--radius-sm);
		font-size: 0.875rem;
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
