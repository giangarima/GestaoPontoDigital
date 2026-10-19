<!--
  @page /admin/escala
  @description Escala de folga do mês: pessoas × dias. O ciclo (6x1, 5x2, 12x36…)
  gera as folgas. Clicar num dia de trabalho dá folga: com banco de horas, é folga
  compensatória (consome saldo); sem banco, troca de escala. Clicar numa folga põe
  o dia como trabalho (ajuste). Alertas: repouso semanal (art. 67 da CLT), domingo no comércio (Lei
  10.101/2000, art. 6º) e dia de trabalho sem horário na jornada.
-->
<script lang="ts">
	import { resolve } from '$app/paths';
	import Badge from '@/components/ui/Badge.svelte';
	import Button from '@/components/ui/Button.svelte';
	import { departamentoService, type Departamento } from '@/services/departamento.service';
	import { bancoHorasService } from '@/services/banco-horas.service';
	import { capitalizar, formatHoursMinutes } from '@/utils/date';
	import {
		CICLOS_PADRAO,
		escalaService,
		type DiaEscala,
		type GradeEscala,
		type LinhaEscala,
		type SituacaoEscala
	} from '@/services/escala.service';

	const SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
	const ROTULO_SITUACAO: Record<SituacaoEscala, string> = {
		trabalho: 'Trabalho',
		folga: 'Folga',
		feriado: 'Feriado (folga)',
		folga_banco: 'Folga compensatória (banco de horas)',
		ausencia: 'Ausência',
		sem_jornada: 'Sem jornada'
	};
	const MARCA: Partial<Record<SituacaoEscala, string>> = {
		folga: 'F',
		feriado: 'FE',
		folga_banco: 'BH',
		ausencia: 'A'
	};
	const ROTULO_AUSENCIA: Record<string, string> = {
		ferias: 'Férias',
		atestado: 'Atestado',
		outro: 'Ausência justificada'
	};

	function rotuloDoDia(d: DiaEscala): string {
		if (d.situacao === 'ausencia') return ROTULO_AUSENCIA[d.ausenciaTipo ?? ''] ?? 'Ausência';
		return ROTULO_SITUACAO[d.situacao];
	}
	const ROTULO_ORIGEM = { ajuste: 'ajuste do dia', ciclo: 'ciclo', jornada: 'jornada semanal' };
	/** "pelo ciclo", "pela jornada semanal"… */
	const PELA_ORIGEM = {
		ajuste: 'pelo ajuste do dia',
		ciclo: 'pelo ciclo',
		jornada: 'pela jornada semanal'
	};

	function mesDe(d: Date): string {
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
	}
	function deslocarMes(mes: string, n: number): string {
		const [a, m] = mes.split('-').map(Number);
		return mesDe(new Date(a, m - 1 + n, 1));
	}
	function nomeDoMes(mes: string): string {
		const [a, m] = mes.split('-').map(Number);
		return capitalizar(
			new Date(a, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
		);
	}
	function curta(dia: string): string {
		const [, m, d] = dia.split('-');
		return `${d}/${m}`;
	}
	function semanaDe(dia: string): number {
		return new Date(`${dia}T12:00:00Z`).getUTCDay();
	}
	function nomeDoCiclo(seq: string | null): string {
		if (!seq) return 'jornada semanal';
		return Object.entries(CICLOS_PADRAO).find(([, s]) => s === seq)?.[0] ?? seq;
	}

	let mes = $state(mesDe(new Date()));
	let departamentoId = $state('');
	let departamentos = $state<Departamento[]>([]);
	let grade = $state<GradeEscala | null>(null);
	let loading = $state(false);
	let saving = $state(false);
	let errorMsg = $state('');

	const feriadoPorDia = $derived(new Map((grade?.feriados ?? []).map((f) => [f.dia, f])));
	const dias = $derived(grade?.colaboradores[0]?.dias.map((d) => d.dia) ?? []);
	const totalAlertas = $derived(
		(grade?.colaboradores ?? []).reduce((n, c) => n + c.alertas.length, 0)
	);

	async function carregar() {
		loading = true;
		errorMsg = '';
		try {
			grade = await escalaService.grade(mes, departamentoId || undefined);
		} catch {
			errorMsg = 'Erro ao carregar a escala.';
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		void mes;
		void departamentoId;
		carregar();
	});

	$effect(() => {
		departamentoService
			.list()
			.then((l) => (departamentos = l))
			.catch(() => {});
	});

	// ── Ajuste de um dia ──────────────────────────────────────────────────────
	let alvoDia = $state<{ linha: LinhaEscala; dia: DiaEscala } | null>(null);
	let motivo = $state('');
	/** Saldo do banco no ciclo atual, para o modal mostrar antes de dar a folga. */
	let saldoBanco = $state<number | null>(null);
	/** Intervalo da folga compensatória do dia clicado (pode cobrir vários dias). */
	let folgaDoDia = $state<{ dataInicio: string; dataFim: string } | null>(null);

	async function abrirDia(linha: LinhaEscala, dia: DiaEscala) {
		alvoDia = { linha, dia };
		motivo = '';
		saldoBanco = null;
		folgaDoDia = null;
		if (!grade?.bancoAtivo || (dia.situacao !== 'trabalho' && dia.situacao !== 'folga_banco'))
			return;
		try {
			const extrato = await bancoHorasService.extrato(linha.id);
			if (extrato.regime === 'nenhum') return;
			saldoBanco = extrato.ciclo?.saldoMin ?? 0;
			folgaDoDia = extrato.folgas.find((f) => f.id === dia.ausenciaId) ?? null;
		} catch {
			// O saldo é informativo: sem ele, o modal ainda funciona.
		}
	}

	/** Folga num dia de trabalho: com banco, é folga compensatória; sem banco, troca de escala. */
	async function darFolga() {
		if (!alvoDia) return;
		if (!grade?.bancoAtivo) return ajustar(false);
		saving = true;
		errorMsg = '';
		try {
			await bancoHorasService.lancarFolga(alvoDia.linha.id, {
				dataInicio: alvoDia.dia.dia,
				dataFim: alvoDia.dia.dia,
				motivo
			});
			alvoDia = null;
			await carregar();
		} catch (e) {
			const err = e as { details?: { error?: string } };
			errorMsg = err.details?.error ?? 'Erro ao lançar a folga.';
		} finally {
			saving = false;
		}
	}

	async function cancelarFolga() {
		if (!alvoDia?.dia.ausenciaId) return;
		saving = true;
		errorMsg = '';
		try {
			await bancoHorasService.cancelarFolga(alvoDia.linha.id, alvoDia.dia.ausenciaId);
			alvoDia = null;
			await carregar();
		} catch {
			errorMsg = 'Erro ao cancelar a folga.';
		} finally {
			saving = false;
		}
	}

	async function ajustar(trabalha: boolean | null) {
		if (!alvoDia) return;
		saving = true;
		errorMsg = '';
		try {
			await escalaService.ajustar(alvoDia.linha.id, alvoDia.dia.dia, trabalha, motivo);
			alvoDia = null;
			await carregar();
		} catch (e) {
			const err = e as { details?: { error?: string } };
			errorMsg = err.details?.error ?? 'Erro ao ajustar o dia.';
		} finally {
			saving = false;
		}
	}

	// ── Ciclo ─────────────────────────────────────────────────────────────────
	let alvoCiclo = $state<LinhaEscala | null>(null);
	let sequencia = $state('');
	let vigencia = $state('');

	function abrirCiclo(linha: LinhaEscala) {
		alvoCiclo = linha;
		sequencia = linha.ciclo ?? CICLOS_PADRAO['6x1'];
		vigencia = `${mes}-01`;
	}

	const sequenciaOk = $derived(
		/^[TF]{2,28}$/.test(sequencia) && /T/.test(sequencia) && /F/.test(sequencia)
	);

	/** Os próximos 14 dias a partir da vigência, para conferir onde caem as folgas. */
	const previa = $derived.by(() => {
		if (!sequenciaOk || !/^\d{4}-\d{2}-\d{2}$/.test(vigencia)) return [];
		const base = new Date(`${vigencia}T12:00:00Z`);
		return Array.from({ length: 14 }, (_, i) => {
			const d = new Date(base.getTime() + i * 86_400_000);
			return {
				semana: SEMANA[d.getUTCDay()],
				dia: d.getUTCDate(),
				folga: sequencia[i % sequencia.length] === 'F'
			};
		});
	});

	async function salvarCiclo(seq: string | null) {
		if (!alvoCiclo) return;
		saving = true;
		errorMsg = '';
		try {
			await escalaService.definirCiclo(alvoCiclo.id, { vigenciaInicio: vigencia, sequencia: seq });
			alvoCiclo = null;
			await carregar();
		} catch (e) {
			const err = e as { details?: { error?: string } };
			errorMsg = err.details?.error ?? 'Erro ao salvar o ciclo.';
		} finally {
			saving = false;
		}
	}
</script>

<svelte:head>
	<title>Escala de folga — On Time</title>
</svelte:head>

<section class="admin-page">
	<header class="admin-page__header">
		<h1>Escala de folga</h1>
		<div class="filtros">
			<Button variant="outline" size="sm" onclick={() => (mes = deslocarMes(mes, -1))}>‹</Button>
			<strong class="mes">{nomeDoMes(mes)}</strong>
			<Button variant="outline" size="sm" onclick={() => (mes = deslocarMes(mes, 1))}>›</Button>
			<select bind:value={departamentoId} aria-label="Departamento">
				<option value="">Todos os departamentos</option>
				{#each departamentos as d (d.id)}
					<option value={d.id}>{d.nome}</option>
				{/each}
			</select>
		</div>
	</header>

	<p class="hint">
		O ciclo gera as folgas de cada pessoa; sem ciclo, vale o padrão semanal da jornada. Clique no
		nome para definir o ciclo e num dia para dar ou tirar folga{grade?.bancoAtivo
			? ' — folga num dia de trabalho desconta do banco de horas'
			: ''}.
	</p>

	{#if errorMsg}
		<div class="alert alert--error" role="alert">{errorMsg}</div>
	{/if}

	<div class="legenda" aria-hidden="true">
		<span><i class="cel cel--trabalho"></i> Trabalho</span>
		<span><i class="cel cel--folga">F</i> Folga</span>
		<span><i class="cel cel--feriado">FE</i> Feriado</span>
		<span><i class="cel cel--folga_banco">BH</i> Folga do banco</span>
		<span><i class="cel cel--ausencia">A</i> Ausência</span>
		<span><i class="cel cel--trabalho cel--ajuste"></i> Ajuste do dia</span>
		<span><i class="cel cel--trabalho cel--alerta"></i> Alerta</span>
	</div>

	{#if loading && !grade}
		<p class="empty">Carregando...</p>
	{:else if grade && grade.colaboradores.length === 0}
		<p class="empty">Nenhum colaborador neste filtro.</p>
	{:else if grade}
		<div class="grade-wrap">
			<table class="grade">
				<thead>
					<tr>
						<th class="col-nome">Colaborador</th>
						{#each dias as dia (dia)}
							{@const fer = feriadoPorDia.get(dia)}
							<th class:domingo={semanaDe(dia) === 0} class:th-feriado={fer} title={fer?.nome}>
								<span class="th-sem">{SEMANA[semanaDe(dia)]}</span>
								<span>{Number(dia.slice(8))}</span>
							</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each grade.colaboradores as c (c.id)}
						{@const diasComAlerta = new Set(c.alertas.map((a) => a.dia))}
						<tr>
							<th class="col-nome" scope="row">
								<span class="col-nome__linha">
									<button
										type="button"
										class="nome"
										title={`${c.nome} · ciclo: ${nomeDoCiclo(c.ciclo)}`}
										onclick={() => abrirCiclo(c)}>{c.nome}</button
									>
									{#if c.ciclo}<span class="chip">{nomeDoCiclo(c.ciclo)}</span>{/if}
									{#if c.alertas.length}
										<Badge variant="warning">{c.alertas.length}</Badge>
									{/if}
								</span>
							</th>
							{#each c.dias as d (d.dia)}
								<td>
									<button
										type="button"
										class="cel cel--{d.situacao}"
										class:cel--ajuste={d.origem === 'ajuste'}
										class:cel--alerta={diasComAlerta.has(d.dia)}
										disabled={d.situacao === 'sem_jornada' || d.situacao === 'ausencia'}
										title={`${curta(d.dia)} · ${rotuloDoDia(d)}${d.situacao === 'trabalho' || d.situacao === 'folga' ? ` (${ROTULO_ORIGEM[d.origem]})` : ''}`}
										onclick={() => abrirDia(c, d)}
									>
										{MARCA[d.situacao] ?? ''}
									</button>
								</td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		{#if totalAlertas > 0}
			<section class="alertas">
				<h2>Alertas ({totalAlertas})</h2>
				<ul>
					{#each grade.colaboradores as c (c.id)}
						{#each c.alertas as a (a.tipo + a.dia)}
							<li><strong>{c.nome}</strong> · {curta(a.dia)} — {a.mensagem}</li>
						{/each}
					{/each}
				</ul>
			</section>
		{/if}
	{/if}
</section>

{#if alvoDia}
	{@const { linha, dia } = alvoDia}
	<div class="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="dia-titulo">
		<div class="modal">
			<div class="modal__header">
				<div>
					<h2 class="modal__title" id="dia-titulo">{linha.nome} · {curta(dia.dia)}</h2>
					<p class="hint">
						{rotuloDoDia(dia)}{dia.situacao === 'trabalho' || dia.situacao === 'folga'
							? `, ${PELA_ORIGEM[dia.origem]}`
							: ''}.
					</p>
				</div>
				<button
					type="button"
					class="modal__close"
					onclick={() => (alvoDia = null)}
					aria-label="Fechar">&times;</button
				>
			</div>
			<div class="modal__body">
				{#if dia.situacao === 'feriado'}
					<p class="hint">
						É feriado e {linha.nome.split(' ')[0]} não está na escala do dia. Para escalar, use a tela
						<a href={resolve('/admin/feriados', {})}>Feriados</a>.
					</p>
				{:else if dia.situacao === 'folga_banco'}
					<p class="hint">
						Folga compensatória: consome {formatHoursMinutes(dia.contratualMin)} do banco de horas.
						{#if folgaDoDia && folgaDoDia.dataInicio !== folgaDoDia.dataFim}
							Ela vai de {curta(folgaDoDia.dataInicio)} a {curta(folgaDoDia.dataFim)}; cancelar
							desfaz o intervalo inteiro.
						{/if}
					</p>
				{:else}
					{#if dia.situacao === 'trabalho'}
						{#if grade?.bancoAtivo}
							<p class="hint">
								A folga desconta {formatHoursMinutes(dia.contratualMin)} do banco de horas.
								{#if saldoBanco !== null}
									Saldo atual: <strong
										>{saldoBanco > 0 ? '+' : ''}{formatHoursMinutes(saldoBanco)}</strong
									>.
								{/if}
							</p>
						{:else}
							<p class="hint">
								A empresa não usa banco de horas: a folga só troca o dia na escala.
							</p>
						{/if}
					{/if}
					<div class="field">
						<label for="motivo">Motivo (opcional)</label>
						<input
							id="motivo"
							type="text"
							bind:value={motivo}
							placeholder="Ex: troca com a Maria"
						/>
					</div>
				{/if}
			</div>
			<div class="modal__footer">
				{#if dia.origem === 'ajuste' && (dia.situacao === 'trabalho' || dia.situacao === 'folga')}
					<Button variant="outline" loading={saving} onclick={() => ajustar(null)}
						>Desfazer ajuste</Button
					>
				{/if}
				<div class="modal__footer-spacer"></div>
				{#if dia.situacao === 'folga_banco'}
					<Button variant="danger" loading={saving} onclick={cancelarFolga}
						>Cancelar folga compensatória</Button
					>
				{:else if dia.situacao === 'trabalho'}
					<Button variant="primary" loading={saving} onclick={darFolga}
						>{grade?.bancoAtivo ? 'Dar folga (banco de horas)' : 'Marcar folga'}</Button
					>
				{:else if dia.situacao === 'folga'}
					<Button variant="primary" loading={saving} onclick={() => ajustar(true)}
						>Marcar trabalho</Button
					>
				{/if}
			</div>
		</div>
	</div>
{/if}

{#if alvoCiclo}
	<div class="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="ciclo-titulo">
		<div class="modal">
			<div class="modal__header">
				<div>
					<h2 class="modal__title" id="ciclo-titulo">Ciclo de {alvoCiclo.nome}</h2>
					<p class="hint">Atual: {nomeDoCiclo(alvoCiclo.ciclo)}</p>
				</div>
				<button
					type="button"
					class="modal__close"
					onclick={() => (alvoCiclo = null)}
					aria-label="Fechar">&times;</button
				>
			</div>
			<div class="modal__body">
				<div class="presets">
					{#each Object.entries(CICLOS_PADRAO) as [nome, seq] (nome)}
						<Button
							variant={sequencia === seq ? 'primary' : 'outline'}
							size="sm"
							onclick={() => (sequencia = seq)}>{nome}</Button
						>
					{/each}
				</div>
				<div class="field">
					<label for="sequencia">Sequência (T = trabalho, F = folga)</label>
					<input
						id="sequencia"
						type="text"
						value={sequencia}
						oninput={(e) => (sequencia = e.currentTarget.value.toUpperCase().replace(/[^TF]/g, ''))}
						maxlength="28"
					/>
				</div>
				<div class="field">
					<label for="vigencia">A partir de (o 1º dia da sequência cai nesta data)</label>
					<input id="vigencia" type="date" bind:value={vigencia} />
				</div>
				{#if previa.length}
					<div class="previa" aria-label="Próximos 14 dias">
						{#each previa as p, i (i)}
							<span class="previa__dia" class:previa__dia--folga={p.folga}>
								<small>{p.semana}</small>{p.dia}
							</span>
						{/each}
					</div>
				{:else}
					<p class="hint">A sequência precisa ter pelo menos um T e um F.</p>
				{/if}
				<p class="hint">
					Os dias de trabalho usam o horário da jornada para aquele dia da semana. Mudar o ciclo não
					altera dias anteriores à data escolhida.
				</p>
			</div>
			<div class="modal__footer">
				<Button variant="outline" loading={saving} onclick={() => salvarCiclo(null)}>
					Voltar à jornada semanal
				</Button>
				<div class="modal__footer-spacer"></div>
				<Button
					variant="primary"
					loading={saving}
					disabled={!sequenciaOk}
					onclick={() => salvarCiclo(sequencia)}
				>
					Salvar ciclo
				</Button>
			</div>
		</div>
	</div>
{/if}

<style>
	.filtros {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.mes {
		min-width: 9.5rem;
		text-align: center;
	}

	.filtros select,
	.field input {
		border: 1.5px solid var(--color-border-strong);
		border-radius: var(--radius-sm);
		padding: 0.45rem 0.65rem;
		font-size: 0.875rem;
		background: var(--color-surface);
		color: var(--color-text);
	}

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

	.empty {
		text-align: center;
		color: var(--color-text-subtle);
		padding: 4rem 2rem;
	}

	.legenda {
		display: flex;
		flex-wrap: wrap;
		gap: 1rem;
		font-size: 0.8rem;
		color: var(--color-text-muted);
	}

	.legenda span {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
	}

	.legenda .cel {
		width: 1.4rem;
		height: 1.4rem;
		font-style: normal;
	}

	/*
	 * A grade ocupa a largura disponível com células fluidas; só rola na
	 * horizontal quando não cabe (celular), e aí com barra fina no tom do tema.
	 */
	.grade-wrap {
		overflow-x: auto;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-card);
		scrollbar-width: thin;
		scrollbar-color: var(--color-border-strong) transparent;
	}

	.grade-wrap::-webkit-scrollbar {
		height: 8px;
	}

	.grade-wrap::-webkit-scrollbar-track {
		background: transparent;
	}

	.grade-wrap::-webkit-scrollbar-thumb {
		background: var(--color-border-strong);
		border-radius: 4px;
		border: 2px solid var(--color-surface);
	}

	.grade {
		width: 100%;
		/* Abaixo disto a grade rola no contêiner: nome + 31 dias + espaçamento. */
		min-width: calc(10rem + 31 * 1.35rem + 4rem);
		table-layout: fixed;
		border-collapse: separate;
		border-spacing: 2px;
		font-size: 0.75rem;
		padding: 0.5rem;
	}

	.grade thead th {
		font-weight: 600;
		color: var(--color-text-muted);
		text-align: center;
		padding: 0.25rem 0;
		line-height: 1.1;
	}

	.grade thead th span {
		display: block;
	}

	.grade td {
		padding: 0;
		text-align: center;
	}

	.th-sem {
		font-size: 0.65rem;
		color: var(--color-text-subtle);
	}

	.grade th.domingo {
		color: var(--color-danger-dot);
	}

	.grade th.th-feriado {
		background: var(--color-surface-muted);
		border-radius: var(--radius-sm);
	}

	.col-nome {
		position: sticky;
		left: 0;
		z-index: 1;
		width: 10rem;
		background: var(--color-surface);
		text-align: left !important;
		padding-right: 0.5rem !important;
	}

	.col-nome__linha {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		min-width: 0;
	}

	.nome {
		background: none;
		border: none;
		padding: 0;
		min-width: 0;
		font: inherit;
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--color-text);
		text-align: left;
		cursor: pointer;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.nome:hover {
		text-decoration: underline;
		text-underline-offset: 2px;
	}

	.chip {
		flex-shrink: 0;
		font-size: 0.65rem;
		font-weight: 600;
		padding: 0.05rem 0.35rem;
		border-radius: var(--radius-pill);
		background: var(--color-primary-soft);
		color: var(--color-primary-soft-fg);
	}

	.cel {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		max-width: 1.9rem;
		aspect-ratio: 1;
		border-radius: var(--radius-sm);
		border: 1px solid var(--color-border);
		font-size: 0.6rem;
		font-weight: 700;
		cursor: pointer;
		padding: 0;
		position: relative;
	}

	.cel--trabalho {
		background: var(--color-surface);
		color: var(--color-text);
	}

	.cel--folga {
		background: var(--color-surface-muted);
		color: var(--color-text-muted);
	}

	.cel--feriado {
		background: var(--color-success-bg);
		color: var(--color-success-strong);
	}

	.cel--folga_banco {
		background: var(--color-primary-soft);
		color: var(--color-primary-soft-fg);
	}

	.cel--ausencia {
		background: var(--color-info-bg);
		color: var(--color-info);
		cursor: default;
	}

	.cel--sem_jornada {
		background: transparent;
		border-style: dashed;
		cursor: default;
	}

	/* Ajuste do dia: um ponto no canto, para não competir com o F. */
	.cel--ajuste::after {
		content: '';
		position: absolute;
		top: 2px;
		right: 2px;
		width: 5px;
		height: 5px;
		border-radius: 50%;
		background: var(--color-primary);
	}

	.cel--alerta {
		border: 2px solid var(--color-danger);
	}

	.cel:focus-visible {
		outline: 2px solid var(--color-primary);
		outline-offset: 1px;
	}

	.alertas h2 {
		font-size: 0.95rem;
		margin-bottom: 0.5rem;
	}

	.alertas ul {
		margin: 0;
		padding-left: 1.1rem;
		font-size: 0.85rem;
		color: var(--color-text);
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
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
		max-width: 460px;
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
		padding: 1rem 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 0.85rem;
		overflow-y: auto;
	}

	.modal__footer {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 1rem 1.5rem;
		border-top: 1px solid var(--color-border);
		flex-wrap: wrap;
	}

	.modal__footer-spacer {
		flex: 1;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.field label {
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--color-text);
	}

	.presets {
		display: flex;
		gap: 0.4rem;
		flex-wrap: wrap;
	}

	.previa {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		gap: 3px;
	}

	.previa__dia {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 0.25rem 0;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: 0.8rem;
		font-variant-numeric: tabular-nums;
	}

	.previa__dia small {
		font-size: 0.65rem;
		color: var(--color-text-subtle);
	}

	.previa__dia--folga {
		background: var(--color-surface-muted);
		color: var(--color-text-muted);
		font-weight: 700;
	}
</style>
