<!--
  @component EspelhoMensal
  @description Grid mensal de batidas para um colaborador.

  Cada linha = um dia do mês. Colunas = Entrada 1, Saída 1, … (quantas o dia mais cheio pedir)
  e o Total; a batida vai para a coluna do rótulo quando ele é coerente, senão pela posição
  (`colunasDoDia`). No modo leitura, a tabela do colaborador mostra só o que ele bateu, sem
  sinal do tratamento do admin, que fica na tabela ao lado.
  Por padrão é somente leitura (espelho). Com `editavel`, vira ferramenta de ajuste:
  click em célula vazia → registrar batida manual; click em batida → ajustar/anular
  (Portaria 671: a original nunca é editada — ajustar cria a corrigida vinculada).
-->
<script lang="ts">
	import {
		relatorioService,
		type EspelhoRelatorio,
		type EspelhoDia
	} from '@/services/relatorio.service';
	import { registroAdminService } from '@/services/registro-admin.service';
	import type { RegistroRecord, RegistroType } from '@/services/timesheet.service';
	import RegistroManualModal from './RegistroManualModal.svelte';
	import RegistroAjusteModal from './RegistroAjusteModal.svelte';
	import ReverterAnulacaoModal from './ReverterAnulacaoModal.svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import { recarregarResumo } from '@/store/resumo.store';
	import Icon from '@/components/ui/Icon.svelte';
	import { descreverLocalizacao, linkMapa } from '@/utils/geolocalizacao';
	import { ROTULO_TIPO, type FeriadoDoDia } from '@/services/feriado.service';
	import {
		celulasComAjustes,
		celulasOriginais,
		colunasDoDia,
		rotuloColuna,
		totalDeColunas,
		type Celula
	} from '@/utils/espelho-colunas';

	interface Props {
		colaboradorId: string;
		colaboradorNome: string;
		/** Mês no formato YYYY-MM */
		mes: string;
		/** Habilita edição (ajuste/manual). Padrão: somente leitura. */
		editavel?: boolean;
	}

	let { colaboradorId, colaboradorNome, mes, editavel = false }: Props = $props();

	const TIPOS_ORDEM: RegistroType[] = ['entrada', 'saida_almoco', 'retorno_almoco', 'saida'];
	/** Rótulo gravado na batida incluída na posição `i` (a apuração só olha a ordem). */
	const tipoDaPosicao = (i: number): RegistroType =>
		TIPOS_ORDEM[i] ?? (i % 2 === 0 ? 'entrada' : 'saida');
	const DIA_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

	let espelho = $state<EspelhoRelatorio | null>(null);
	let carregando = $state(false);
	let erro = $state('');

	let modalManualAberto = $state(false);
	let modalAjusteAberto = $state(false);
	let modalReverterAberto = $state(false);
	let dataInicialModal = $state('');
	let tipoInicialModal = $state<RegistroType>('entrada');
	let registroSelecionado = $state<RegistroRecord | null>(null);

	/** Gera a lista de dias do mês com batidas mescladas. */
	let dias = $derived.by(() => {
		if (!mes) return [];
		const [ano, mm] = mes.split('-').map(Number);
		const totalDias = new Date(ano, mm, 0).getDate();
		const mapa = new SvelteMap<string, EspelhoDia>();
		if (espelho) {
			for (const d of espelho.dias) mapa.set(d.date, d);
		}
		const feriados = new Map((espelho?.feriados ?? []).map((f) => [f.data, f]));
		const out: Array<{
			date: string;
			diaSemana: number;
			diaNum: number;
			summary: EspelhoDia | null;
			isFimSemana: boolean;
			feriado: FeriadoDoDia | null;
		}> = [];
		for (let d = 1; d <= totalDias; d++) {
			const date = `${ano}-${String(mm).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
			const dt = new Date(`${date}T12:00:00`);
			const dow = dt.getDay();
			out.push({
				date,
				diaSemana: dow,
				diaNum: d,
				summary: mapa.get(date) ?? null,
				isFimSemana: dow === 0 || dow === 6,
				feriado: feriados.get(date) ?? null
			});
		}
		return out;
	});

	/**
	 * Dia com tratamento do admin: inclusão (lançamento manual / batida corrigida) ou
	 * marcação desconsiderada — exatamente onde a visão do colaborador e a com
	 * ajustes divergem.
	 */
	function ajustadoNoDia(summary: EspelhoDia | null): boolean {
		return !!summary?.registros.some((r) => r.createdBy != null || !!r.anulacao);
	}

	let soAjustados = $state(false);
	const diasAjustados = $derived(dias.filter((d) => ajustadoNoDia(d.summary)));
	const diasVisiveis = $derived(soAjustados ? diasAjustados : dias);

	async function carregar() {
		if (!colaboradorId || !mes) return;
		carregando = true;
		erro = '';
		try {
			const [ano, mm] = mes.split('-').map(Number);
			const ultimoDia = new Date(ano, mm, 0).getDate();
			const inicio = `${mes}-01`;
			const fim = `${mes}-${String(ultimoDia).padStart(2, '0')}`;
			espelho = await relatorioService.espelho({ colaboradorId, inicio, fim });
		} catch {
			erro = 'Falha ao carregar espelho.';
			espelho = null;
		} finally {
			carregando = false;
		}
	}

	$effect(() => {
		if (colaboradorId && mes) {
			// Outro colaborador/mês: o filtro de ajustes não vale mais.
			soAjustados = false;
			carregar();
		}
	});

	type Celulas = (s: EspelhoDia | null) => Celula<RegistroRecord>[];
	/** Estado efetivo (com ajustes do admin): válidas em ordem, desconsideradas junto. */
	const celulasDoDia: Celulas = (s) => (s ? celulasComAjustes(s.registros) : []);
	/** Marcações originais do colaborador (createdBy == null), mesmo que depois ajustadas/anuladas. */
	const originaisDoDia: Celulas = (s) => (s ? celulasOriginais(s.registros) : []);

	function formatHora(iso: string): string {
		return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
	}

	function formatDataCurta(date: string): string {
		const [, mm, dd] = date.split('-');
		return `${dd}/${mm}`;
	}

	function formatTotalHoras(horas: number): string {
		const totalMin = Math.round(horas * 60);
		const hh = Math.floor(totalMin / 60);
		const mm = totalMin % 60;
		return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
	}

	function abrirModalManual(date: string, posicao: number) {
		// Pré-preenche com horário sugerido pela posição
		const horarioPadrao = ['08:00', '12:00', '13:00', '17:00'];
		dataInicialModal = `${date}T${horarioPadrao[posicao] ?? '18:00'}`;
		tipoInicialModal = tipoDaPosicao(posicao);
		modalManualAberto = true;
	}

	/** Anulação avulsa (sem substituta) — a única revertível. */
	function anulacaoAvulsa(registro: RegistroRecord): boolean {
		return !!registro.anulacao && registro.anulacao.registroSubstitutoId == null;
	}

	/** Roteia o clique numa batida: reverter anulação avulsa ou abrir ajuste. */
	function onClickBatida(registro: RegistroRecord) {
		if (!editavel) return;
		if (registro.anulacao) {
			if (!anulacaoAvulsa(registro)) return; // anulada por ajuste: sem ação
			registroSelecionado = registro;
			modalReverterAberto = true;
			return;
		}
		registroSelecionado = registro;
		modalAjusteAberto = true;
	}

	async function confirmarManual(dados: { type: RegistroType; timestamp: string; reason: string }) {
		await registroAdminService.criarManual({ colaboradorId, ...dados });
		modalManualAberto = false;
		// Incluir ou desconsiderar muda os dias em aberto do badge do menu.
		await Promise.all([carregar(), recarregarResumo()]);
	}

	async function confirmarAjuste(dados: { type: RegistroType; timestamp: string; reason: string }) {
		if (!registroSelecionado) return;
		await registroAdminService.ajustar(registroSelecionado.id, dados);
		modalAjusteAberto = false;
		registroSelecionado = null;
		// Incluir ou desconsiderar muda os dias em aberto do badge do menu.
		await Promise.all([carregar(), recarregarResumo()]);
	}

	async function confirmarAnular(motivo: string) {
		if (!registroSelecionado) return;
		await registroAdminService.anular(registroSelecionado.id, motivo);
		modalAjusteAberto = false;
		registroSelecionado = null;
		// Incluir ou desconsiderar muda os dias em aberto do badge do menu.
		await Promise.all([carregar(), recarregarResumo()]);
	}

	async function confirmarReverter() {
		if (!registroSelecionado) return;
		await registroAdminService.reverterAnulacao(registroSelecionado.id);
		modalReverterAberto = false;
		registroSelecionado = null;
		// Incluir ou desconsiderar muda os dias em aberto do badge do menu.
		await Promise.all([carregar(), recarregarResumo()]);
	}
</script>

{#if carregando}
	<p class="status">Carregando espelho…</p>
{:else if erro}
	<div class="erro">{erro}</div>
{:else if espelho}
	<!-- `tratamento = false`: lado do colaborador, a batida como ele a fez, sem sinal do admin. -->
	{#snippet batida(registro: RegistroRecord, interativo: boolean, tratamento: boolean)}
		{@const revertivel = interativo && anulacaoAvulsa(registro)}
		{@const titulo = !tratamento
			? 'Marcação do colaborador'
			: registro.anulacao
				? revertivel
					? `Anulada: ${registro.anulacao.motivo} — clique para reverter`
					: `Ajustada/anulada: ${registro.anulacao.motivo}`
				: (registro.createdReason ?? (interativo ? 'Clique para ajustar' : 'Ponto válido'))}
		{#if interativo}
			<button
				type="button"
				class="batida"
				class:batida--manual={!!registro.createdBy}
				class:batida--anulada={!!registro.anulacao}
				class:batida--revertivel={revertivel}
				title={titulo}
				onclick={() => onClickBatida(registro)}
				disabled={!!registro.anulacao && !revertivel}
			>
				{formatHora(registro.timestamp)}
			</button>
		{:else}
			<span
				class="batida batida--leitura"
				class:batida--manual={tratamento && !!registro.createdBy}
				class:batida--anulada={tratamento && !!registro.anulacao}
				title={titulo}
			>
				{formatHora(registro.timestamp)}
			</span>
		{/if}
		{#if registro.localizacao === 'fora' || registro.localizacao === 'sem_localizacao'}
			{@const textoLocal = descreverLocalizacao(registro) ?? ''}
			{#if registro.latitude != null && registro.longitude != null}
				<!-- eslint-disable svelte/no-navigation-without-resolve -- link externo (OpenStreetMap) -->
				<a
					class="local-alerta"
					href={linkMapa(registro.latitude, registro.longitude)}
					target="_blank"
					rel="noopener noreferrer"
					title="{textoLocal} — ver no mapa"
					aria-label="{textoLocal} — ver no mapa"><Icon name="map-pin" size={11} /></a
				>
				<!-- eslint-enable svelte/no-navigation-without-resolve -->
			{:else}
				<span class="local-alerta" title={textoLocal} aria-label={textoLocal}
					><Icon name="map-pin" size={11} /></span
				>
			{/if}
		{/if}
	{/snippet}

	{#snippet tabela(
		titulo: string,
		celulas: Celulas,
		totalDoDia: (s: EspelhoDia | null) => number,
		interativo: boolean,
		tratamento: boolean
	)}
		{@const colunas = totalDeColunas(
			Math.max(0, ...diasVisiveis.map((d) => celulas(d.summary).length))
		)}
		<div class="tabela">
			<h3 class="tabela-titulo">{titulo}</h3>

			<div class="grid-wrap">
				<table class="grid">
					<thead>
						<tr>
							<th class="col-data">Data</th>
							{#each { length: colunas }, i (i)}<th class="col-batida">{rotuloColuna(i)}</th>{/each}
							<th class="col-total">Total</th>
						</tr>
					</thead>
					<tbody>
						{#each diasVisiveis as dia (dia.date)}
							{@const ajustado = tratamento && ajustadoNoDia(dia.summary)}
							{@const doDia = celulas(dia.summary)}
							<tr class:fim-semana={dia.isFimSemana || (dia.feriado && !dia.feriado.escalado)}>
								<td class="dia">
									<!-- Sempre presente para manter as datas alinhadas; só pinta no dia ajustado. -->
									<span
										class="dia-ajustado"
										class:is-ajustado={ajustado}
										title={ajustado ? 'Dia com ajuste do admin' : undefined}
										aria-label={ajustado ? 'Dia com ajuste do admin' : undefined}
										aria-hidden={!ajustado}
									></span>
									<span class="dia-num">{formatDataCurta(dia.date)}</span>
									<span class="dia-sem">{DIA_SEMANA[dia.diaSemana]}</span>
									{#if dia.feriado}
										<span class="dia-feriado" title={dia.feriado.nome}
											>{ROTULO_TIPO[dia.feriado.tipo]}{dia.feriado.escalado
												? ' · escalado'
												: ''}</span
										>
									{/if}
								</td>
								{#each { length: colunas }, i (i)}
									{@const celula = colunasDoDia(doDia, colunas)[i]}
									<td class="cel">
										{#if celula}
											{#each celula.anuladas as anul (anul.id)}
												{@render batida(anul, interativo, tratamento)}
											{/each}
											{#if celula.valida}{@render batida(
													celula.valida,
													interativo,
													tratamento
												)}{/if}
										{:else if interativo}
											<button
												type="button"
												class="vazia"
												title="Adicionar registro manual"
												onclick={() => abrirModalManual(dia.date, i)}>+</button
											>
										{:else}
											<span class="sem-batida">—</span>
										{/if}
									</td>
								{/each}
								<td class="total">{formatTotalHoras(totalDoDia(dia.summary))}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>
	{/snippet}

	<div class="barra">
		<div class="filtro" role="group" aria-label="Dias exibidos">
			<button
				type="button"
				class="chip"
				class:chip--ativo={!soAjustados}
				aria-pressed={!soAjustados}
				onclick={() => (soAjustados = false)}
			>
				Todos os dias <span class="chip__n">{dias.length}</span>
			</button>
			<button
				type="button"
				class="chip"
				class:chip--ativo={soAjustados}
				aria-pressed={soAjustados}
				disabled={diasAjustados.length === 0}
				onclick={() => (soAjustados = true)}
			>
				{#if diasAjustados.length === 0}
					Nenhum ajuste neste mês
				{:else}
					Só dias com ajustes <span class="chip__n">{diasAjustados.length}</span>
				{/if}
			</button>
		</div>
	</div>

	{#if editavel}
		{@render tabela('Marcações', celulasDoDia, (s) => s?.totalHours ?? 0, true, true)}
	{:else}
		<div class="comparacao">
			{@render tabela(
				'Marcações do colaborador',
				originaisDoDia,
				(s) => s?.original.totalHours ?? 0,
				false,
				false
			)}
			{@render tabela(
				'Com ajustes do administrador',
				celulasDoDia,
				(s) => s?.totalHours ?? 0,
				false,
				true
			)}
		</div>
	{/if}
{/if}

{#if editavel}
	<RegistroManualModal
		aberto={modalManualAberto}
		{colaboradorNome}
		dataInicial={dataInicialModal}
		tipoInicial={tipoInicialModal}
		onFechar={() => (modalManualAberto = false)}
		onConfirmar={confirmarManual}
	/>

	<RegistroAjusteModal
		aberto={modalAjusteAberto}
		registro={registroSelecionado}
		onFechar={() => {
			modalAjusteAberto = false;
			registroSelecionado = null;
		}}
		onAjustar={confirmarAjuste}
		onAnular={confirmarAnular}
	/>

	<ReverterAnulacaoModal
		aberto={modalReverterAberto}
		registro={registroSelecionado}
		onFechar={() => {
			modalReverterAberto = false;
			registroSelecionado = null;
		}}
		onReverter={confirmarReverter}
	/>
{/if}

<style>
	.status,
	.erro {
		padding: 1rem;
		border-radius: 0.5rem;
		text-align: center;
	}
	.erro {
		background: var(--color-danger-bg);
		color: var(--color-danger-strong);
	}
	.status {
		color: var(--color-text-muted);
	}

	.comparacao {
		display: flex;
		gap: 1.5rem;
		align-items: flex-start;
	}
	.tabela {
		flex: 1 1 0;
		min-width: 0;
	}
	.tabela-titulo {
		margin: 0 0 0.5rem;
		font-size: 0.95rem;
		font-weight: 700;
		color: var(--color-text-secondary);
	}
	@media (max-width: 900px) {
		.comparacao {
			flex-direction: column;
		}
	}

	.barra {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem 1.5rem;
		margin-bottom: 1rem;
	}

	.filtro {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
	}

	.chip {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.375rem 0.75rem;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-pill);
		background: var(--color-surface);
		color: var(--color-text-muted);
		font: inherit;
		font-size: 0.8125rem;
		font-weight: 600;
		cursor: pointer;
	}
	.chip:disabled {
		cursor: default;
		opacity: 0.6;
	}
	.chip--ativo {
		background: var(--color-text);
		border-color: var(--color-text);
		color: var(--color-surface);
	}
	.chip__n {
		font-variant-numeric: tabular-nums;
		opacity: 0.7;
	}

	.dia-ajustado {
		display: inline-block;
		width: 7px;
		height: 7px;
		margin-right: 0.25rem;
		border-radius: 50%;
		vertical-align: middle;
	}
	.dia-ajustado.is-ajustado {
		background: var(--color-warning-dot);
	}

	.grid-wrap {
		overflow-x: auto;
		border: 1px solid var(--color-border);
		border-radius: 0.5rem;
	}
	.grid {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.875rem;
		background: var(--color-surface);
		table-layout: fixed;
	}
	.col-data {
		width: 90px;
	}
	.col-batida {
		width: auto;
	}
	.col-total {
		width: 80px;
	}
	.grid th {
		background: var(--color-surface-muted);
		text-align: center;
		padding: 0.625rem 0.75rem;
		font-size: 0.75rem;
		text-transform: uppercase;
		color: var(--color-text-muted);
		border-bottom: 1px solid var(--color-border);
		position: sticky;
		top: 0;
	}
	.grid td {
		padding: 0.375rem 0.5rem;
		border-bottom: 1px solid var(--color-hover);
		vertical-align: middle;
	}
	.grid tr.fim-semana td {
		background: var(--color-surface-muted);
	}
	.grid tr.fim-semana td.dia .dia-sem {
		color: var(--color-danger-dot);
	}

	.dia {
		white-space: nowrap;
	}
	.dia-num {
		font-weight: 600;
		color: var(--color-text);
		margin-right: 0.375rem;
	}
	.dia-sem {
		font-size: 0.75rem;
		color: var(--color-text-subtle);
	}

	.dia-feriado {
		margin-left: 0.35rem;
		font-size: 0.65rem;
		font-weight: 700;
		color: var(--color-danger-dot);
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}

	.cel {
		padding: 0.25rem;
		position: relative;
	}
	/* Desconsiderada empilhada sobre a válida da mesma posição. */
	.cel .batida + .batida {
		margin-top: 0.25rem;
	}
	/* Batida fora do local ou sem localização: entrou, mas pede conferência. */
	.local-alerta {
		position: absolute;
		top: 0;
		right: 0;
		display: inline-flex;
		padding: 2px;
		border-radius: 50%;
		background: var(--color-warning-bg);
		color: var(--color-warning);
		border: 1px solid var(--color-warning);
	}
	.batida {
		width: 100%;
		padding: 0.375rem 0.5rem;
		background: var(--color-success-bg);
		color: var(--color-success-strong);
		border: 1px solid var(--color-success-border);
		border-radius: 0.375rem;
		font-size: 0.825rem;
		font-weight: 500;
		cursor: pointer;
		display: flex;
		align-items: center;
		gap: 0.25rem;
		justify-content: center;
	}
	.batida:hover:not(:disabled) {
		background: var(--color-success-bg);
	}
	.batida--leitura {
		cursor: default;
	}
	.sem-batida {
		display: block;
		text-align: center;
		color: var(--color-border-strong);
		font-size: 0.875rem;
	}
	.batida--manual {
		background: var(--color-warning-soft);
		color: var(--color-warning-strong);
		border-color: var(--color-warning-soft-border);
	}
	.batida--manual:hover:not(:disabled) {
		background: var(--color-warning-soft-border);
	}
	.batida--anulada {
		background: var(--color-hover);
		color: var(--color-text-subtle);
		border-color: var(--color-border);
		text-decoration: line-through;
		cursor: not-allowed;
	}
	.batida--revertivel {
		cursor: pointer;
	}
	.batida--revertivel:hover:not(:disabled) {
		background: var(--color-border);
		color: var(--color-text-muted);
	}
	.vazia {
		width: 100%;
		padding: 0.375rem 0.5rem;
		background: transparent;
		color: var(--color-border-strong);
		border: 1px dashed var(--color-border);
		border-radius: 0.375rem;
		cursor: pointer;
		font-size: 0.875rem;
	}
	.vazia:hover {
		background: var(--color-primary-soft);
		color: var(--color-primary);
		border-color: var(--color-primary-soft-fg);
	}

	.total {
		font-weight: 600;
		color: var(--color-text-secondary);
		text-align: center;
		font-variant-numeric: tabular-nums;
	}
</style>
