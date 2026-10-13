/**
 * @module lib/server/escala/grade
 * @description Uma linha da grade da escala (`/admin/escala`): a situação de
 * cada dia de um colaborador e os alertas.
 *
 * Precedência: ausência aprovada > folga de feriado > escala (ajuste > ciclo >
 * jornada). Folga compensatória (ausência `folga`) tem situação própria porque é
 * a que consome banco de horas; as demais ausências (férias, atestado) aparecem
 * como `ausencia`. Para os alertas de repouso, ausência e feriado contam como
 * descanso.
 *
 * PURO (sem Prisma).
 */
import type { VersaoVigencia } from '@/lib/server/jornada';
import type { Feriados } from '@/lib/server/feriado/calendario';
import { ausenciaDateKeys } from '@/lib/server/timesheet';
import type { Dia } from '@/lib/server/periodo';
import {
	alertasDaEscala,
	diasDaEscala,
	type AlertaEscala,
	type EscalaColaborador,
	type OrigemDia
} from './calendario';

export type SituacaoEscala =
	| 'trabalho'
	| 'folga'
	| 'feriado'
	| 'folga_banco'
	| 'ausencia'
	| 'sem_jornada';

/** Tipo de ausência que consome banco de horas (folga compensatória). */
const TIPO_FOLGA = 'folga';

export interface AusenciaGrade {
	id: string;
	tipo: string;
	/** Datas puras (meia-noite UTC). */
	dataInicio: Date;
	dataFim: Date;
}

export interface DiaGrade {
	dia: Dia;
	situacao: SituacaoEscala;
	origem: OrigemDia;
	/** Ciclo manda trabalhar, mas a jornada não tem horário nesse dia da semana. */
	semHorario: boolean;
	/** Minutos contratuais pela escala (o que uma folga compensatória consome do banco). */
	contratualMin: number;
	/** Presentes quando há ausência aprovada no dia. */
	ausenciaId: string | null;
	ausenciaTipo: string | null;
}

/**
 * Linha da grade de [desde, fim]. `desde` costuma começar semanas antes do mês
 * exibido para os alertas de dias e domingos seguidos não recomeçarem no dia 1;
 * os alertas só são reportados a partir de `mostrarDesde`.
 */
export function montarLinhaGrade(
	versoes: VersaoVigencia[],
	escala: EscalaColaborador | null,
	feriados: Feriados,
	ausencias: AusenciaGrade[],
	colaboradorId: string,
	desde: Dia,
	fim: Dia,
	mostrarDesde: Dia
): { dias: DiaGrade[]; alertas: AlertaEscala[] } {
	const ausenciaDoDia = new Map<Dia, AusenciaGrade>();
	for (const a of ausencias) {
		for (const dia of ausenciaDateKeys([a])) ausenciaDoDia.set(dia, a);
	}

	const semJornada = versoes.length === 0;
	const dias = diasDaEscala(versoes, escala, desde, fim).map((d): DiaGrade => {
		const ausencia = ausenciaDoDia.get(d.dia) ?? null;
		const feriado = feriados.get(d.dia);
		const folgaDeFeriado = feriado !== undefined && !feriado.escalados.has(colaboradorId);

		let situacao: SituacaoEscala;
		if (semJornada) situacao = 'sem_jornada';
		else if (ausencia) situacao = ausencia.tipo === TIPO_FOLGA ? 'folga_banco' : 'ausencia';
		else if (folgaDeFeriado) situacao = 'feriado';
		else situacao = d.trabalha && !d.semHorario ? 'trabalho' : 'folga';

		return {
			dia: d.dia,
			situacao,
			origem: d.origem,
			semHorario: d.semHorario,
			contratualMin: d.contratualMin,
			ausenciaId: ausencia?.id ?? null,
			ausenciaTipo: ausencia?.tipo ?? null
		};
	});

	const alertas = semJornada
		? []
		: alertasDaEscala(
				dias.map((d) => ({
					dia: d.dia,
					trabalha: d.situacao === 'trabalho',
					// O aviso de "sem horário" só interessa se o dia não está coberto por outra coisa.
					semHorario: d.semHorario && d.situacao === 'folga'
				})),
				mostrarDesde
			);

	return { dias: dias.filter((d) => d.dia >= mostrarDesde), alertas };
}
