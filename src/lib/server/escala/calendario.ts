/**
 * @module lib/server/escala/calendario
 * @description Escala de folga: em que dias o colaborador trabalha.
 *
 * A jornada (`jornada.ts`) é um padrão semanal fixo. A escala põe por cima dela:
 *  - **Ciclo** (`EscalaCiclo`): sequência de dias de trabalho (`T`) e folga
 *    (`F`) que se repete a partir da vigência — `TTTTTTF` é o 6x1 do comércio, com
 *    a folga correndo pelos dias da semana; `TF` é o 12x36. Versionado por
 *    vigência, como a jornada; sequência `null` volta ao padrão semanal.
 *  - **Ajuste** (`EscalaAjuste`): exceção num dia — trocar a folga de terça para
 *    quinta são dois ajustes (terça trabalha, quinta folga).
 *
 * Prioridade: ajuste > ciclo vigente > padrão semanal da jornada. Com ciclo ou
 * ajuste de trabalho, o `ativo` da jornada é ignorado e ela só empresta o
 * horário daquele dia da semana; sem horário cadastrado, o dia fica sem
 * expediente (e `alertasDaEscala` avisa).
 *
 * `horarioDoDia` é o único ponto que decide se um dia tem expediente: espelho,
 * AEJ, painel e histórico passam por ele.
 *
 * PURO (sem Prisma) — ver `carregar.ts` para a carga do banco.
 */
import {
	horarioContratualDoDia,
	marcacoesPrevistas,
	type HorarioContratual,
	type VersaoVigencia
} from '@/lib/server/jornada';
import { dataPura, diaDaDataPura, type Dia } from '@/lib/server/periodo';

export interface CicloVigencia {
	vigenciaInicio: Date;
	/** `T`/`F` por dia a partir da vigência; `null` = padrão semanal da jornada. */
	sequencia: string | null;
}

export interface EscalaColaborador {
	ciclos: CicloVigencia[];
	/** Dia → trabalha (true) ou folga (false). */
	ajustes: ReadonlyMap<Dia, boolean>;
}

export type OrigemDia = 'ajuste' | 'ciclo' | 'jornada';

/** Presets de ciclo oferecidos na tela. */
export const CICLOS_PADRAO: Record<string, string> = {
	'6x1': 'TTTTTTF',
	'5x2': 'TTTTTFF',
	'4x2': 'TTTTFF',
	'12x36': 'TF'
};

/** Sequência válida: só `T`/`F`, entre 2 e 28 dias, com pelo menos uma folga e um trabalho. */
export function sequenciaValida(s: string): boolean {
	return /^[TF]{2,28}$/.test(s) && s.includes('T') && s.includes('F');
}

const MS_DIA = 86_400_000;

function diasEntre(inicio: Dia, fim: Dia): number {
	return Math.round((dataPura(fim).getTime() - dataPura(inicio).getTime()) / MS_DIA);
}

/** Ciclo vigente no dia: o de maior vigência que já começou. Antes do 1º, nenhum. */
export function cicloVigente(ciclos: CicloVigencia[], dia: Dia): CicloVigencia | null {
	let escolhido: CicloVigencia | null = null;
	for (const c of ciclos) {
		if (diaDaDataPura(c.vigenciaInicio) > dia) continue;
		if (!escolhido || c.vigenciaInicio > escolhido.vigenciaInicio) escolhido = c;
	}
	return escolhido;
}

/**
 * O dia pela escala: trabalha, folga ou "não decide" (`null` — vale o padrão
 * semanal da jornada), com a origem da decisão.
 */
export function decisaoDoDia(
	escala: EscalaColaborador | null,
	dia: Dia
): { trabalha: boolean | null; origem: OrigemDia } {
	const ajuste = escala?.ajustes.get(dia);
	if (ajuste !== undefined) return { trabalha: ajuste, origem: 'ajuste' };

	const ciclo = escala ? cicloVigente(escala.ciclos, dia) : null;
	if (ciclo?.sequencia) {
		const n = ciclo.sequencia.length;
		const i = ((diasEntre(diaDaDataPura(ciclo.vigenciaInicio), dia) % n) + n) % n;
		return { trabalha: ciclo.sequencia[i] === 'T', origem: 'ciclo' };
	}
	return { trabalha: null, origem: 'jornada' };
}

/**
 * Horário contratual do dia considerando a escala. `null` = sem expediente
 * (folga de escala, folga/DSR da jornada) ou colaborador sem jornada.
 */
export function horarioDoDia(
	versoes: VersaoVigencia[],
	escala: EscalaColaborador | null,
	dia: Dia
): HorarioContratual | null {
	if (versoes.length === 0) return null;
	const { trabalha } = decisaoDoDia(escala, dia);
	if (trabalha === false) return null;
	if (trabalha === true) return horarioContratualDoDia(versoes, dia, { ignorarAtivo: true });
	return horarioContratualDoDia(versoes, dia);
}

