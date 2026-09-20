/**
 * @module lib/server/painel/montar
 * @description Painel de um dia: quem está divergindo e o que precisa de ação.
 *
 * PURO — sem Prisma. A carga do banco vive em `carregar.ts`, como no par
 * `espelho/montar.ts` × `espelho/gerar.ts`.
 *
 * O painel responde a pergunta do admin ao abrir a tela: *quem está fora do
 * combinado hoje*. Por isso `ordem` coloca falta, dia em aberto e atraso antes
 * de quem cumpriu — a tela lidera pela divergência e trata o resto como contexto.
 *
 * As regras espelham `espelho/montar.ts`: a falta do painel usa o mesmo
 * predicado da falta do espelho, e "dia em aberto" é a mesma marcação ímpar que
 * `pendencias.ts` conta. Um número que discorde do espelho seria pior que número
 * nenhum — o espelho é o documento legal.
 */
import { apurarDia } from '@/lib/server/apuracao';
import { horarioContratualDoDia, marcacoesPrevistas } from '@/lib/server/jornada';
import type { VersaoVigencia } from '@/lib/server/jornada';
import { diaDe, minutosDoDia, type Dia } from '@/lib/server/periodo';

/**
 * Atraso: a variação máxima por marcação do art. 58, §1º da CLT. Usar o mesmo
 * número de `apuracao.ts` evita o painel chamar de "atrasado" um dia que o
 * espelho apura como cumprido dentro da tolerância.
 */
export const ATRASO_MIN = 5;

/**
 * Quanto tempo depois do horário previsto, sem nenhuma marcação, a ausência
 * deixa de ser "ainda não chegou" e vira "falta provável". Não é regra legal —
 * é o ponto em que vale a pena o admin ligar para a pessoa.
 */
export const MARGEM_FALTA_MIN = 60;

/** Até esta duração o dia é considerado meio período, para o rótulo de turno. */
const MEIO_PERIODO_MAX_MIN = 6 * 60;

/** Folga em torno do horário da empresa ao classificar abertura/fechamento. */
const JANELA_TURNO_MIN = 60;

/**
 * Situação de PRESENÇA no dia. Não se confunde com atraso: quem chegou tarde e
 * continua na loja é `trabalhando` **e** `atrasado`. Fundir os dois num enum só
 * perderia um dos dois fatos.
 */
export type SituacaoDia =
	| 'trabalhando'
	| 'cumpriu'
	| 'ainda_nao_chegou'
	| 'falta_provavel'
	| 'folga'
	| 'ferias'
	| 'ausencia'
	| 'sem_jornada';

/** Rótulo do turno do dia, derivado do horário contratual e do da empresa. */
export type Turno = 'abertura' | 'fechamento' | 'integral' | 'intermediario' | 'meio_periodo';

export interface AusenciaPainel {
	tipo: string;
	rotulo: string;
}

export interface LinhaPainel {
	colaboradorId: string;
	nome: string;
	/** `null` quando não há departamento — o servidor não escreve texto de UI. */
	departamento: string | null;
	turno: Turno | null;

	/** "HH:MM" da 1ª marcação prevista; `null` em folga ou sem jornada. */
	previstaEntrada: string | null;
	/** "HH:MM" da última marcação prevista. */
	previstaSaida: string | null;
	/** Minutos contratuais do dia. 0 = folga; `null` = sem jornada. */
	contratualMin: number | null;

	/** "HH:MM" da 1ª marcação válida do dia. */
	entradaHora: string | null;
	/** "HH:MM" da última marcação válida — alimenta "sem marcação desde". */
	ultimaHora: string | null;
	marcacoes: number;
	/** Nº ímpar de marcações: o último par não fechou. */
	sessaoAberta: boolean;
	/** Par fechado, mas ainda faltam marcações previstas — quase sempre o almoço. */
	emIntervalo: boolean;
	realizadoMin: number;

	/** Registrado − previsto, em minutos (negativo = adiantado). `null` sem previsto. */
	diferencaMin: number | null;
	atrasado: boolean;
	/** Dia encerrado com marcação ímpar — mesmo critério de `pendencias.ts`. */
	diaEmAberto: boolean;
	ausencia: AusenciaPainel | null;
	situacao: SituacaoDia;
	/** Entra no bloco "Precisa de atenção". */
	divergencia: boolean;
	/** Ordem de exibição resolvida no servidor (menor = mais urgente). */
	ordem: number;
}

