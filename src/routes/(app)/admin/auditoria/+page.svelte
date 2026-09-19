<!--
  @page /admin/auditoria
  @description Auditoria de integridade do diário de marcações (Portaria 671/2021).

  Recalcula a hash-chain das batidas e confere a sequência de NSR: mostra se o
  diário está íntegro e, se não estiver, onde a cadeia quebrou e quais NSRs
  sumiram. A tabela de elos deixa visível o encadeamento (cada batida guarda o
  hash da anterior).
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { auditoriaService, type Auditoria, type HoraLegal } from '@/services/auditoria.service';
	import { formatDate, formatTime } from '@/utils/date';
	import Button from '@/components/ui/Button.svelte';
	import Card from '@/components/ui/Card.svelte';
	import Icon from '@/components/ui/Icon.svelte';
	import StatCard from '@/components/ui/StatCard.svelte';

	const TIPO_LABEL: Record<string, string> = {
		entrada: 'Entrada',
		saida_almoco: 'Saída para almoço',
		retorno_almoco: 'Retorno do almoço',
		saida: 'Saída'
	};

	const MOTIVO_EXPLICADO: Record<string, string> = {
		'hash não corresponde (conteúdo alterado)':
			'O conteúdo desta batida foi alterado depois de gravado: o hash recalculado não confere com o hash registrado.',
		'hashAnterior não corresponde':
			'O elo com a batida anterior não confere: uma batida anterior foi excluída ou teve o hash reescrito.'
	};

	let resultado = $state<Auditoria | null>(null);
	let loading = $state(false);
	let errorMsg = $state('');

	const ausentesOcultos = $derived(
		resultado ? resultado.sequencia.totalAusentes - resultado.sequencia.ausentes.length : 0
	);

	/** Elo i confere com o próximo da lista (a batida anterior, pois a lista é decrescente)? */
	function statusElo(i: number): 'ok' | 'falha' | 'inicio' | 'fora' {
		if (!resultado) return 'fora';
		const elo = resultado.elos[i];
		if (elo.hashAnterior === null) return 'inicio';
		const anterior = resultado.elos[i + 1];
		if (!anterior) return 'fora';
		return elo.hashAnterior === anterior.hash ? 'ok' : 'falha';
	}

	function curto(hash: string | null): string {
		return hash ? `${hash.slice(0, 8)}…${hash.slice(-6)}` : '—';
	}

	function dataHora(iso: string): string {
		return `${formatDate(iso)} ${formatTime(iso)}`;
	}

	// Relógio do REP × Hora Legal Brasileira (NTP.br). Carrega à parte: uma
	// falha de rede no NTP não pode esconder a auditoria do diário.
	let horaLegal = $state<HoraLegal | null>(null);
	let horaLegalErro = $state(false);

	async function medirHoraLegal() {
		horaLegalErro = false;
		try {
			horaLegal = await auditoriaService.horaLegal();
		} catch {
			horaLegalErro = true;
		}
	}

	/** "adiantado 1,2 s" / "atrasado 35 ms" do ponto de vista do relógio do servidor. */
	function descreverDiferenca(offsetMs: number): string {
		const abs = Math.abs(offsetMs);
		const valor = abs >= 1000 ? `${(abs / 1000).toLocaleString('pt-BR')} s` : `${abs} ms`;
		if (abs === 0) return 'sem diferença';
		return `${offsetMs > 0 ? 'atrasado' : 'adiantado'} ${valor}`;
	}

	async function verificar() {
		medirHoraLegal();
		loading = true;
		errorMsg = '';
		try {
			resultado = await auditoriaService.verificar();
		} catch {
			errorMsg = 'Erro ao verificar a integridade do diário.';
		} finally {
			loading = false;
		}
	}

	onMount(verificar);
</script>

<svelte:head><title>Auditoria — Admin</title></svelte:head>

