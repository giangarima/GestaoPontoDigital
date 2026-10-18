/**
 * @module prisma/seed-extensao
 * @description Estende as marcações importadas (21/03 a 19/09/2026) até o momento
 * em que o seed roda, para o banco de demonstração nunca "parar no tempo": o
 * painel do dia, as pendências do mês e o ciclo aberto do banco de horas precisam
 * de dias recentes.
 *
 * ## Como, sem inventar padrão
 *
 * Nada aqui é sorteado de distribuição sintética. Cada dia novo de um colaborador
 * é a **cópia de um dia real dele mesmo**, do mesmo dia da semana (reamostragem).
 * O dia copiado vem inteiro: horários, rótulos, inclusões do empregador com o
 * motivo original, marcações desconsideradas e a batida esquecida (dia em aberto).
 * Com isso a textura da operação real se mantém: a sexta de quem chega cedo
 * continua cedo, o sábado de meio período continua meio período e a taxa de
 * esquecimento continua a da pessoa.
 *
 * A **falta** também segue a pessoa. A taxa é a fração dos dias previstos (com
 * jornada, sem feriado nacional e sem ausência) em que ela não bateu no período
 * real, e cada dia novo tem essa chance de ficar sem marcação.
 *
 * Fica de fora da extensão:
 * - quem foi desligado (`desligamento`) e quem não tem jornada;
 * - dias sem expediente na jornada, os **feriados nacionais** (`feriadosNacionais`,
 *   ex.: 12/10) e os dias cobertos por ausência já cadastrada (o retorno de
 *   férias em 21/09, por exemplo);
 * - ausências novas: férias e atestados vêm do período real, não se inventam.
 *
 * O sorteio é **determinístico** por colaborador e dia (`mulberry32` sobre o hash
 * de `c|dia`): rodar o seed de novo reproduz os mesmos dias, e rodar mais tarde
 * só acrescenta os dias novos. No dia corrente entram apenas as marcações até o
 * instante do seed, então o painel mostra gente trabalhando e gente que ainda não
 * chegou.
 *
 * PURO (sem Prisma): recebe os dados do JSON e devolve os dias novos no mesmo
 * formato, que `seed-importada.ts` encadeia no NSR junto com os reais.
 */
import { feriadosNacionais, somarDias } from '../src/lib/server/feriado/calendario';
import { diaDe, type Dia } from '../src/lib/server/periodo';
import type { DadosJson, DiaJson } from './seed-importada';

const DIAS_SEMANA = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];

type DiasJornada = Record<string, { ativo?: boolean } | undefined>;

/** Dia da semana (0 = domingo) de uma data de calendário. */
function diaDaSemana(dia: Dia): number {
	return new Date(`${dia}T12:00:00Z`).getUTCDay();
}

/** FNV-1a de 32 bits: semente estável a partir de uma string. */
function hash32(s: string): number {
	let h = 0x811c9dc5;
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	return h >>> 0;
}

/** Gerador pseudoaleatório pequeno e determinístico (mulberry32). */
function mulberry32(semente: number): () => number {
	let a = semente;
	return () => {
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function diasEntre(inicio: Dia, fim: Dia): Dia[] {
	const dias: Dia[] = [];
	for (let d = inicio; d <= fim; d = somarDias(d, 1)) dias.push(d);
	return dias;
}

export interface Extensao {
	dias: DiaJson[];
	/** Primeiro e último dia estendidos (null se não havia o que estender). */
	de: Dia | null;
	ate: Dia | null;
}

/** Dias novos, do dia seguinte ao último real até `agora` (inclusive o dia corrente). */
export function estenderDias(dados: DadosJson, agora: Date): Extensao {
	const ultimoReal = dados.dias.reduce((max, d) => (d.d > max ? d.d : max), '');
	const de = somarDias(ultimoReal, 1);
	const hoje = diaDe(agora);
	if (de > hoje) return { dias: [], de: null, ate: null };

	const primeiroReal = dados.dias.reduce((min, d) => (d.d < min ? d.d : min), ultimoReal);
	const feriados = new Set<Dia>();
	for (let ano = Number(primeiroReal.slice(0, 4)); ano <= Number(hoje.slice(0, 4)); ano++) {
		for (const dia of feriadosNacionais(ano).keys()) feriados.add(dia);
	}

	const novos: DiaJson[] = [];
	dados.colaboradores.forEach((colab, c) => {
		if (colab.desligamento || colab.jornada === null) return;
		const jornada = dados.jornadas[colab.jornada].dias as DiasJornada;
		const ausente = new Set(
			dados.ausencias.filter((a) => a.c === c).flatMap((a) => diasEntre(a.inicio, a.fim))
		);
		const previsto = (dia: Dia) =>
			dia >= colab.admissao &&
			jornada[DIAS_SEMANA[diaDaSemana(dia)]]?.ativo === true &&
			!feriados.has(dia) &&
			!ausente.has(dia);

		// O que a pessoa fez de verdade em cada dia previsto do período real.
		const reais = new Map(dados.dias.filter((d) => d.c === c).map((d) => [d.d, d]));
		const previstosReais = diasEntre(colab.admissao, ultimoReal).filter(previsto);
		const trabalhados = previstosReais.filter((d) => reais.has(d));
		if (trabalhados.length === 0) return;
		const taxaFalta = 1 - trabalhados.length / previstosReais.length;

		const porDiaDaSemana = new Map<number, DiaJson[]>();
		for (const d of trabalhados) {
			const w = diaDaSemana(d);
			porDiaDaSemana.set(w, [...(porDiaDaSemana.get(w) ?? []), reais.get(d)!]);
		}
		const todos = trabalhados.map((d) => reais.get(d)!);

		for (const dia of diasEntre(de, hoje)) {
			if (!previsto(dia)) continue;
			const sorteio = mulberry32(hash32(`${c}|${dia}`));
			if (sorteio() < taxaFalta) continue;

			const candidatos = porDiaDaSemana.get(diaDaSemana(dia)) ?? todos;
			const modelo = candidatos[Math.floor(sorteio() * candidatos.length)];
			let m = modelo.m.map((x) => ({ ...x }));
			// Dia corrente: só o que já aconteceu até o instante do seed.
			if (dia === hoje) {
				m = m.filter((x) => new Date(`${dia}T${x.h}:00.000-03:00`) <= agora);
			}
			if (m.length > 0) novos.push({ c, d: dia, m });
		}
	});

	return { dias: novos, de, ate: hoje };
}
