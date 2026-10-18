/**
 * @module lib/server/perfil/carregar
 * @description Carrega do banco o perfil de um colaborador (regras em `montar.ts`).
 * Uma consulta de espelho cobre o período e a janela recente; cada um é apurado
 * separado por `apurarPeriodo`:
 *
 * - o **período** (até ontem) alimenta os quatro cards;
 * - a **janela** das últimas três semanas até hoje alimenta o dia de referência
 *   (hoje ou o último dia com expediente) e a semana dele.
 */
import { prisma } from '@/lib/server/db';
import { carregarEspelho } from '@/lib/server/espelho/gerar';
import { apurarPeriodo, type ApuracaoPeriodo } from '@/lib/server/espelho/montar';
import { somarDias } from '@/lib/server/feriado/calendario';
import { diaDaDataPura, diaDe, type Dia } from '@/lib/server/periodo';
import {
	chipDoDia,
	detalharDia,
	diaDeReferencia,
	intervaloDoPeriodo,
	leituraDoDia,
	montarCards,
	montarSemana,
	periodosDisponiveis,
	type CardsPerfil,
	type Chip,
	type DiaReferencia,
	type Intervalo,
	type PeriodoPerfil,
	type SemanaPerfil
} from './montar';

/** Quantos dias para trás procurar o último dia com expediente. */
const JANELA_DIAS = 21;

export interface PerfilColaborador {
	colaborador: {
		id: string;
		nome: string;
		cargo: string | null;
		departamento: string | null;
		jornada: string | null;
		admissao: Dia | null;
		/** Dia do desligamento (soft delete), se houver. */
		desligamento: Dia | null;
	};
	semJornada: boolean;
	/** Hoje ou o último dia com expediente; `null` se não houve nenhum na janela. */
	dia: (DiaReferencia & { chip: Chip; leitura: string }) | null;
	semana: SemanaPerfil | null;
	periodo: PeriodoPerfil;
	intervalo: Intervalo;
	/** Períodos que cabem no tempo de casa. */
	periodosDisponiveis: PeriodoPerfil[];
	cards: CardsPerfil;
}

/** `null` se o colaborador não existe ou é de outra empresa. */
export async function carregarPerfil(
	empresaId: string,
	colaboradorId: string,
	periodo: PeriodoPerfil,
	agora: Date = new Date()
): Promise<PerfilColaborador | null> {
	const hoje = diaDe(agora);
	const intervalo = intervaloDoPeriodo(periodo, agora);
	const janela: Intervalo = { inicio: somarDias(hoje, -JANELA_DIAS), fim: hoje };
	const inicioCarga = intervalo.inicio < janela.inicio ? intervalo.inicio : janela.inicio;

	const [carga, cabecalho] = await Promise.all([
		carregarEspelho(empresaId, colaboradorId, inicioCarga, hoje, agora),
		prisma.colaborador.findFirst({
			where: { id: colaboradorId, empresaId },
			select: {
				cargo: true,
				dataAdmissao: true,
				deletedAt: true,
				usuario: { select: { nome: true } },
				departamento: { select: { nome: true } },
				jornada: { select: { nome: true } }
			}
		})
	]);
	if (!carga || !cabecalho) return null;

	const { entrada } = carga;
	const apurar = (i: Intervalo) =>
		apurarPeriodo({
			...entrada,
			inicio: i.inicio,
			fim: i.fim,
			admissao: entrada.trabalhador.admissao,
			desligamento: entrada.trabalhador.desligamento
		});
	const detalhar = (ap: ApuracaoPeriodo) => ap.dias.map((d) => detalharDia(d, ap.horarios, hoje));

	const apPeriodo = apurar(intervalo);
	const cards = montarCards(detalhar(apPeriodo));
	const recentes = detalhar(apurar(janela));
	const ref = diaDeReferencia(recentes, hoje);
	const admissao = cabecalho.dataAdmissao ? diaDaDataPura(cabecalho.dataAdmissao) : null;

	return {
		colaborador: {
			id: colaboradorId,
			nome: cabecalho.usuario.nome,
			cargo: cabecalho.cargo,
			departamento: cabecalho.departamento?.nome ?? null,
			jornada: cabecalho.jornada?.nome ?? null,
			admissao,
			desligamento: cabecalho.deletedAt ? diaDe(cabecalho.deletedAt) : null
		},
		semJornada: apPeriodo.semJornada,
		dia: ref
			? { ...ref, chip: chipDoDia(ref.dia, agora), leitura: leituraDoDia(ref.dia, cards) }
			: null,
		semana: ref ? montarSemana(recentes, ref.dia.dia) : null,
		periodo,
		intervalo,
		periodosDisponiveis: periodosDisponiveis(admissao, agora),
		cards
	};
}