<section class="admin-page">
	<header class="admin-page__header">
		<h1>Auditoria de integridade</h1>
		<Button variant="outline" {loading} onclick={verificar}>Verificar novamente</Button>
	</header>

	<p class="muted">
		Confere se alguma marcação foi alterada ou excluída depois de registrada. Cada batida guarda o
		hash SHA-256 da anterior, e todo evento recebe um número sequencial (NSR), conforme a Portaria
		MTP nº 671/2021.
	</p>

	{#if errorMsg}<div class="error">{errorMsg}</div>{/if}

	{#if resultado}
		<div class="status" class:status--falha={!resultado.integra} role="status">
			<Icon name={resultado.integra ? 'shield' : 'alert'} size={28} />
			<div>
				<strong>{resultado.integra ? 'Diário íntegro' : 'Integridade comprometida'}</strong>
				<span>
					{resultado.cadeia.total} batida(s) conferida(s) · verificado em
					{dataHora(resultado.verificadoEm)}
				</span>
			</div>
		</div>

		<div class="stats">
			<StatCard label="Batidas conferidas" value={resultado.cadeia.total} tone="info" />
			<StatCard label="Último NSR emitido" value={resultado.sequencia.ultimoNsr} tone="neutral" />
			<StatCard
				label="Hash-chain"
				value={resultado.cadeia.valida ? 'Íntegra' : 'Quebrada'}
				tone={resultado.cadeia.valida ? 'success' : 'danger'}
			/>
			<StatCard
				label="NSRs ausentes"
				value={resultado.sequencia.totalAusentes}
				tone={resultado.sequencia.totalAusentes === 0 ? 'success' : 'danger'}
			/>
		</div>

		<Card>
			<h2>Relógio do REP × Hora Legal Brasileira</h2>
			{#if horaLegalErro}
				<p class="muted">Não foi possível consultar a hora legal agora.</p>
			{:else if !horaLegal}
				<p class="muted">Consultando o NTP.br…</p>
			{:else}
				{@const m = horaLegal.medicao}
				<p class="explicacao">
					{#if m}
						Relógio do servidor {descreverDiferenca(m.offsetMs)} em relação à hora legal.
					{:else}
						Nenhum servidor NTP respondeu: a hospedagem pode estar bloqueando a porta UDP 123.
					{/if}
				</p>
				<dl class="detalhes">
					{#if m}
						<dt>Servidor</dt>
						<dd class="mono">{m.servidor} (estrato {m.estrato})</dd>
						<dt>Diferença</dt>
						<dd class="mono">{m.offsetMs} ms</dd>
						<dt>Atraso de rede</dt>
						<dd class="mono">{m.atrasoMs} ms</dd>
					{/if}
					{#each horaLegal.falhas as f (f.servidor)}
						<dt>Falha</dt>
						<dd><span class="mono">{f.servidor}</span>: {f.erro}</dd>
					{/each}
					<dt>Consultado em</dt>
					<dd>{dataHora(horaLegal.consultadoEm)}</dd>
				</dl>
			{/if}
		</Card>

		{#if resultado.quebra}
			<Card>
				<h2>Onde a cadeia quebrou</h2>
				<p class="explicacao">
					{MOTIVO_EXPLICADO[resultado.cadeia.motivo ?? ''] ?? resultado.cadeia.motivo}
				</p>
				<dl class="detalhes">
					<dt>NSR</dt>
					<dd class="mono">{resultado.quebra.nsr}</dd>
					<dt>Colaborador</dt>
					<dd>{resultado.quebra.colaborador}</dd>
					<dt>Tipo</dt>
					<dd>{TIPO_LABEL[resultado.quebra.tipo] ?? resultado.quebra.tipo}</dd>
					<dt>Marcação</dt>
					<dd>{dataHora(resultado.quebra.marcadoEm)}</dd>
					<dt>Gravação</dt>
					<dd>{dataHora(resultado.quebra.registradoEm)}</dd>
				</dl>
			</Card>
		{/if}

		{#if resultado.sequencia.totalAusentes > 0}
			<Card>
				<h2>NSRs ausentes</h2>
				<p class="explicacao">
					Estes números sequenciais foram emitidos, mas o registro correspondente não existe mais
					(batida ou evento de cadastro excluído do banco).
				</p>
				<ul class="nsrs">
					{#each resultado.sequencia.ausentes as nsr (nsr)}
						<li class="mono">{nsr}</li>
					{/each}
					{#if ausentesOcultos > 0}
						<li class="nsrs__mais">+ {ausentesOcultos} outros</li>
					{/if}
				</ul>
			</Card>
		{/if}

		<Card>
			<h2>Últimos elos da cadeia</h2>
			{#if resultado.elos.length === 0}
				<p class="muted">Nenhuma batida registrada ainda.</p>
			{:else}
				<div class="table-wrap">
					<table>
						<thead>
							<tr>
								<th>NSR</th>
								<th>Colaborador</th>
								<th>Tipo</th>
								<th>Marcação</th>
								<th>Hash</th>
								<th>Hash anterior</th>
								<th>Elo</th>
							</tr>
						</thead>
						<tbody>
							{#each resultado.elos as elo, i (elo.nsr)}
								{@const status = statusElo(i)}
								<tr class:quebra={elo.nsr === resultado.cadeia.quebraNsr}>
									<td class="mono">{elo.nsr}</td>
									<td>{elo.colaborador}</td>
									<td>{TIPO_LABEL[elo.tipo] ?? elo.tipo}</td>
									<td class="num">{dataHora(elo.marcadoEm)}</td>
									<td class="mono" title={elo.hash}>{curto(elo.hash)}</td>
									<td class="mono" title={elo.hashAnterior ?? 'primeira batida'}>
										{curto(elo.hashAnterior)}
									</td>
									<td class="elo elo--{status}">
										{#if status === 'ok'}✓{:else if status === 'falha'}✗{:else if status === 'inicio'}início{:else}—{/if}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</Card>
	{:else if loading}
		<p class="muted">Verificando o diário…</p>
	{/if}
</section>

<style>
	.muted {
		margin: 0;
		color: var(--color-text-muted);
		font-size: 0.9rem;
		line-height: 1.5;
		max-width: 70ch;
	}

	.error {
		background: var(--color-danger-bg);
		color: #b91c1c;
		padding: 0.625rem 0.875rem;
		border-radius: var(--radius-sm);
		font-size: 0.875rem;
	}

	.status {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 1rem 1.25rem;
		border-radius: var(--radius-md);
		border: 1px solid #bbf7d0;
		background: var(--color-success-bg);
		color: var(--color-success);
	}

	.status--falha {
		border-color: var(--color-danger-border);
		background: var(--color-danger-bg);
		color: var(--color-danger);
	}

	.status div {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
	}

	.status strong {
		font-size: 1.125rem;
	}

	.status span {
		color: var(--color-text-muted);
		font-size: 0.875rem;
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

	.explicacao {
		margin: -0.5rem 0 1rem;
		color: var(--color-text-muted);
		font-size: 0.875rem;
		line-height: 1.5;
	}

	.detalhes {
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: 0.5rem 1.5rem;
		margin: 0;
		font-size: 0.875rem;
	}

	.detalhes dt {
		color: var(--color-text-subtle);
		font-weight: 600;
	}

	.detalhes dd {
		margin: 0;
		color: var(--color-text);
	}

	.nsrs {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.nsrs li {
		padding: 0.25rem 0.625rem;
		border-radius: var(--radius-pill);
		background: var(--color-danger-bg);
		color: var(--color-danger);
		font-size: 0.8125rem;
	}

	.nsrs .nsrs__mais {
		background: var(--color-surface-muted);
		color: var(--color-text-muted);
	}

	.mono {
		font-family: ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace;
		font-size: 0.8125rem;
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
		letter-spacing: 0.05em;
		border-bottom: 1px solid var(--color-border);
		white-space: nowrap;
	}

	td {
		padding: 0.75rem;
		border-bottom: 1px solid var(--color-surface-muted);
		white-space: nowrap;
	}

	td.num {
		font-variant-numeric: tabular-nums;
	}

	tr.quebra td {
		background: var(--color-danger-bg);
	}

	.elo {
		font-weight: 700;
		text-align: center;
	}

	.elo--ok {
		color: var(--color-success);
	}

	.elo--falha {
		color: var(--color-danger);
	}

	.elo--inicio,
	.elo--fora {
		color: var(--color-text-subtle);
		font-weight: 500;
	}
</style>
