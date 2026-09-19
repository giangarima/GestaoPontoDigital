/**
 * @module lib/server/aej/montar
 * @description Geração do AEJ (Arquivo Eletrônico de Jornada) conforme o leiaute
 * oficial do Anexo da Portaria MTP nº 671/2021 (gov.br, "leiaute-do-arquivo-
 * eletronico-de-jornada-aej.pdf"). O AEJ é gerado pelo PTRP (programa de
 * tratamento) e substitui os antigos AFDT e ACJEF.
 *
 * Regras do leiaute:
 *  - Texto ISO-8859-1, um registro por linha terminada em CRLF, sem linhas em branco.
 *  - Campos separados por "|" (sem largura fixa e sem CRC — diferente do AFD).
 *  - Datas "AAAA-MM-dd"; data-hora "AAAA-MM-ddThh:mm:00-0300"; hora "hhmm".
 *  - Última linha: literal de assinatura (a assinatura real vai no .p7s).
 *
 * Registros gerados: 01 cabeçalho, 02 REP, 03 vínculos, 04 horários contratuais,
 * 05 marcações (originais "O", incluídas "I" e desconsideradas "D"), 07 ausências
 * (DSR e falta não justificada), 08 PTRP e 99 trailer. O 06 (matrícula eSocial)
 * só existe para empregado com mais de um vínculo — não se aplica.
 *
 * PURO (sem Prisma): recebe os dados já carregados — ver `gerar.ts`.
 *
 * Decisões fora do que o leiaute detalha (documentadas aqui):
 *  - tpMarc/seqEntSaida das marcações válidas saem da ORDEM no dia (E1, S1, E2,
 *    S2…), não do rótulo `tipo` gravado — o par é o que importa para a jornada.
 *  - Marcação desconsiderada ("D") recebe o seqEntSaida do par que ocupava no
 *    dia, contando todas as marcações (válidas e desconsideradas) em ordem.
 *  - DSR = domingo sem expediente na jornada; falta não justificada = dia com
 *    expediente, sem marcação válida e sem ausência aprovada, até ontem.
 *  - Horário noturno sem a redução da hora noturna em durJornada.
 */

import { padAlpha, padNum, toD, toDH, ASSINATURA_LITERAL } from '@/lib/server/afd/format';
import {
	AEJ_VERSAO_LEIAUTE,
	PTRP_DESENV_EMAIL,
	PTRP_DESENV_RAZAO,
	PTRP_NOME,
	PTRP_VERSAO,
	REP_DEV_INSCRICAO,
	REP_DEV_INSCRICAO_TIPO,
	REP_INPI
} from '@/lib/server/afd/config';
import { versaoVigenteEm, type DiaSemanaKey, type VersaoVigencia } from '@/lib/server/jornada';

/** Identificador do único REP (o REP-P deste sistema) no registro "02". */
const ID_REP_AEJ = '1';
/** Tipo do REP no registro "02": "3" = REP-P. */
const TP_REP_P = '3';

const DIAS: DiaSemanaKey[] = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];

// ── Tipos de entrada (dados já carregados) ───────────────────────────────────

export interface MarcacaoAej {
	marcadoEm: Date;
	registradoEm: Date;
	/** "O" original do REP | "I" incluída no tratamento. */
	fonte: string;
	criadoMotivo: string | null;
	/** Presente quando a marcação foi desconsiderada (anulada). */
	anulacao: { motivo: string } | null;
}

export interface VinculoAej {
	cpf: string;
	nome: string;
	admissao: Date | null;
	desligamento: Date | null;
	/** Versões da jornada do colaborador (vazio = sem jornada). */
	versoes: VersaoVigencia[];
	/** Datas (AAAA-MM-dd) cobertas por ausência aprovada (férias, atestado, folga…). */
	diasAbonados: Set<string>;
	marcacoes: MarcacaoAej[];
}

export interface AejEntrada {
	empresa: { cnpj: string | null; caepfCno: string | null; razaoSocial: string };
	inicio: Date;
	fim: Date;
	/** Momento da geração (DH do cabeçalho e limite para apontar faltas). */
	agora: Date;
	vinculos: VinculoAej[];
}

