<!--
  @page /admin/banco-horas
  @description Banco de horas (art. 59 da CLT): saldo do ciclo atual por
  colaborador, o que venceu no ciclo anterior e o extrato dia a dia — onde se
  lança a folga compensatória, que consome saldo.
-->
<script lang="ts">
	import { resolve } from '$app/paths';
	import Badge from '@/components/ui/Badge.svelte';
	import Button from '@/components/ui/Button.svelte';
	import {
		ROTULO_REGIME,
		ROTULO_RESULTADO,
		bancoHorasService,
		type BancoEmpresa,
		type ExtratoBanco,
		type LinhaBanco
	} from '@/services/banco-horas.service';
	import { formatHoursMinutes } from '@/utils/date';

	/** Vence em menos disto com saldo positivo: hora de compensar ou programar o pagamento. */
	const AVISO_VENCIMENTO_DIAS = 30;

	let banco = $state<BancoEmpresa | null>(null);
	let loading = $state(false);
	let errorMsg = $state('');

	function data(dia: string): string {
		const [a, m, d] = dia.split('-');
		return `${d}/${m}/${a}`;
	}
	function saldo(min: number): string {
		return `${min > 0 ? '+' : ''}${formatHoursMinutes(min)}`;
	}
	function diasAte(dia: string): number {
		const hoje = new Date();
		const alvo = new Date(`${dia}T23:59:59-03:00`);
		return Math.ceil((alvo.getTime() - hoje.getTime()) / 86_400_000);
	}

	async function carregar() {
		loading = true;
		errorMsg = '';
		try {
			banco = await bancoHorasService.empresa();
		} catch {
			errorMsg = 'Erro ao carregar o banco de horas.';
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		carregar();
	});

	const ativo = $derived(banco && banco.regime !== 'nenhum' ? banco : null);
	const linhas = $derived(ativo?.linhas ?? []);
	const venceEm = $derived(ativo?.atual ? diasAte(ativo.atual.fim) : null);
	const totais = $derived({
		credito: linhas.reduce((t, l) => t + l.atual.creditoMin, 0),
		debito: linhas.reduce((t, l) => t + l.atual.debitoMin + l.atual.folgaMin, 0),
		saldo: linhas.reduce((t, l) => t + l.atual.saldoMin, 0)
	});
	const maxSaldo = $derived(Math.max(60, ...linhas.map((l) => Math.abs(l.atual.saldoMin))));
	const aVencer = $derived(
		venceEm !== null && venceEm <= AVISO_VENCIMENTO_DIAS
			? linhas.filter((l) => l.atual.saldoMin > 0).length
			: 0
	);

	// ── Extrato ───────────────────────────────────────────────────────────────
	let alvo = $state<LinhaBanco | null>(null);
	let extrato = $state<ExtratoBanco | null>(null);
	let cicloSelecionado = $state('');
	let carregandoExtrato = $state(false);
	let folga = $state({ dataInicio: '', dataFim: '', motivo: '' });
	let salvando = $state(false);

	const extratoAtivo = $derived(extrato && extrato.regime !== 'nenhum' ? extrato : null);

	/** Movimentos com o saldo acumulado ao longo do ciclo. */
	const movimentos = $derived.by(() => {
		let acumulado = 0;
		return (extratoAtivo?.ciclo?.movimentos ?? []).map((m) => {
			acumulado += m.creditoMin - m.debitoMin - m.folgaMin;
			return { ...m, acumulado };
		});
	});

	async function abrirExtrato(linha: LinhaBanco, ciclo?: string) {
		alvo = linha;
		carregandoExtrato = true;
		errorMsg = '';
		try {
			extrato = await bancoHorasService.extrato(linha.colaboradorId, ciclo);
			if (extrato.regime !== 'nenhum') cicloSelecionado = extrato.ciclo?.inicio ?? '';
		} catch {
			errorMsg = 'Erro ao carregar o extrato.';
		} finally {
			carregandoExtrato = false;
		}
	}

	function fecharExtrato() {
		alvo = null;
		extrato = null;
		folga = { dataInicio: '', dataFim: '', motivo: '' };
	}

	async function lancarFolga() {
		if (!alvo) return;
		salvando = true;
		errorMsg = '';
		try {
			await bancoHorasService.lancarFolga(alvo.colaboradorId, {
				dataInicio: folga.dataInicio,
				dataFim: folga.dataFim || folga.dataInicio,
				motivo: folga.motivo
			});
			folga = { dataInicio: '', dataFim: '', motivo: '' };
			await Promise.all([abrirExtrato(alvo, cicloSelecionado), carregar()]);
		} catch (e) {
			const err = e as { details?: { error?: string } };
			errorMsg = err.details?.error ?? 'Erro ao lançar a folga.';
		} finally {
			salvando = false;
		}
	}

	async function cancelarFolga(id: string) {
		if (!alvo) return;
		errorMsg = '';
		try {
			await bancoHorasService.cancelarFolga(alvo.colaboradorId, id);
			await Promise.all([abrirExtrato(alvo, cicloSelecionado), carregar()]);
		} catch {
			errorMsg = 'Erro ao cancelar a folga.';
		}
	}
