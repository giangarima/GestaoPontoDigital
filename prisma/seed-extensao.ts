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
 * O modelo sai **sem reposição**: os dias reais de cada dia da semana formam um
 * "saco" embaralhado, e um dia só volta depois de todos terem sido usados. Com
 * reposição, quem tinha poucos dias reais repetia o mesmo sábado, batida por batida,
 * três semanas seguidas. Com menos de `MIN_MODELOS` dias reais naquele dia da semana
 * (admissão recente), o saco recebe os dias reais dos colegas da mesma jornada.
 *
 * Tudo é **determinístico** (`mulberry32` sobre o hash de `c|dia` para a falta e
 * de `c|dia da semana|rodada` para o embaralhamento) e os dias são percorridos em
 * ordem: rodar o seed de novo reproduz os mesmos dias, e rodar mais tarde só
 * acrescenta os dias novos. No dia corrente entram apenas as marcações até o
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

/**
 * Com menos dias reais que isso num dia da semana, o saco recebe também os dias
 * reais dos colegas da mesma jornada naquele dia da semana: quem foi admitido há
 * pouco repetiria o único sábado que tem (no seed, um dia em aberto) toda semana.
 */
const MIN_MODELOS = 3;

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

/** Embaralhamento de Fisher–Yates com o gerador dado (não altera a entrada). */
function embaralhar<T>(itens: T[], aleatorio: () => number): T[] {
	const out = [...itens];
	for (let i = out.length - 1; i > 0; i--) {
		const j = Math.floor(aleatorio() * (i + 1));
		[out[i], out[j]] = [out[j], out[i]];
	}
	return out;
}

/**
 * Tira os modelos sem reposição: esgotado o saco, embaralha uma nova rodada e evita
 * que ela comece pelo último dia tirado (que ficaria repetido em semanas seguidas).
 */
function sacoDeModelos<T>(itens: T[], semente: string): () => T {
	let rodada = 0;
	let saco: T[] = [];
	let ultimo: T | undefined;
	return () => {
		if (saco.length === 0) {
			saco = embaralhar(itens, mulberry32(hash32(`${semente}|${rodada++}`)));
			if (saco.length > 1 && saco[saco.length - 1] === ultimo) saco.unshift(saco.pop()!);
		}
		ultimo = saco.pop()!;
		return ultimo;
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

	/** Dias reais dos colegas da mesma jornada, no dia da semana `w`. */
	const daMesmaJornada = (jornada: number, c: number, w: number) =>
		dados.dias.filter(
			(d) => d.c !== c && dados.colaboradores[d.c].jornada === jornada && diaDaSemana(d.d) === w
		);

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
		const sacos = new Map<number, () => DiaJson>();
		const tirarModelo = (w: number) => {
			if (!sacos.has(w)) {
				const proprios = porDiaDaSemana.get(w) ?? [];
				const modelos =
					proprios.length >= MIN_MODELOS
						? proprios
						: [...proprios, ...daMesmaJornada(colab.jornada!, c, w)];
				sacos.set(w, sacoDeModelos(modelos.length > 0 ? modelos : todos, `${c}|${w}`));
			}
			return sacos.get(w)!();
		};

		for (const dia of diasEntre(de, hoje)) {
			if (!previsto(dia)) continue;
			const sorteio = mulberry32(hash32(`${c}|${dia}`));
			if (sorteio() < taxaFalta) continue;

			const modelo = tirarModelo(diaDaSemana(dia));
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