/**
 * Minutos contratuais por dia para a apuração: 0 em folga/DSR; `null` quando o
 * colaborador não tem jornada (não há contrato para medir extras/déficit).
 */
export function contratualPorDia(
	versoes: VersaoVigencia[] | null | undefined,
	escala: EscalaColaborador | null
): (dia: string) => number | null {
	if (!versoes?.length) return () => null;
	return (dia) => horarioDoDia(versoes, escala, dia)?.minutos ?? 0;
}

/**
 * Marcações previstas por dia para a apuração; `null` quando não há horário
 * (folga, DSR ou colaborador sem jornada).
 */
export function previstasPorDia(
	versoes: VersaoVigencia[] | null | undefined,
	escala: EscalaColaborador | null
): (dia: string) => Date[] | null {
	if (!versoes?.length) return () => null;
	return (dia) => {
		const h = horarioDoDia(versoes, escala, dia);
		return h ? marcacoesPrevistas(dia, h.pares) : null;
	};
}

// ── Alertas ──────────────────────────────────────────────────────────────────

export type TipoAlerta = 'sem_repouso' | 'sem_domingo' | 'sem_horario';

export interface AlertaEscala {
	tipo: TipoAlerta;
	/** Dia em que o problema se configura. */
	dia: Dia;
	mensagem: string;
}

/** Máximo de dias seguidos de trabalho: o repouso semanal vem a cada 7 (art. 67 da CLT). */
export const MAX_DIAS_SEGUIDOS = 6;
/** No comércio, o repouso cai num domingo ao menos uma vez a cada 3 semanas (Lei 10.101/2000, art. 6º). */
export const SEMANAS_SEM_DOMINGO = 3;

export interface DiaDaEscala {
	dia: Dia;
	trabalha: boolean;
	/** Escala manda trabalhar, mas a jornada não tem horário para esse dia da semana. */
	semHorario: boolean;
}

/**
 * Alertas da escala sobre dias consecutivos (puro). Só avisa — quem decide é o
 * admin. `dias` em ordem, sem buracos; convém começar algumas semanas antes do
 * mês exibido para a contagem não recomeçar do zero no dia 1.
 */
export function alertasDaEscala(dias: DiaDaEscala[], desde?: Dia): AlertaEscala[] {
	const alertas: AlertaEscala[] = [];
	let seguidos = 0;
	let domingosTrabalhados = 0;
	for (const d of dias) {
		const visivel = !desde || d.dia >= desde;
		if (d.semHorario && visivel) {
			alertas.push({
				tipo: 'sem_horario',
				dia: d.dia,
				mensagem: 'A escala manda trabalhar, mas a jornada não tem horário para este dia da semana.'
			});
		}

		const trabalha = d.trabalha && !d.semHorario;
		seguidos = trabalha ? seguidos + 1 : 0;
		if (seguidos === MAX_DIAS_SEGUIDOS + 1 && visivel) {
			alertas.push({
				tipo: 'sem_repouso',
				dia: d.dia,
				mensagem: `${seguidos} dias seguidos de trabalho, sem o repouso semanal.`
			});
		}

		if (dataPura(d.dia).getUTCDay() === 0) {
			domingosTrabalhados = trabalha ? domingosTrabalhados + 1 : 0;
			if (domingosTrabalhados === SEMANAS_SEM_DOMINGO && visivel) {
				alertas.push({
					tipo: 'sem_domingo',
					dia: d.dia,
					mensagem: `${SEMANAS_SEM_DOMINGO} domingos seguidos de trabalho; no comércio, a folga deve cair num domingo ao menos a cada 3 semanas.`
				});
			}
		}
	}
	return alertas;
}

/** Dias da escala de um colaborador no período (para a grade e os alertas). */
export function diasDaEscala(
	versoes: VersaoVigencia[],
	escala: EscalaColaborador | null,
	inicio: Dia,
	fim: Dia
): (DiaDaEscala & { origem: OrigemDia; contratualMin: number })[] {
	const dias: (DiaDaEscala & { origem: OrigemDia; contratualMin: number })[] = [];
	for (let d = dataPura(inicio); diaDaDataPura(d) <= fim; d.setUTCDate(d.getUTCDate() + 1)) {
		const dia = diaDaDataPura(d);
		const { trabalha, origem } = decisaoDoDia(escala, dia);
		const horario = horarioDoDia(versoes, escala, dia);
		dias.push({
			dia,
			origem,
			trabalha: trabalha ?? horario !== null,
			semHorario: trabalha === true && horario === null && versoes.length > 0,
			contratualMin: horario?.minutos ?? 0
		});
	}
	return dias;
}
