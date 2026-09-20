<!--
  @page /admin/dashboard
  @description Painel do dia: quem está divergindo e o que fazer a respeito.

  A tela lidera pela divergência — falta, dia em aberto e atraso vêm primeiro,
  em `ordem` já resolvida pelo servidor (`lib/server/painel/montar.ts`). Quem
  cumpriu o horário é contexto e entra num grupo recolhido.

  Os cards de resumo e os chips são o MESMO filtro: clicar num card acende o
  chip correspondente e corta a lista.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import {
		adminService,
		type LinhaPainel,
		type PainelDia,
		type SituacaoDia,
		type Turno
	} from '@/services/admin.service';
	import { registroAdminService } from '@/services/registro-admin.service';
	import Avatar from '@/components/ui/Avatar.svelte';
	import Badge from '@/components/ui/Badge.svelte';
	import Card from '@/components/ui/Card.svelte';
	import Icon from '@/components/ui/Icon.svelte';
	import CardResumo from '@/components/dashboard/CardResumo.svelte';
	import LinhaAtencao from '@/components/dashboard/LinhaAtencao.svelte';
	import RegistroManualModal from '@/components/timesheet/RegistroManualModal.svelte';

	// ── Carregamento e navegação de dia ───────────────────────────────────────
	let painel = $state<PainelDia | null>(null);
	let loading = $state(true);
	let errorMsg = $state('');
	/** Hora da última carga bem-sucedida, já formatada — só é usada para exibir. */
	let atualizadoAs = $state<string | null>(null);

	function formatarDia(d: Date): string {
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
	}

	/** Dia de hoje no calendário local, como AAAA-MM-DD. */
	function hojeISO(): string {
		return formatarDia(new Date());
	}

	/**
	 * Desloca um dia AAAA-MM-DD. A conta é feita em UTC: `Date.UTC` normaliza
	 * sozinho a virada de mês e o ano bissexto, e nenhum fuso entra na jogada —
	 * somar 24h em horário local erraria o dia na virada do horário de verão.
	 */
	function deslocarDia(dia: string, dias: number): string {
		const [ano, mes, d] = dia.split('-').map(Number);
		const alvo = new Date(Date.UTC(ano, mes - 1, d + dias));
		return `${alvo.getUTCFullYear()}-${String(alvo.getUTCMonth() + 1).padStart(2, '0')}-${String(alvo.getUTCDate()).padStart(2, '0')}`;
	}

	function porExtenso(dia: string): string {
		return new Date(`${dia}T12:00:00`).toLocaleDateString('pt-BR', {
			weekday: 'long',
			day: '2-digit',
			month: 'long'
		});
	}

	function curta(dia: string): string {
		const [, m, d] = dia.split('-');
		return `${d}/${m}`;
	}

	let dataRef = $state(hojeISO());
	const ehHoje = $derived(dataRef === hojeISO());
	const dataPorExtenso = $derived(porExtenso(dataRef));

	// Uma requisição por vez: trocar de dia ou a atualização automática abortam a
	// anterior. Sem isso uma resposta atrasada chega depois e sobrescreve a tela
	// com o dado do dia errado.
	let emVoo: AbortController | null = null;

	/** `silencioso` recarrega sem piscar o "Carregando…" — é o caso do poll. */
	async function carregar(silencioso = false): Promise<void> {
		emVoo?.abort();
		const controller = new AbortController();
		emVoo = controller;

		if (!silencioso) loading = true;
		errorMsg = '';
		try {
			painel = await adminService.dashboard(dataRef, controller.signal);
			atualizadoAs = new Date().toLocaleTimeString('pt-BR', {
				hour: '2-digit',
				minute: '2-digit'
			});
		} catch (e) {
			// Abortada por uma requisição mais nova: quem mandou abortar cuida da tela.
			if ((e as { name?: string }).name === 'AbortError') return;
			errorMsg = 'Erro ao carregar o painel.';
		} finally {
			if (emVoo === controller) {
				emVoo = null;
				loading = false;
			}
		}
	}

	const INTERVALO_MS = 60_000;
	let timer: ReturnType<typeof setInterval> | null = null;

	/**
	 * Só o dia corrente se atualiza sozinho — dia passado já está encerrado e não
	 * muda. Aba oculta não busca nada; ao voltar, atualiza na hora.
	 */
	function agendarAtualizacao() {
		if (timer) clearInterval(timer);
		timer = null;
		if (!ehHoje) return;
		timer = setInterval(() => {
			if (document.visibilityState === 'visible') carregar(true);
		}, INTERVALO_MS);
	}

	function irPara(dia: string) {
		if (dia === dataRef) return;
		dataRef = dia;
		filtro = 'todos';
		busca = '';
		carregar();
		agendarAtualizacao();
	}

	onMount(() => {
		carregar();
		agendarAtualizacao();

		const aoReaparecer = () => {
			if (document.visibilityState === 'visible' && ehHoje) carregar(true);
		};
		document.addEventListener('visibilitychange', aoReaparecer);

		return () => {
			document.removeEventListener('visibilitychange', aoReaparecer);
			if (timer) clearInterval(timer);
			emVoo?.abort();
		};
	});

	// ── Rótulos ───────────────────────────────────────────────────────────────
	const ROTULO_SITUACAO: Record<SituacaoDia, string> = {
		trabalhando: 'Trabalhando',
		cumpriu: 'Cumpriu',
		ainda_nao_chegou: 'Ainda não chegou',
		falta_provavel: 'Falta provável',
		folga: 'Folga',
		ferias: 'Férias',
		ausencia: 'Ausência',
		sem_jornada: 'Sem jornada'
	};

	const ROTULO_TURNO: Record<Turno, string> = {
		abertura: 'abertura',
		fechamento: 'fechamento',
		integral: 'integral',
		intermediario: 'intermediário',
		meio_periodo: 'meio período'
	};

	/**
	 * O rótulo da linha prefere o problema à presença: quem esqueceu uma batida
	 * aparece como "Dia em aberto", ainda que tenha cumprido o expediente.
	 */
	function rotuloDe(l: LinhaPainel): string {
		if (l.diaEmAberto) return 'Dia em aberto';
		if (l.atrasado && l.situacao !== 'falta_provavel') return 'Atrasado';
		return ROTULO_SITUACAO[l.situacao];
	}

	function varianteDe(l: LinhaPainel): 'success' | 'warning' | 'danger' | 'info' | 'neutral' {
		if (l.situacao === 'falta_provavel') return 'danger';
		if (l.diaEmAberto || l.atrasado) return 'warning';
		if (l.situacao === 'trabalhando') return 'success';
		if (l.situacao === 'cumpriu') return 'success';
		if (l.situacao === 'sem_jornada') return 'info';
		return 'neutral';
	}

	function duracao(min: number): string {
		const h = Math.floor(Math.abs(min) / 60);
		const m = Math.abs(min) % 60;
		return h > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${m} min`;
	}

	/** A coluna Diferença conta o que houve, não só o número. */
	function diferencaDe(l: LinhaPainel): string {
		if (l.diferencaMin === null) return '—';
		if (l.entradaHora === null) return `${duracao(l.diferencaMin)} sem registro`;
		if (l.diferencaMin === 0) return 'no horário';
		return `${l.diferencaMin > 0 ? '+' : '−'}${duracao(l.diferencaMin)}`;
	}

	function iniciais(nome: string): string {
		return nome
			.split(' ')
			.filter(Boolean)
			.slice(0, 2)
			.map((p) => p[0])
			.join('')
			.toUpperCase();
	}

	const CORES_AVATAR = ['#2563eb', '#7c3aed', '#0891b2', '#16a34a', '#d97706'];
	function corAvatar(nome: string): string {
		const soma = [...nome].reduce((t, c) => t + c.charCodeAt(0), 0);
		return CORES_AVATAR[soma % CORES_AVATAR.length];
	}

	// ── Filtro e busca ────────────────────────────────────────────────────────
	type Filtro = 'todos' | 'atrasados' | 'faltas' | 'nao_chegaram' | 'trabalhando' | 'afastados';

	let filtro = $state<Filtro>('todos');
	let busca = $state('');

	const PERTENCE: Record<Filtro, (l: LinhaPainel) => boolean> = {
		todos: () => true,
		atrasados: (l) => l.atrasado,
		faltas: (l) => l.situacao === 'falta_provavel',
		nao_chegaram: (l) => l.situacao === 'ainda_nao_chegou',
		trabalhando: (l) => l.situacao === 'trabalhando',
		afastados: (l) => l.situacao === 'folga' || l.situacao === 'ferias' || l.situacao === 'ausencia'
	};

	const linhas = $derived(painel?.linhas ?? []);

	const visiveis = $derived.by(() => {
		const termo = busca.trim().toLowerCase();
		return linhas.filter(
			(l) =>
				PERTENCE[filtro](l) &&
				(!termo ||
					l.nome.toLowerCase().includes(termo) ||
					(l.departamento?.toLowerCase().includes(termo) ?? false))
		);
	});

	const chips = $derived([
		{ id: 'todos' as Filtro, rotulo: 'Todos', n: linhas.length },
		{ id: 'atrasados' as Filtro, rotulo: 'Atrasados', n: painel?.resumo.atrasados ?? 0 },
		{ id: 'faltas' as Filtro, rotulo: 'Faltas prováveis', n: painel?.resumo.faltasProvaveis ?? 0 },
		{
			id: 'nao_chegaram' as Filtro,
			rotulo: 'Ainda não chegaram',
			n: painel?.resumo.naoChegaram ?? 0
		},
		{ id: 'trabalhando' as Filtro, rotulo: 'Trabalhando', n: painel?.resumo.trabalhando ?? 0 },
		{
			id: 'afastados' as Filtro,
			rotulo: 'Folga e férias',
			n:
				(painel?.resumo.folgas ?? 0) + (painel?.resumo.ferias ?? 0) + (painel?.resumo.ausentes ?? 0)
		}
	]);

	function alternarFiltro(f: Filtro) {
		filtro = filtro === f ? 'todos' : f;
	}

	// ── Agrupamento da lista ──────────────────────────────────────────────────
	interface Grupo {
		id: string;
		titulo: string;
		linhas: LinhaPainel[];
		/** Grupos de contexto entram recolhidos: o foco é a divergência. */
		recolhivel: boolean;
	}

	/**
	 * Cada linha cai em exatamente um grupo, pelo problema mais grave que carrega
	 * — quem está atrasado E com o dia em aberto aparece em "Dias em aberto", que
	 * é o que exige tratamento.
	 */
	function grupoDe(l: LinhaPainel): string {
		if (l.situacao === 'falta_provavel') return 'faltas';
		if (l.diaEmAberto) return 'abertos';
		if (l.atrasado) return 'atrasados';
		if (l.situacao === 'trabalhando') return 'trabalhando';
		if (l.situacao === 'ainda_nao_chegou') return 'nao_chegaram';
		if (l.situacao === 'sem_jornada') return 'sem_jornada';
		if (l.situacao === 'cumpriu') return 'cumpriram';
		return 'afastados';
	}

	/** Ordem dos grupos e quais começam recolhidos (os de contexto). */
	const ORDEM_GRUPOS: Omit<Grupo, 'linhas'>[] = [
		{ id: 'faltas', titulo: 'Faltas prováveis', recolhivel: false },
		{ id: 'abertos', titulo: 'Dias em aberto', recolhivel: false },
		{ id: 'atrasados', titulo: 'Atrasados', recolhivel: false },
		{ id: 'trabalhando', titulo: 'Trabalhando', recolhivel: false },
		{ id: 'nao_chegaram', titulo: 'Ainda não chegaram', recolhivel: false },
		{ id: 'cumpriram', titulo: 'Cumpriram', recolhivel: true },
		{ id: 'afastados', titulo: 'Folga e férias', recolhivel: true },
		{ id: 'sem_jornada', titulo: 'Sem jornada', recolhivel: true }
	];

	const grupos = $derived.by((): Grupo[] => {
		const baldes: Record<string, LinhaPainel[]> = {};
		for (const l of visiveis) {
			(baldes[grupoDe(l)] ??= []).push(l);
		}
		return ORDEM_GRUPOS.filter((g) => baldes[g.id]?.length).map((g) => ({
			...g,
			linhas: baldes[g.id]
		}));
	});

	/** Grupos de contexto começam fechados; os de divergência, abertos. */
	let fechados = $state<Record<string, boolean>>({
		cumpriram: true,
		afastados: true,
		sem_jornada: true
	});
	function alternarGrupo(id: string) {
		fechados = { ...fechados, [id]: !fechados[id] };
	}

	// ── Lançar marcação ───────────────────────────────────────────────────────
	let modalAberto = $state(false);
	let alvo = $state<LinhaPainel | null>(null);

	function abrirLancamento(l: LinhaPainel) {
		alvo = l;
		modalAberto = true;
	}

	const dataInicialModal = $derived(`${dataRef}T${alvo?.previstaEntrada ?? '08:00'}`);

	async function confirmarLancamento(dados: {
		type: string;
		timestamp: string;
		reason: string;
	}): Promise<void> {
		if (!alvo) return;
		await registroAdminService.criarManual({
			colaboradorId: alvo.colaboradorId,
			type: dados.type as 'entrada',
			timestamp: dados.timestamp,
			reason: dados.reason
		});
		modalAberto = false;
		alvo = null;
		await carregar(true);
	}

	// ── Bloco "Precisa de atenção" ────────────────────────────────────────────
	const semRegistro = $derived(linhas.filter((l) => l.situacao === 'falta_provavel').slice(0, 3));
	const atrasadosSemBater = $derived(
		linhas.filter((l) => l.atrasado && l.entradaHora === null && l.situacao !== 'falta_provavel')
	);

	const totalAtencao = $derived(
		semRegistro.length +
			atrasadosSemBater.length +
			(painel && painel.atencao.justificativasPendentes > 0 ? 1 : 0) +
			(painel && painel.atencao.diasEmAberto > 0 ? 1 : 0)
	);

	function detalheSemRegistro(l: LinhaPainel): string {
		const partes = [`Previsto ${l.previstaEntrada}`];
		if (l.diferencaMin !== null) partes.push(`sem registro há ${duracao(l.diferencaMin)}`);
		partes.push(l.ausencia ? l.ausencia.rotulo : 'sem justificativa');
		return partes.join(' · ');
	}

	/** Query que posiciona o /admin/ajustes no colaborador e mês da linha. */
	function queryAjustes(l: LinhaPainel): string {
		return `?colaboradorId=${l.colaboradorId}&mes=${dataRef.slice(0, 7)}`;
	}
</script>

<svelte:head>
	<title>Dashboard — Ponto Digital</title>
</svelte:head>

<section class="admin-page">
	<h1>Dashboard</h1>

	<div class="barra-dia">
		<div class="barra-dia__nav">
			<button
				type="button"
				class="barra-dia__seta"
				onclick={() => irPara(deslocarDia(dataRef, -1))}
				aria-label="Dia anterior">‹</button
			>
			<button
				type="button"
				class="barra-dia__hoje"
				class:barra-dia__hoje--ativo={ehHoje}
				onclick={() => irPara(hojeISO())}
				disabled={ehHoje}>Hoje</button
			>
			<button
				type="button"
				class="barra-dia__seta"
				onclick={() => irPara(deslocarDia(dataRef, 1))}
				aria-label="Próximo dia">›</button
			>
		</div>

		<p class="barra-dia__rotulo">{dataPorExtenso}</p>

		{#if atualizadoAs}
			<p class="barra-dia__status" aria-live="polite">
				<span class="barra-dia__ponto" class:barra-dia__ponto--vivo={ehHoje}></span>
				Atualizado às {atualizadoAs}{ehHoje ? ' · atualiza sozinho' : ''}
			</p>
		{/if}
	</div>

	{#if errorMsg}
		<div class="error" role="alert">{errorMsg}</div>
	{/if}

	{#if loading && !painel}
		<Card><p class="muted">Carregando…</p></Card>
	{:else if painel}
		{#if painel.semEscala}
			<!-- Dia sem expediente para ninguém: os cards e a lista não dizem nada. -->
			<Card>
				<div class="vazio">
					<span class="vazio__icone" aria-hidden="true"><Icon name="vacations" size={30} /></span>
					<div class="vazio__texto">
						<h2>
							{ehHoje ? 'Hoje ninguém tem jornada prevista' : 'Ninguém tem jornada neste dia'}
						</h2>
						<p class="muted">
							{painel.resumo.colaboradoresAtivos} colaborador{painel.resumo.colaboradoresAtivos ===
							1
								? ''
								: 'es'} sem expediente previsto, então não há entradas para acompanhar.
						</p>
					</div>
					<div class="vazio__acoes">
						{#if painel.navegacao?.anterior}
							<button
								type="button"
								class="vazio__btn vazio__btn--primario"
								onclick={() => irPara(painel!.navegacao!.anterior!)}
							>
								Ver {porExtenso(painel.navegacao.anterior)}, {curta(painel.navegacao.anterior)}
							</button>
						{/if}
						{#if painel.navegacao?.proximo}
							<button
								type="button"
								class="vazio__btn"
								onclick={() => irPara(painel!.navegacao!.proximo!)}
							>
								Ver {porExtenso(painel.navegacao.proximo)}, {curta(painel.navegacao.proximo)}
							</button>
						{/if}
					</div>
				</div>
			</Card>
		{:else}
			<div class="cards">
				<CardResumo
					rotulo="Faltas prováveis"
					valor={painel.resumo.faltasProvaveis}
					tone={painel.resumo.faltasProvaveis > 0 ? 'danger' : 'neutral'}
					descricao={semRegistro.map((l) => l.nome.split(' ')[0]).join(', ') ||
						'Ninguém sem registro'}
					ativo={filtro === 'faltas'}
					onclick={() => alternarFiltro('faltas')}
				/>
				<CardResumo
					rotulo="Atrasados"
					valor={painel.resumo.atrasados}
					tone={painel.resumo.atrasados > 0 ? 'warning' : 'neutral'}
					descricao={linhas
						.filter((l) => l.atrasado)
						.slice(0, 2)
						.map((l) => `${l.nome.split(' ')[0]} (${diferencaDe(l)})`)
						.join(', ') || 'Ninguém atrasado'}
					ativo={filtro === 'atrasados'}
					onclick={() => alternarFiltro('atrasados')}
				/>
				<CardResumo
					rotulo="Folga e férias"
					valor={painel.resumo.folgas + painel.resumo.ferias + painel.resumo.ausentes}
					tone="neutral"
					descricao={`${painel.resumo.ferias} em férias · ${painel.resumo.folgas} de folga`}
					ativo={filtro === 'afastados'}
					onclick={() => alternarFiltro('afastados')}
				/>
				<CardResumo
					rotulo={ehHoje ? 'Trabalhando agora' : 'Compareceram'}
					valor={ehHoje ? painel.resumo.trabalhando : painel.resumo.cumpriram}
					tone="success"
					progresso={{
						atual: ehHoje ? painel.resumo.trabalhando : painel.resumo.cumpriram,
						total: painel.resumo.escalados
					}}
					descricao={painel.resumo.naoChegaram > 0
						? `${painel.resumo.naoChegaram} ainda não chegou`
						: ''}
					ativo={filtro === 'trabalhando'}
					onclick={() => alternarFiltro('trabalhando')}
				/>
			</div>
		{/if}

		{#if totalAtencao > 0}
			<Card>
				<header class="painel__cab">
					<h2>Precisa de atenção</h2>
					<Badge variant="danger">{totalAtencao}</Badge>
				</header>

				{#each semRegistro as l (l.colaboradorId)}
					<LinhaAtencao
						icone="alert"
						tone="danger"
						titulo="{l.nome} não registrou entrada"
						detalhe={detalheSemRegistro(l)}
						acaoRotulo="Lançar marcação"
						onclick={() => abrirLancamento(l)}
					/>
				{/each}

				{#each atrasadosSemBater as l (l.colaboradorId)}
					<LinhaAtencao
						icone="clock"
						tone="warning"
						titulo="{l.nome} ainda não registrou entrada"
						detalhe="Previsto {l.previstaEntrada} · atraso de {duracao(l.diferencaMin ?? 0)}"
						acaoRotulo="Lançar marcação"
						onclick={() => abrirLancamento(l)}
					/>
				{/each}

				{#if painel.atencao.justificativasPendentes > 0}
					<LinhaAtencao
						icone="approval"
						tone="info"
						titulo="{painel.atencao.justificativasPendentes} justificativa{painel.atencao
							.justificativasPendentes > 1
							? 's'
							: ''} aguardando aprovação"
						detalhe="Enviadas pelos colaboradores"
						acaoRotulo="Revisar"
						href={resolve('/admin/justificativas', {})}
					/>
				{/if}

				{#if painel.atencao.diasEmAberto > 0}
					<LinhaAtencao
						icone="report"
						tone="warning"
						titulo="{painel.atencao.diasEmAberto} dia{painel.atencao.diasEmAberto > 1
							? 's'
							: ''} em aberto neste mês"
						detalhe="Batida esquecida: número ímpar de marcações no dia"
						acaoRotulo="Tratar dias"
						href={resolve('/admin/pendencias', {})}
					/>
				{/if}
			</Card>
		{/if}

		{#if !painel.semEscala || linhas.length > 0}
			<Card>
				<header class="painel__cab painel__cab--lista">
					<h2>Entradas do dia</h2>
					<input
						type="search"
						class="busca"
						placeholder="Buscar colaborador"
						bind:value={busca}
						aria-label="Buscar colaborador"
					/>
				</header>

				<div class="chips" role="group" aria-label="Filtrar por situação">
					{#each chips as c (c.id)}
						<button
							type="button"
							class="chip"
							class:chip--ativo={filtro === c.id}
							onclick={() => alternarFiltro(c.id)}
							aria-pressed={filtro === c.id}
						>
							{c.rotulo}
							<span class="chip__n">{c.n}</span>
						</button>
					{/each}
				</div>

				{#if visiveis.length === 0}
					<p class="muted">Nenhum colaborador neste recorte.</p>
				{:else}
					<div class="tabela" role="table">
						<div class="linha linha--cab" role="row">
							<span role="columnheader">Colaborador</span>
							<span role="columnheader">Previsto</span>
							<span role="columnheader">Registrado</span>
							<span role="columnheader">Diferença</span>
							<span role="columnheader">Situação</span>
							<span role="columnheader"><span class="sr">Ações</span></span>
						</div>

						{#each grupos as g (g.id)}
							{@const aberto = !fechados[g.id]}
							<div class="grupo" role="row">
								<span role="cell">
									{#if g.recolhivel}
										<button
											type="button"
											class="grupo__toggle"
											onclick={() => alternarGrupo(g.id)}
											aria-expanded={aberto}
										>
											<span class="grupo__chevron" class:grupo__chevron--aberto={aberto}>
												<Icon name="chevron-right" size={14} />
											</span>
											{g.titulo}
											<span class="grupo__n">{g.linhas.length}</span>
										</button>
									{:else}
										<span class="grupo__titulo">
											{g.titulo}
											<span class="grupo__n">{g.linhas.length}</span>
										</span>
									{/if}
								</span>
							</div>

							{#if aberto}
								{#each g.linhas as l (l.colaboradorId)}
									<div class="linha" role="row">
										<span class="pessoa" role="cell">
											<Avatar initials={iniciais(l.nome)} size={34} color={corAvatar(l.nome)} />
											<span class="pessoa__meta">
												<span class="pessoa__nome">{l.nome}</span>
												<span class="pessoa__sub">
													{l.departamento ?? 'Sem departamento'}{l.turno
														? ` · ${ROTULO_TURNO[l.turno]}`
														: ''}
												</span>
											</span>
										</span>
										<span class="num" role="cell">{l.previstaEntrada ?? '—'}</span>
										<span class="num" role="cell">{l.entradaHora ?? '—'}</span>
										<span class="num dif" class:dif--ruim={l.atrasado} role="cell">
											{diferencaDe(l)}
										</span>
										<span role="cell">
											<Badge variant={varianteDe(l)} dot>{rotuloDe(l)}</Badge>
										</span>
										<span class="acao" role="cell">
											{#if l.entradaHora === null && l.previstaEntrada !== null && !painel.ehFuturo}
												<button type="button" class="acao__link" onclick={() => abrirLancamento(l)}>
													Lançar marcação
												</button>
											{:else if l.marcacoes > 0}
												<a
													class="acao__link"
													href="{resolve('/admin/ajustes', {})}{queryAjustes(l)}"
												>
													Ver espelho
												</a>
											{/if}
										</span>
									</div>
								{/each}
							{/if}
						{/each}
					</div>
				{/if}
			</Card>
		{/if}
	{/if}
</section>

<RegistroManualModal
	aberto={modalAberto}
	colaboradorNome={alvo?.nome ?? ''}
	dataInicial={dataInicialModal}
	tipoInicial="entrada"
	onFechar={() => {
		modalAberto = false;
		alvo = null;
	}}
	onConfirmar={confirmarLancamento}
/>

<style>
	.muted {
		color: var(--color-text-muted);
		margin: 0;
	}

	.error {
		background: var(--color-danger-bg);
		color: var(--color-danger);
		padding: 0.75rem 1rem;
		border-radius: var(--radius-sm);
	}

	.sr {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}

	/* ── Barra de dia ──────────────────────────────────────────────────────── */
	.barra-dia {
		display: flex;
		align-items: center;
		gap: 1rem;
		flex-wrap: wrap;
		margin-top: -0.75rem;
	}

	.barra-dia__nav {
		display: flex;
		align-items: center;
		gap: 0.25rem;
	}

	.barra-dia__seta,
	.barra-dia__hoje {
		height: 2.25rem;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		background: var(--color-surface);
		color: var(--color-text);
		font: inherit;
		font-weight: 600;
		font-size: 0.875rem;
		cursor: pointer;
		transition:
			background 0.12s ease,
			border-color 0.12s ease;
	}

	.barra-dia__seta {
		width: 2.25rem;
		font-size: 1.25rem;
		line-height: 1;
		color: var(--color-text-muted);
	}

	.barra-dia__hoje {
		padding: 0 0.875rem;
	}

	.barra-dia__seta:hover,
	.barra-dia__hoje:hover:not(:disabled) {
		border-color: var(--color-primary);
	}

	/* No dia corrente o botão vira indicador de estado, não ação. */
	.barra-dia__hoje--ativo {
		background: var(--color-primary-soft);
		border-color: var(--color-primary-soft);
		color: var(--color-primary-soft-fg);
		cursor: default;
	}

	.barra-dia__rotulo {
		margin: 0;
		font-size: 1.0625rem;
		font-weight: 700;
		color: var(--color-text);
		text-transform: capitalize;
	}

	.barra-dia__status {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		margin: 0 0 0 auto;
		padding: 0.5rem 0.875rem;
		border-radius: var(--radius-sm);
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		font-size: 0.8125rem;
		color: var(--color-text-muted);
	}

	.barra-dia__ponto {
		width: 6px;
		height: 6px;
		border-radius: var(--radius-pill);
		background: var(--color-neutral-dot);
	}

	.barra-dia__ponto--vivo {
		background: var(--color-success-dot);
	}

	/* ── Cards ─────────────────────────────────────────────────────────────── */
	.cards {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 0.75rem;
	}

	/* ── Cabeçalhos de painel ──────────────────────────────────────────────── */
	.painel__cab {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 0.5rem;
	}

	.painel__cab h2 {
		margin: 0;
		font-size: 1.0625rem;
		font-weight: 700;
	}

	.painel__cab--lista {
		justify-content: space-between;
		flex-wrap: wrap;
	}

	.busca {
		min-width: 14rem;
		padding: 0.5rem 0.75rem;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font: inherit;
		font-size: 0.875rem;
	}

	/* ── Chips ─────────────────────────────────────────────────────────────── */
	.chips {
		display: flex;
		gap: 0.375rem;
		flex-wrap: wrap;
		margin-bottom: 0.75rem;
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

	.chip--ativo {
		background: var(--color-text);
		border-color: var(--color-text);
		color: #fff;
	}

	.chip__n {
		font-variant-numeric: tabular-nums;
		opacity: 0.7;
	}

	/* ── Tabela ────────────────────────────────────────────────────────────── */
	.tabela {
		display: flex;
		flex-direction: column;
	}

	.linha {
		display: grid;
		grid-template-columns: minmax(12rem, 2fr) 6rem 6rem 9rem 9rem auto;
		align-items: center;
		gap: 0.75rem;
		padding: 0.625rem 0;
		border-bottom: 1px solid var(--color-border-soft);
	}

	.linha--cab {
		padding: 0.5rem 0;
		font-size: 0.7rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--color-text-subtle);
		border-bottom: 1px solid var(--color-border);
	}

	.grupo {
		padding: 0.75rem 0 0.375rem;
	}

	.grupo__titulo,
	.grupo__toggle {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		border: none;
		background: none;
		padding: 0;
		font: inherit;
		font-size: 0.8125rem;
		font-weight: 700;
		color: var(--color-text-muted);
	}

	.grupo__toggle {
		cursor: pointer;
	}

	.grupo__chevron {
		display: inline-flex;
		transition: transform 0.15s ease;
	}

	.grupo__chevron--aberto {
		transform: rotate(90deg);
	}

	.grupo__n {
		font-variant-numeric: tabular-nums;
		color: var(--color-text-subtle);
	}

	.pessoa {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		min-width: 0;
	}

	.pessoa__meta {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.pessoa__nome {
		font-size: 0.9375rem;
		font-weight: 600;
		color: var(--color-text);
	}

	.pessoa__sub {
		font-size: 0.75rem;
		color: var(--color-text-subtle);
	}

	.num {
		font-size: 0.875rem;
		font-variant-numeric: tabular-nums;
		color: var(--color-text);
	}

	.dif {
		color: var(--color-text-muted);
	}

	.dif--ruim {
		color: var(--color-danger);
		font-weight: 600;
	}

	.acao {
		text-align: right;
	}

	.acao__link {
		border: none;
		background: none;
		padding: 0;
		font: inherit;
		font-size: 0.8125rem;
		font-weight: 600;
		color: var(--color-primary);
		text-decoration: none;
		cursor: pointer;
		white-space: nowrap;
	}

	.acao__link:hover {
		text-decoration: underline;
	}

	/* ── Estado sem escala ─────────────────────────────────────────────────── */
	.vazio {
		display: flex;
		align-items: center;
		gap: 1.25rem;
		flex-wrap: wrap;
		padding: 0.75rem 0;
	}

	.vazio__icone {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 4rem;
		height: 4rem;
		border-radius: var(--radius-md);
		background: var(--color-primary-soft);
		color: var(--color-primary-soft-fg);
		flex-shrink: 0;
	}

	.vazio__texto {
		flex: 1;
		min-width: 14rem;
	}

	.vazio__texto h2 {
		margin: 0 0 0.25rem;
		font-size: 1.125rem;
		font-weight: 700;
	}

	.vazio__acoes {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.vazio__btn {
		padding: 0.625rem 1rem;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		background: var(--color-surface);
		color: var(--color-text);
		font: inherit;
		font-size: 0.875rem;
		font-weight: 600;
		cursor: pointer;
		text-transform: capitalize;
	}

	.vazio__btn--primario {
		background: var(--color-primary);
		border-color: var(--color-primary);
		color: #fff;
	}

	@media (max-width: 1024px) {
		.cards {
			grid-template-columns: repeat(2, 1fr);
		}

		.linha {
			grid-template-columns: minmax(10rem, 2fr) 5rem 5rem 8rem auto;
		}

		.linha > :nth-child(5) {
			display: none;
		}
	}

	@media (max-width: 640px) {
		.cards {
			grid-template-columns: 1fr;
		}

		.barra-dia__status {
			margin-left: 0;
		}

		.linha--cab {
			display: none;
		}

		.linha {
			grid-template-columns: 1fr auto;
			row-gap: 0.25rem;
		}

		.linha > :nth-child(2),
		.linha > :nth-child(3) {
			display: none;
		}
	}
</style>