/** Entrada de um colaborador para a montagem — só o que a regra precisa. */
export interface ColaboradorPainel {
	id: string;
	nome: string;
	departamento: string | null;
	versoes: VersaoVigencia[];
	/** Instantes das marcações válidas do dia, em ordem. */
	marcacoes: Date[];
	/** Ausência aprovada que cobre o dia, se houver. */
	ausencia: { tipo: string } | null;
}

export interface HorarioEmpresa {
	abertura: string | null;
	fechamento: string | null;
}

const ROTULO_AUSENCIA: Record<string, string> = {
	ferias: 'Férias',
	atestado: 'Atestado',
	folga: 'Folga compensatória'
};

/** Prioridade de exibição. A tela corta "Precisa de atenção" em `ordem <= 2`. */
const ORDEM: Record<SituacaoDia, number> = {
	falta_provavel: 0,
	trabalhando: 3,
	ainda_nao_chegou: 4,
	cumpriu: 5,
	ausencia: 6,
	ferias: 7,
	folga: 8,
	sem_jornada: 9
};

function minutosDoHorario(hhmm: string): number {
	return Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
}

function horaDe(instante: Date): string {
	const m = minutosDoDia(instante);
	return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/**
 * Rótulo do turno pelo horário contratual DO DIA (não da jornada): quem faz
 * sábado em meio período muda de rótulo no sábado, que é o correto.
 *
 * Deriva do horário de funcionamento cadastrado da empresa, com folga de uma
 * hora em cada ponta. É heurística, e por isso a linha carrega também
 * `previstaEntrada`/`previstaSaida` — se o rótulo não servir a uma empresa, a
 * tela cai no horário literal sem precisar mexer no servidor.
 */
export function turnoDoDia(
	pares: [string, string][] | null,
	minutos: number,
	empresa: HorarioEmpresa
): Turno | null {
	if (!pares || pares.length === 0) return null;
	if (minutos <= MEIO_PERIODO_MAX_MIN) return 'meio_periodo';

	const entrada = minutosDoHorario(pares[0][0]);
	let saida = minutosDoHorario(pares[pares.length - 1][1]);
	if (saida < entrada) saida += 1440; // par que vira a meia-noite

	const abertura = empresa.abertura ? minutosDoHorario(empresa.abertura) : null;
	const fechamento = empresa.fechamento ? minutosDoHorario(empresa.fechamento) : null;
	if (abertura === null || fechamento === null) return 'integral';

	const abreCedo = entrada <= abertura + JANELA_TURNO_MIN;
	const fechaTarde = saida >= fechamento - JANELA_TURNO_MIN;

	if (abreCedo && fechaTarde) return 'integral';
	if (abreCedo) return 'abertura';
	if (fechaTarde) return 'fechamento';
	return 'intermediario';
}

/** Monta a linha de um colaborador no dia. `agora` define o "hoje" da decisão. */
export function montarLinha(
	c: ColaboradorPainel,
	dia: Dia,
	agora: Date,
	empresa: HorarioEmpresa
): LinhaPainel {
	const hoje = diaDe(agora);
	const ehHoje = dia === hoje;
	const ehFuturo = dia > hoje;

	const horario = horarioContratualDoDia(c.versoes, dia);
	const semJornada = c.versoes.length === 0;
	const previstas = horario ? marcacoesPrevistas(dia, horario.pares) : null;
	// 0 = sem expediente (folga/DSR); null = sem jornada cadastrada.
	const contratualMin = semJornada ? null : (horario?.minutos ?? 0);

	const validas = [...c.marcacoes].sort((a, b) => a.getTime() - b.getTime());
	const n = validas.length;
	const sessaoAberta = n % 2 === 1;
	const emIntervalo = !sessaoAberta && n > 0 && previstas !== null && n < previstas.length;

	const ausencia: AusenciaPainel | null = c.ausencia
		? { tipo: c.ausencia.tipo, rotulo: ROTULO_AUSENCIA[c.ausencia.tipo] ?? 'Ausência justificada' }
		: null;

	const apuracao = apurarDia(validas, contratualMin, ausencia !== null, previstas ?? undefined);

	// ── Diferença entre o registrado e o previsto ─────────────────────────────
	const previstoMin = previstas ? minutosDoDia(previstas[0]) : null;
	let diferencaMin: number | null = null;
	if (previstoMin !== null && n > 0) {
		diferencaMin = minutosDoDia(validas[0]) - previstoMin;
	} else if (previstoMin !== null && ehHoje) {
		// Ainda sem bater: a diferença é o tempo já decorrido desde a hora prevista.
		const decorrido = minutosDoDia(agora) - previstoMin;
		if (decorrido > 0) diferencaMin = decorrido;
	}

	// ── Situação ──────────────────────────────────────────────────────────────
	let situacao: SituacaoDia;
	if (semJornada) {
		situacao = 'sem_jornada';
	} else if (n > 0) {
		// A presença manda sobre folga e ausência: se bateu, está lá.
		if (ehHoje && (sessaoAberta || emIntervalo)) situacao = 'trabalhando';
		else situacao = 'cumpriu';
	} else if (ausencia?.tipo === 'ferias') {
		situacao = 'ferias';
	} else if (ausencia) {
		situacao = 'ausencia';
	} else if (!horario) {
		situacao = 'folga';
	} else if (ehFuturo) {
		situacao = 'ainda_nao_chegou';
	} else if (!ehHoje) {
		situacao = 'falta_provavel';
	} else {
		const atrasoAtual = diferencaMin ?? 0;
		situacao = atrasoAtual > MARGEM_FALTA_MIN ? 'falta_provavel' : 'ainda_nao_chegou';
	}

	// Dia futuro nunca acusa atraso nem diferença: não houve o que registrar.
	if (ehFuturo) diferencaMin = null;
	const atrasado = !ehFuturo && diferencaMin !== null && diferencaMin > ATRASO_MIN;

	// Marcação ímpar só é "dia em aberto" depois que o dia encerrou; no dia
	// corrente é apenas alguém que ainda não saiu. Mesma fronteira de pendencias.ts.
	const diaEmAberto = sessaoAberta && !ehHoje && !ehFuturo;

	// Bater ponto em dia de folga ou durante ausência aprovada também é divergência.
	const trabalhouSemPrevisao = n > 0 && (contratualMin === 0 || ausencia !== null);
	const divergencia =
		situacao === 'falta_provavel' || diaEmAberto || atrasado || trabalhouSemPrevisao;

	let ordem = ORDEM[situacao];
	if (diaEmAberto) ordem = Math.min(ordem, 1);
	if (atrasado) ordem = Math.min(ordem, 2);

	return {
		colaboradorId: c.id,
		nome: c.nome,
		departamento: c.departamento,
		turno: turnoDoDia(horario?.pares ?? null, horario?.minutos ?? 0, empresa),
		previstaEntrada: horario ? horario.pares[0][0] : null,
		previstaSaida: horario ? horario.pares[horario.pares.length - 1][1] : null,
		contratualMin,
		entradaHora: n > 0 ? horaDe(validas[0]) : null,
		ultimaHora: n > 0 ? horaDe(validas[n - 1]) : null,
		marcacoes: n,
		sessaoAberta,
		emIntervalo,
		realizadoMin: apuracao.realizadoMin,
		diferencaMin,
		atrasado,
		diaEmAberto,
		ausencia,
		situacao,
		divergencia,
		ordem
	};
}

export interface ResumoPainel {
	escalados: number;
	trabalhando: number;
	cumpriram: number;
	atrasados: number;
	faltasProvaveis: number;
	naoChegaram: number;
	ausentes: number;
	ferias: number;
	folgas: number;
	semJornada: number;
	diasEmAberto: number;
	marcacoesDoDia: number;
}

export function resumirLinhas(linhas: LinhaPainel[]): ResumoPainel {
	const conta = (p: (l: LinhaPainel) => boolean) => linhas.filter(p).length;
	return {
		escalados: conta((l) => (l.contratualMin ?? 0) > 0),
		trabalhando: conta((l) => l.situacao === 'trabalhando'),
		cumpriram: conta((l) => l.situacao === 'cumpriu'),
		atrasados: conta((l) => l.atrasado),
		faltasProvaveis: conta((l) => l.situacao === 'falta_provavel'),
		naoChegaram: conta((l) => l.situacao === 'ainda_nao_chegou'),
		ausentes: conta((l) => l.situacao === 'ausencia'),
		ferias: conta((l) => l.situacao === 'ferias'),
		folgas: conta((l) => l.situacao === 'folga'),
		semJornada: conta((l) => l.situacao === 'sem_jornada'),
		diasEmAberto: conta((l) => l.diaEmAberto),
		marcacoesDoDia: linhas.reduce((soma, l) => soma + l.marcacoes, 0)
	};
}

/** Ordena pela urgência já resolvida em `ordem`, depois por nome. */
export function ordenarLinhas(linhas: LinhaPainel[]): LinhaPainel[] {
	return [...linhas].sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, 'pt-BR'));
}
