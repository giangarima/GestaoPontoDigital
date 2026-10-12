<!--
  @component EspelhoMensal
  @description Grid mensal de batidas para um colaborador.

  Cada linha = um dia do mês. Colunas = Entrada / Saída Almoço / Retorno / Saída / Total.
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
	const TIPO_LABEL: Record<RegistroType, string> = {
		entrada: 'Entrada 1',
		saida_almoco: 'Saída 1',
		retorno_almoco: 'Entrada 2',
		saida: 'Saída 2'
	};
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
		const out: Array<{
			date: string;
			diaSemana: number;
			diaNum: number;
			summary: EspelhoDia | null;
			isFimSemana: boolean;
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
				isFimSemana: dow === 0 || dow === 6
			});
		}
		return out;
	});

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
		if (colaboradorId && mes) carregar();
	});

	/** Estado efetivo (com ajustes do admin): primeira não-anulada do tipo; se todas anuladas, a última anulada. */
	function batidaDoDia(summary: EspelhoDia | null, tipo: RegistroType): RegistroRecord | null {
		if (!summary) return null;
		const validas = summary.registros.filter((p) => p.type === tipo && !p.anulacao);
		if (validas.length > 0) return validas[0];
		const anuladas = summary.registros.filter((p) => p.type === tipo && p.anulacao);
		return anuladas[anuladas.length - 1] ?? null;
	}

	/** Marcação original do colaborador (createdBy == null), mesmo que depois ajustada/anulada. */
	function batidaOriginalDoDia(
		summary: EspelhoDia | null,
		tipo: RegistroType
	): RegistroRecord | null {
		if (!summary) return null;
		const marcadas = summary.registros.filter((p) => p.type === tipo && p.createdBy == null);
		return marcadas[0] ?? null;
	}

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

	function abrirModalManual(date: string, tipo: RegistroType) {
		// Pré-preenche com horário sugerido por tipo
		const horarioPadrao: Record<RegistroType, string> = {
			entrada: '08:00',
			saida_almoco: '12:00',
			retorno_almoco: '13:00',
			saida: '17:00'
		};
		dataInicialModal = `${date}T${horarioPadrao[tipo]}`;
		tipoInicialModal = tipo;
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
		await carregar();
	}

	async function confirmarAjuste(dados: { type: RegistroType; timestamp: string; reason: string }) {
		if (!registroSelecionado) return;
		await registroAdminService.ajustar(registroSelecionado.id, dados);
		modalAjusteAberto = false;
		registroSelecionado = null;
		await carregar();
	}

	async function confirmarAnular(motivo: string) {
		if (!registroSelecionado) return;
		await registroAdminService.anular(registroSelecionado.id, motivo);
		modalAjusteAberto = false;
		registroSelecionado = null;
		await carregar();
	}

	async function confirmarReverter() {
		if (!registroSelecionado) return;
		await registroAdminService.reverterAnulacao(registroSelecionado.id);
		modalReverterAberto = false;
		registroSelecionado = null;
		await carregar();
	}
</script>

{#if carregando}
	<p class="status">Carregando espelho…</p>
{:else if erro}
	<div class="erro">{erro}</div>
{:else if espelho}
	{#snippet tabela(
		titulo: string,
		picker: (s: EspelhoDia | null, tipo: RegistroType) => RegistroRecord | null,
		totalDoDia: (s: EspelhoDia | null) => number,
		totais: { horas: number; extras: number; deficit: number },
		interativo: boolean
	)}
		<div class="tabela">
			<h3 class="tabela-titulo">{titulo}</h3>
			<div class="totais">
				<span><strong>{totais.horas}h</strong> trabalhadas</span>
				<span class="extra"><strong>{totais.extras}h</strong> extras</span>
				<span class="deficit"><strong>{totais.deficit}h</strong> déficit</span>
			</div>

			<div class="grid-wrap">
				<table class="grid">
					<thead>
						<tr>
							<th class="col-data">Data</th>
							{#each TIPOS_ORDEM as t (t)}<th class="col-batida">{TIPO_LABEL[t]}</th>{/each}
							<th class="col-total">Total</th>
						</tr>
					</thead>
					<tbody>
						{#each dias as dia (dia.date)}
							<tr class:fim-semana={dia.isFimSemana}>
								<td class="dia">
									<span class="dia-num">{formatDataCurta(dia.date)}</span>
									<span class="dia-sem">{DIA_SEMANA[dia.diaSemana]}</span>
								</td>
								{#each TIPOS_ORDEM as tipo (tipo)}
									{@const registro = picker(dia.summary, tipo)}
									{#if registro}
										{@const revertivel = interativo && anulacaoAvulsa(registro)}
										{@const titulo = registro.anulacao
											? revertivel
												? `Anulada: ${registro.anulacao.motivo} — clique para reverter`
												: `Ajustada/anulada: ${registro.anulacao.motivo}`
											: (registro.createdReason ??
												(interativo ? 'Clique para ajustar' : 'Ponto válido'))}
										<td class="cel">
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
													class:batida--manual={!!registro.createdBy}
													class:batida--anulada={!!registro.anulacao}
													title={titulo}
												>
													{formatHora(registro.timestamp)}
												</span>
											{/if}
										</td>
									{:else}
										<td class="cel">
											{#if interativo}
												<button
													type="button"
													class="vazia"
													title="Adicionar registro manual"
													onclick={() => abrirModalManual(dia.date, tipo)}>+</button
												>
											{:else}
												<span class="sem-batida">—</span>
											{/if}
										</td>
									{/if}
								{/each}
								<td class="total">{formatTotalHoras(totalDoDia(dia.summary))}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>
	{/snippet}

	<div class="legenda">
		<span class="leg leg--ok">Marcação do colaborador</span>
		<span class="leg leg--manual">Lançamento / ajuste do admin</span>
		<span class="leg leg--anulada">Marcação ajustada (substituída)</span>
	</div>

	{#if editavel}
		{@render tabela('Marcações', batidaDoDia, (s) => s?.totalHours ?? 0, espelho.totais, true)}
	{:else}
		<div class="comparacao">
			{@render tabela(
				'Marcações do colaborador',
				batidaOriginalDoDia,
				(s) => s?.original.totalHours ?? 0,
				espelho.totais.original,
				false
			)}
			{@render tabela(
				'Com ajustes do administrador',
				batidaDoDia,
				(s) => s?.totalHours ?? 0,
				espelho.totais,
				false
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

	.totais {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem 1.5rem;
		padding: 1rem;
		background: var(--color-surface-muted);
		border-radius: 0.5rem;
		margin-bottom: 1rem;
		color: var(--color-text-secondary);
	}
	.totais .extra {
		color: var(--color-success);
	}
	.totais .deficit {
		color: var(--color-danger);
	}

	.legenda {
		display: flex;
		flex-wrap: wrap;
		gap: 1rem;
		font-size: 0.75rem;
		color: var(--color-text-muted);
		margin-bottom: 0.75rem;
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

	.cel {
		padding: 0.25rem;
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

	.leg {
		padding: 0.125rem 0.5rem;
		border-radius: 0.25rem;
		border: 1px solid transparent;
	}
	.leg--ok {
		background: var(--color-success-bg);
		color: var(--color-success-strong);
		border-color: var(--color-success-border);
	}
	.leg--manual {
		background: var(--color-warning-soft);
		color: var(--color-warning-strong);
		border-color: var(--color-warning-soft-border);
	}
	.leg--anulada {
		background: var(--color-hover);
		color: var(--color-text-subtle);
		border-color: var(--color-border);
		text-decoration: line-through;
	}
</style>