// ── Formatação de campos ─────────────────────────────────────────────────────

/** Campo A de tamanho variável: sem "|"/quebras, ISO-8859-1, truncado em `max`. */
function texto(valor: string | null | undefined, max: number): string {
	const limpo = (valor ?? '')
		.replace(/[|\r\n]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
	return padAlpha(limpo, max).trimEnd();
}

function digitos(valor: string | null | undefined): string {
	return (valor ?? '').replace(/\D/g, '');
}

function registro(...campos: (string | number)[]): string {
	return campos.join('|');
}

/** "08:00" → "0800". */
function hhmm(hora: string): string {
	return hora.replace(':', '');
}

function minutos(hora: string): number {
	const [h, m] = hora.split(':').map(Number);
	return h * 60 + m;
}

/** Dias AAAA-MM-dd de `inicio` a `fim` (inclusive), no calendário de Brasília. */
function diasDoPeriodo(inicio: Date, fim: Date): string[] {
	const dias: string[] = [];
	const d = new Date(`${toD(inicio)}T00:00:00Z`);
	const ultimo = toD(fim);
	while (d.toISOString().slice(0, 10) <= ultimo) {
		dias.push(d.toISOString().slice(0, 10));
		d.setUTCDate(d.getUTCDate() + 1);
	}
	return dias;
}

function diaDaSemana(dia: string): DiaSemanaKey {
	return DIAS[new Date(`${dia}T12:00:00Z`).getUTCDay()];
}

/** Data de calendário gravada à meia-noite UTC (@db.Date / dataAdmissao). */
function diaCalendario(d: Date): string {
	return d.toISOString().slice(0, 10);
}

// ── Horário contratual ───────────────────────────────────────────────────────

interface HorarioDia {
	pares: [string, string][];
	duracao: number;
}

/** Pares entrada/saída do dia na jornada (null = dia sem expediente). */
function horarioDoDia(versoes: VersaoVigencia[], dia: string): HorarioDia | null {
	const dias = versaoVigenteEm(versoes, new Date(`${dia}T00:00:00Z`));
	const cfg = dias?.[diaDaSemana(dia)];
	if (!cfg?.ativo || !cfg.entrada || !cfg.saida) return null;

	const pares: [string, string][] =
		cfg.saida_almoco && cfg.retorno_almoco
			? [
					[cfg.entrada, cfg.saida_almoco],
					[cfg.retorno_almoco, cfg.saida]
				]
			: [[cfg.entrada, cfg.saida]];

	// Par que vira a meia-noite (saída < entrada) conta +24h.
	const duracao = pares.reduce((total, [e, s]) => {
		const diff = minutos(s) - minutos(e);
		return total + (diff < 0 ? diff + 1440 : diff);
	}, 0);
	return { pares, duracao };
}

// ── Montagem ─────────────────────────────────────────────────────────────────

/** Monta as linhas do AEJ (sem CRLF). Função pura: todos os dados vêm na entrada. */
export function montarLinhasAej(e: AejEntrada): string[] {
	const dias = diasDoPeriodo(e.inicio, e.fim);
	const hoje = toD(e.agora);

	// Horários contratuais distintos do período → códigos H1, H2… (registro 04).
	const codigos = new Map<string, { codigo: string; horario: HorarioDia }>();
	const codigoDoDia = (h: HorarioDia | null): string => {
		if (!h) return '';
		const chave = h.pares.map((p) => p.join('-')).join('/');
		let item = codigos.get(chave);
		if (!item) {
			item = { codigo: `H${codigos.size + 1}`, horario: h };
			codigos.set(chave, item);
		}
		return item.codigo;
	};

	const reg03: string[] = [];
	const reg05: string[] = [];
	const reg07: string[] = [];

	e.vinculos.forEach((v, i) => {
		const idVinculo = i + 1;
		reg03.push(registro('03', idVinculo, padNum(v.cpf, 11), texto(v.nome, 150)));

		const admissao = v.admissao ? diaCalendario(v.admissao) : null;
		const desligamento = v.desligamento ? toD(v.desligamento) : null;
		const vigente = (dia: string) =>
			(!admissao || dia >= admissao) && (!desligamento || dia <= desligamento);

		// Marcações agrupadas por dia (Brasília), em ordem cronológica.
		const porDia = new Map<string, MarcacaoAej[]>();
		for (const m of [...v.marcacoes].sort(
			(a, b) =>
				a.marcadoEm.getTime() - b.marcadoEm.getTime() ||
				a.registradoEm.getTime() - b.registradoEm.getTime()
		)) {
			const dia = toD(m.marcadoEm);
			porDia.set(dia, [...(porDia.get(dia) ?? []), m]);
		}

		for (const dia of dias) {
			const horario = vigente(dia) ? horarioDoDia(v.versoes, dia) : null;
			const doDia = porDia.get(dia) ?? [];

			let validas = 0;
			doDia.forEach((m, posicao) => {
				const desconsiderada = m.anulacao !== null;
				const tpMarc = desconsiderada ? 'D' : validas % 2 === 0 ? 'E' : 'S';
				const seq = desconsiderada ? Math.floor(posicao / 2) + 1 : Math.floor(validas / 2) + 1;
				if (!desconsiderada) validas++;

				const motivo = desconsiderada
					? m.anulacao!.motivo
					: m.fonte === 'I'
						? (m.criadoMotivo ?? '')
						: '';

				reg05.push(
					registro(
						'05',
						idVinculo,
						toDH(m.marcadoEm),
						m.fonte === 'O' ? ID_REP_AEJ : '',
						tpMarc,
						seq,
						m.fonte,
						tpMarc === 'E' && seq === 1 ? codigoDoDia(horario) : '',
						texto(motivo, 150)
					)
				);
			});

			if (!vigente(dia) || dia >= hoje) continue;
			if (!horario && diaDaSemana(dia) === 'domingo') {
				reg07.push(registro('07', idVinculo, '1', dia, '', '')); // DSR
			} else if (horario && validas === 0 && !v.diasAbonados.has(dia)) {
				reg07.push(registro('07', idVinculo, '2', dia, '', '')); // falta não justificada
			}
		}
	});

	const inscricao = digitos(e.empresa.cnpj);
	const caepfCno = digitos(e.empresa.caepfCno);

	const reg01 = registro(
		'01',
		inscricao.length === 11 ? '2' : '1',
		inscricao,
		caepfCno.length === 14 ? caepfCno : '',
		caepfCno.length === 12 ? caepfCno : '',
		texto(e.empresa.razaoSocial, 150),
		toD(e.inicio),
		toD(e.fim),
		toDH(e.agora),
		AEJ_VERSAO_LEIAUTE
	);
	const reg02 = registro('02', ID_REP_AEJ, TP_REP_P, padNum(REP_INPI, 17));
	const reg04 = [...codigos.values()].map(({ codigo, horario }) => {
		const [p1, p2] = horario.pares;
		return registro(
			'04',
			codigo,
			horario.duracao,
			hhmm(p1[0]),
			hhmm(p1[1]),
			p2 ? hhmm(p2[0]) : '',
			p2 ? hhmm(p2[1]) : ''
		);
	});
	const reg08 = registro(
		'08',
		texto(PTRP_NOME, 150),
		texto(PTRP_VERSAO, 8),
		REP_DEV_INSCRICAO_TIPO,
		digitos(REP_DEV_INSCRICAO),
		texto(PTRP_DESENV_RAZAO, 150),
		texto(PTRP_DESENV_EMAIL, 50)
	);
	const trailer = registro(
		'99',
		1,
		1,
		reg03.length,
		reg04.length,
		reg05.length,
		0, // 06: sem empregados com mais de um vínculo
		reg07.length,
		1
	);

	return [
		reg01,
		reg02,
		...reg03,
		...reg04,
		...reg05,
		...reg07,
		reg08,
		trailer,
		padAlpha(ASSINATURA_LITERAL, 100)
	];
}