</script>

<svelte:head>
	<title>Banco de horas — On Time</title>
</svelte:head>

<section class="admin-page">
	<header class="admin-page__header">
		<h1>Banco de horas</h1>
		{#if ativo}
			<span class="hint">{ROTULO_REGIME[ativo.config.regime]}</span>
		{/if}
	</header>

	{#if errorMsg && !alvo}
		<div class="alert alert--error" role="alert">{errorMsg}</div>
	{/if}

	{#if loading && !banco}
		<p class="empty">Carregando...</p>
	{:else if banco && !ativo}
		<div class="vazio">
			<p>A empresa não usa banco de horas.</p>
			<p class="hint">
				Configure o regime e o início do primeiro ciclo em
				<a href={resolve('/admin/empresa', {})}>Empresa</a>.
			</p>
		</div>
	{:else if ativo && !ativo.atual}
		<p class="empty">O primeiro ciclo começa em {data(ativo.config.inicio)}.</p>
	{:else if ativo?.atual}
		<div class="ciclo">
			<div>
				<span class="hint">Ciclo atual</span>
				<strong>{data(ativo.atual.inicio)} a {data(ativo.atual.fim)}</strong>
			</div>
			<div>
				<span class="hint">Vencimento</span>
				<strong>{venceEm === 0 ? 'hoje' : `em ${venceEm} dia${venceEm === 1 ? '' : 's'}`}</strong>
			</div>
			<div>
				<span class="hint">Créditos</span>
				<strong class="pos">{saldo(totais.credito)}</strong>
			</div>
			<div>
				<span class="hint">Débitos e folgas</span>
				<strong class="neg">{formatHoursMinutes(-totais.debito)}</strong>
			</div>
			<div>
				<span class="hint">Saldo da empresa</span>
				<strong class:pos={totais.saldo > 0} class:neg={totais.saldo < 0}
					>{saldo(totais.saldo)}</strong
				>
			</div>
		</div>

		{#if aVencer > 0}
			<div class="alert alert--warning" role="status">
				{aVencer} colaborador{aVencer === 1 ? '' : 'es'} com saldo positivo e o ciclo vence em
				{venceEm} dias: compense com folga ou programe o pagamento como hora extra.
			</div>
		{/if}

		<div class="tabela-wrap">
			<table class="tabela">
				<thead>
					<tr>
						<th>Colaborador</th>
						<th class="num">Créditos</th>
						<th class="num">Débitos</th>
						<th class="num">Folgas</th>
						<th class="col-saldo">Saldo do ciclo</th>
						<th>Ciclo anterior</th>
					</tr>
				</thead>
				<tbody>
					{#each linhas as l (l.colaboradorId)}
						<tr>
							<td>
								<button type="button" class="link" onclick={() => abrirExtrato(l)}>{l.nome}</button>
								<span class="sub">{l.departamento ?? 'Sem departamento'}</span>
							</td>
							<td class="num pos">{l.atual.creditoMin ? saldo(l.atual.creditoMin) : '—'}</td>
							<td class="num neg">
								{l.atual.debitoMin ? formatHoursMinutes(-l.atual.debitoMin) : '—'}
							</td>
							<td class="num neg">
								{l.atual.folgaMin ? formatHoursMinutes(-l.atual.folgaMin) : '—'}
							</td>
							<td class="col-saldo">
								<div class="barra" aria-hidden="true">
									<span
										class="barra__valor"
										class:barra__valor--neg={l.atual.saldoMin < 0}
										style:width="{(Math.abs(l.atual.saldoMin) / maxSaldo) * 50}%"
									></span>
								</div>
								<strong class:pos={l.atual.saldoMin > 0} class:neg={l.atual.saldoMin < 0}>
									{saldo(l.atual.saldoMin)}
								</strong>
							</td>
							<td>
								{#if l.anterior?.resultado}
									<Badge
										variant={l.anterior.resultado === 'pagar'
											? 'warning'
											: l.anterior.resultado === 'descontar'
												? 'danger'
												: 'neutral'}
									>
										{ROTULO_RESULTADO[l.anterior.resultado]}
										{l.anterior.resultadoMin ? formatHoursMinutes(l.anterior.resultadoMin) : ''}
									</Badge>
								{:else}
									<span class="hint">—</span>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</section>

{#if alvo}
	<div class="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="extrato-titulo">
		<div class="modal">
			<div class="modal__header">
				<div>
					<h2 class="modal__title" id="extrato-titulo">Extrato · {alvo.nome}</h2>
					{#if extratoAtivo && extratoAtivo.ciclos.length > 1}
						<select
							class="select-ciclo"
							bind:value={cicloSelecionado}
							onchange={() => abrirExtrato(alvo!, cicloSelecionado)}
							aria-label="Ciclo"
						>
							{#each [...extratoAtivo.ciclos].reverse() as c (c.inicio)}
								<option value={c.inicio}>{data(c.inicio)} a {data(c.fim)}</option>
							{/each}
						</select>
					{/if}
				</div>
				<button type="button" class="modal__close" onclick={fecharExtrato} aria-label="Fechar"
					>&times;</button
				>
			</div>

			<div class="modal__body">
				{#if errorMsg}
					<div class="alert alert--error" role="alert">{errorMsg}</div>
				{/if}
				{#if carregandoExtrato && !extratoAtivo}
					<p class="hint">Carregando…</p>
				{:else if extratoAtivo?.ciclo}
					{@const c = extratoAtivo.ciclo}
					<div class="ciclo ciclo--compacto">
						<div>
							<span class="hint">Créditos</span><strong class="pos">{saldo(c.creditoMin)}</strong>
						</div>
						<div>
							<span class="hint">Débitos</span><strong class="neg"
								>{formatHoursMinutes(-c.debitoMin)}</strong
							>
						</div>
						<div>
							<span class="hint">Folgas</span><strong class="neg"
								>{formatHoursMinutes(-c.folgaMin)}</strong
							>
						</div>
						<div>
							<span class="hint">Saldo</span>
							<strong class:pos={c.saldoMin > 0} class:neg={c.saldoMin < 0}
								>{saldo(c.saldoMin)}</strong
							>
						</div>
					</div>
					{#if c.resultado}
						<p class="hint">
							Ciclo encerrado: {ROTULO_RESULTADO[c.resultado].toLowerCase()}
							{c.resultadoMin ? formatHoursMinutes(c.resultadoMin) : ''}.
						</p>
					{/if}

					{#if !c.encerrado}
						<form
							class="folga"
							onsubmit={(e) => {
								e.preventDefault();
								lancarFolga();
							}}
						>
							<strong>Lançar folga compensatória</strong>
							<p class="hint">
								Consome do saldo o horário contratual de cada dia com expediente. Saldo atual:
								{saldo(c.saldoMin)}.
							</p>
							<div class="folga__campos">
								<label>De<input type="date" bind:value={folga.dataInicio} required /></label>
								<label
									>Até<input type="date" bind:value={folga.dataFim} min={folga.dataInicio} /></label
								>
								<label class="folga__motivo"
									>Motivo<input
										type="text"
										bind:value={folga.motivo}
										placeholder="Opcional"
									/></label
								>
							</div>
							<Button variant="primary" size="sm" type="submit" loading={salvando}
								>Lançar folga</Button
							>
						</form>
					{/if}

					{#if extratoAtivo.folgas.length}
						<div>
							<strong class="titulo-lista">Folgas lançadas no ciclo</strong>
							<ul class="folgas">
								{#each extratoAtivo.folgas as f (f.id)}
									<li>
										<span>
											{data(f.dataInicio)}{f.dataFim !== f.dataInicio
												? ` a ${data(f.dataFim)}`
												: ''}
											{#if f.motivo}<span class="hint">· {f.motivo}</span>{/if}
										</span>
										<Button variant="outline" size="sm" onclick={() => cancelarFolga(f.id)}
											>Cancelar</Button
										>
									</li>
								{/each}
							</ul>
						</div>
					{/if}

					<div>
						<strong class="titulo-lista">Movimentos</strong>
						{#if movimentos.length === 0}
							<p class="hint">Nenhum movimento neste ciclo.</p>
						{:else}
							<table class="tabela tabela--extrato">
								<thead>
									<tr>
										<th>Dia</th>
										<th>Ocorrência</th>
										<th class="num">Movimento</th>
										<th class="num">Saldo</th>
									</tr>
								</thead>
								<tbody>
									{#each movimentos as m (m.dia)}
										{@const delta = m.creditoMin - m.debitoMin - m.folgaMin}
										<tr>
											<td>{data(m.dia).slice(0, 5)}</td>
											<td
												>{m.folgaMin
													? 'Folga compensatória'
													: m.ocorrencia ||
														(delta > 0 ? 'Hora extra' : 'Atraso/saída antecipada')}</td
											>
											<td class="num" class:pos={delta > 0} class:neg={delta < 0}>{saldo(delta)}</td
											>
											<td class="num">{saldo(m.acumulado)}</td>
										</tr>
									{/each}
								</tbody>
							</table>
						{/if}
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	.hint {
		font-size: 0.8125rem;
		color: var(--color-text-muted);
		margin: 0;
	}

	.alert {
		padding: 0.75rem 1rem;
		border-radius: var(--radius-sm);
		font-size: 0.875rem;
	}

	.alert--error {
		background: var(--color-danger-bg);
		color: var(--color-danger);
	}

	.alert--warning {
		background: var(--color-surface-muted);
		border: 1px solid var(--color-border-strong);
		color: var(--color-text);
	}

	.empty,
	.vazio {
		text-align: center;
		color: var(--color-text-subtle);
		padding: 3rem 2rem;
	}

	.pos {
		color: var(--color-success-strong);
	}

	.neg {
		color: var(--color-danger);
	}

	.ciclo {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
		gap: 1rem;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		padding: 1rem 1.25rem;
		box-shadow: var(--shadow-card);
	}

	.ciclo div {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}

	.ciclo strong {
		font-variant-numeric: tabular-nums;
	}

	.ciclo--compacto {
		box-shadow: none;
		padding: 0.75rem 1rem;
		grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
	}

	.tabela-wrap {
		overflow-x: auto;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-card);
	}

	.tabela {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.875rem;
	}

	.tabela th {
		text-align: left;
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--color-text-muted);
		padding: 0.65rem 1rem;
		border-bottom: 1px solid var(--color-border);
		white-space: nowrap;
	}

	.tabela td {
		padding: 0.6rem 1rem;
		border-bottom: 1px solid var(--color-border);
		vertical-align: middle;
	}

	.tabela tbody tr:last-child td {
		border-bottom: none;
	}

	.num {
		text-align: right !important;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	.col-saldo {
		min-width: 12rem;
	}

	.col-saldo strong {
		font-variant-numeric: tabular-nums;
		font-size: 0.85rem;
	}

	/* Barra centrada no zero: crédito para a direita, débito para a esquerda. */
	.barra {
		position: relative;
		height: 6px;
		background: var(--color-surface-muted);
		border-radius: 3px;
		margin-bottom: 0.3rem;
	}

	.barra::before {
		content: '';
		position: absolute;
		left: 50%;
		top: -2px;
		bottom: -2px;
		width: 1px;
		background: var(--color-border-strong);
	}

	.barra__valor {
		position: absolute;
		left: 50%;
		top: 0;
		bottom: 0;
		background: var(--color-success-strong);
		border-radius: 3px;
	}

	.barra__valor--neg {
		left: auto;
		right: 50%;
		background: var(--color-danger);
	}

	.link {
		background: none;
		border: none;
		padding: 0;
		color: var(--color-primary);
		cursor: pointer;
		font-weight: 600;
		font-size: 0.875rem;
		text-align: left;
	}

	.sub {
		display: block;
		font-size: 0.75rem;
		color: var(--color-text-subtle);
	}

	.modal-backdrop {
		position: fixed;
		inset: 0;
		background: var(--color-overlay);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 50;
		padding: 1rem;
	}

	.modal {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		width: 100%;
		max-width: 620px;
		max-height: 90vh;
		display: flex;
		flex-direction: column;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.18);
	}

	.modal__header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		padding: 1.25rem 1.5rem;
		border-bottom: 1px solid var(--color-border);
	}

	.modal__title {
		font-size: 1.05rem;
		font-weight: 700;
		color: var(--color-text);
		margin-bottom: 0.35rem;
	}

	.modal__close {
		background: none;
		border: none;
		font-size: 1.5rem;
		line-height: 1;
		color: var(--color-text-muted);
		cursor: pointer;
		padding: 0.25rem;
	}

	.modal__body {
		padding: 1rem 1.5rem 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
		overflow-y: auto;
	}

	.select-ciclo,
	.folga input {
		border: 1.5px solid var(--color-border-strong);
		border-radius: var(--radius-sm);
		padding: 0.4rem 0.6rem;
		font-size: 0.85rem;
		background: var(--color-surface);
		color: var(--color-text);
	}

	.folga {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		align-items: flex-start;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		padding: 0.75rem 1rem;
	}

	.folga__campos {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		width: 100%;
	}

	.folga__campos label {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--color-text);
	}

	.folga__motivo {
		flex: 1;
		min-width: 160px;
	}

	.titulo-lista {
		display: block;
		font-size: 0.85rem;
		margin-bottom: 0.4rem;
	}

	.folgas {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		font-size: 0.85rem;
	}

	.folgas li {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.5rem;
	}

	.tabela--extrato th,
	.tabela--extrato td {
		padding: 0.4rem 0.5rem;
	}
</style>
