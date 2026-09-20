import { describe, expect, it } from 'vitest';
import {
	ATRASO_MIN,
	MARGEM_FALTA_MIN,
	montarLinha,
	ordenarLinhas,
	resumirLinhas,
	turnoDoDia,
	type ColaboradorPainel,
	type LinhaPainel
} from './montar';

const brt = (s: string) => new Date(`${s}:00-03:00`);

const EMPRESA = { abertura: '08:00', fechamento: '19:00' };

/** Jornada seg–sex 08:00–12:00 / 13:00–17:00; sábado e domingo de folga. */
const util = {
	ativo: true,
	entrada: '08:00',
	saida_almoco: '12:00',
	retorno_almoco: '13:00',
	saida: '17:00'
};
const folga = { ativo: false, entrada: '', saida_almoco: '', retorno_almoco: '', saida: '' };
const VERSOES = [
	{
		vigenciaInicio: new Date('2020-01-01T00:00:00Z'),
		dias: {
			segunda: util,
			terca: util,
			quarta: util,
			quinta: util,
			sexta: util,
			sabado: folga,
			domingo: folga
		}
	}
];

// 2026-03-03 é uma terça; 2026-03-07 é sábado.
const TERCA = '2026-03-03';
const SABADO = '2026-03-07';

function colaborador(extra: Partial<ColaboradorPainel> = {}): ColaboradorPainel {
	return {
		id: 'c1',
		nome: 'Fulano de Tal',
		departamento: 'Loja',
		versoes: VERSOES,
		marcacoes: [],
		ausencia: null,
		...extra
	};
}

function linha(extra: Partial<ColaboradorPainel>, dia: string, agora: string): LinhaPainel {
	return montarLinha(colaborador(extra), dia, brt(agora), EMPRESA);
}

describe('montarLinha — dia encerrado', () => {
	it('quatro marcações no horário: cumpriu, sem divergência', () => {
		const l = linha(
			{ marcacoes: ['08:00', '12:00', '13:00', '17:00'].map((h) => brt(`${TERCA}T${h}`)) },
			TERCA,
			'2026-03-04T09:00'
		);
		expect(l.situacao).toBe('cumpriu');
		expect(l.diferencaMin).toBe(0);
		expect(l.atrasado).toBe(false);
		expect(l.diaEmAberto).toBe(false);
		expect(l.divergencia).toBe(false);
	});

	it('marcação ímpar em dia encerrado é dia em aberto, não "trabalhando"', () => {
		const l = linha(
			{ marcacoes: ['08:00', '12:00', '13:00'].map((h) => brt(`${TERCA}T${h}`)) },
			TERCA,
			'2026-03-04T09:00'
		);
		expect(l.situacao).toBe('cumpriu');
		expect(l.sessaoAberta).toBe(true);
		expect(l.diaEmAberto).toBe(true);
		expect(l.divergencia).toBe(true);
	});

	it('sem marcação em dia útil encerrado é falta provável', () => {
		const l = linha({}, TERCA, '2026-03-04T09:00');
		expect(l.situacao).toBe('falta_provavel');
		expect(l.divergencia).toBe(true);
	});

	it('a fronteira da tolerância é exatamente ATRASO_MIN', () => {
		const dentro = linha(
			{ marcacoes: [brt(`${TERCA}T08:0${ATRASO_MIN}`)] },
			TERCA,
			'2026-03-04T09:00'
		);
		expect(dentro.diferencaMin).toBe(ATRASO_MIN);
		expect(dentro.atrasado).toBe(false);

		const fora = linha(
			{ marcacoes: [brt(`${TERCA}T08:0${ATRASO_MIN + 1}`)] },
			TERCA,
			'2026-03-04T09:00'
		);
		expect(fora.diferencaMin).toBe(ATRASO_MIN + 1);
		expect(fora.atrasado).toBe(true);
	});

	it('chegar adiantado dá diferença negativa e não é atraso', () => {
		const l = linha({ marcacoes: [brt(`${TERCA}T07:52`)] }, TERCA, '2026-03-04T09:00');
		expect(l.diferencaMin).toBe(-8);
		expect(l.atrasado).toBe(false);
	});
});

describe('montarLinha — dia corrente', () => {
	it('marcação ímpar hoje é alguém trabalhando, não dia em aberto', () => {
		const l = linha({ marcacoes: [brt(`${TERCA}T08:00`)] }, TERCA, `${TERCA}T10:00`);
		expect(l.situacao).toBe('trabalhando');
		expect(l.sessaoAberta).toBe(true);
		expect(l.diaEmAberto).toBe(false);
	});

	it('par fechado com marcações previstas faltando é intervalo, e ainda é trabalhando', () => {
		const l = linha(
			{ marcacoes: ['08:00', '12:00'].map((h) => brt(`${TERCA}T${h}`)) },
			TERCA,
			`${TERCA}T12:30`
		);
		expect(l.situacao).toBe('trabalhando');
		expect(l.emIntervalo).toBe(true);
		expect(l.sessaoAberta).toBe(false);
	});

	it('todas as marcações previstas batidas: já cumpriu, mesmo sendo hoje', () => {
		const l = linha(
			{ marcacoes: ['08:00', '12:00', '13:00', '17:00'].map((h) => brt(`${TERCA}T${h}`)) },
			TERCA,
			`${TERCA}T18:00`
		);
		expect(l.situacao).toBe('cumpriu');
		expect(l.emIntervalo).toBe(false);
	});

	it('antes da hora prevista ninguém está atrasado nem faltando', () => {
		const l = linha({}, TERCA, `${TERCA}T07:00`);
		expect(l.situacao).toBe('ainda_nao_chegou');
		expect(l.atrasado).toBe(false);
		expect(l.diferencaMin).toBeNull();
	});

	it('dentro da margem ainda não chegou, mas já conta como atraso', () => {
		const l = linha({}, TERCA, `${TERCA}T08:20`);
		expect(l.situacao).toBe('ainda_nao_chegou');
		expect(l.atrasado).toBe(true);
		expect(l.diferencaMin).toBe(20);
		expect(l.divergencia).toBe(true);
	});

	it('passada a margem sem registro vira falta provável', () => {
		const l = linha({}, TERCA, `${TERCA}T09:01`);
		expect(l.diferencaMin).toBe(MARGEM_FALTA_MIN + 1);
		expect(l.situacao).toBe('falta_provavel');
	});
});

describe('montarLinha — dia futuro', () => {
	it('não acusa falta nem atraso, e não inventa diferença', () => {
		const l = linha({}, TERCA, '2026-03-02T09:00');
		expect(l.situacao).toBe('ainda_nao_chegou');
		expect(l.diferencaMin).toBeNull();
		expect(l.atrasado).toBe(false);
		expect(l.divergencia).toBe(false);
	});
});

describe('montarLinha — ausência, folga e jornada', () => {
	it('ausência aprovada afasta a falta', () => {
		const l = linha({ ausencia: { tipo: 'atestado' } }, TERCA, '2026-03-04T09:00');
		expect(l.situacao).toBe('ausencia');
		expect(l.ausencia?.rotulo).toBe('Atestado');
		expect(l.divergencia).toBe(false);
	});

	it('férias têm situação própria', () => {
		const l = linha({ ausencia: { tipo: 'ferias' } }, TERCA, '2026-03-04T09:00');
		expect(l.situacao).toBe('ferias');
	});

	// A presença manda sobre a ausência, mas isso é digno de nota para o admin.
	it('bater ponto durante ausência aprovada é divergência', () => {
		const l = linha(
			{
				ausencia: { tipo: 'atestado' },
				marcacoes: ['08:00', '12:00'].map((h) => brt(`${TERCA}T${h}`))
			},
			TERCA,
			'2026-03-04T09:00'
		);
		expect(l.situacao).toBe('cumpriu');
		expect(l.ausencia).not.toBeNull();
		expect(l.divergencia).toBe(true);
	});

	it('dia sem expediente é folga, e bater nele é divergência', () => {
		const semNada = linha({}, SABADO, '2026-03-09T09:00');
		expect(semNada.situacao).toBe('folga');
		expect(semNada.contratualMin).toBe(0);
		expect(semNada.divergencia).toBe(false);

		const trabalhou = linha(
			{ marcacoes: ['09:00', '13:00'].map((h) => brt(`${SABADO}T${h}`)) },
			SABADO,
			'2026-03-09T09:00'
		);
		expect(trabalhou.divergencia).toBe(true);
	});

	it('sem jornada cadastrada não gera falta nem atraso', () => {
		const l = linha({ versoes: [] }, TERCA, '2026-03-04T09:00');
		expect(l.situacao).toBe('sem_jornada');
		expect(l.contratualMin).toBeNull();
		expect(l.atrasado).toBe(false);
		expect(l.previstaEntrada).toBeNull();
	});

	it('colaborador sem departamento devolve null, não um traço', () => {
		const l = linha({ departamento: null }, TERCA, '2026-03-04T09:00');
		expect(l.departamento).toBeNull();
	});
});

describe('turnoDoDia', () => {
	const t = (pares: [string, string][] | null, min: number) => turnoDoDia(pares, min, EMPRESA);

	it('classifica pelas pontas do horário da empresa', () => {
		// Casos reais do seed (empresa 08:00–19:00).
		expect(
			t(
				[
					['08:30', '11:30'],
					['13:00', '17:20']
				],
				440
			)
		).toBe('abertura');
		expect(
			t(
				[
					['10:00', '13:00'],
					['14:40', '19:00']
				],
				440
			)
		).toBe('fechamento');
		expect(t([['08:30', '12:30']], 240)).toBe('meio_periodo');
	});

	it('quem cobre as duas pontas é integral', () => {
		expect(
			t(
				[
					['08:00', '12:00'],
					['13:00', '19:00']
				],
				600
			)
		).toBe('integral');
	});

	it('quem não encosta em nenhuma ponta é intermediário', () => {
		expect(t([['11:00', '17:00']], 360 + 1)).toBe('intermediario');
	});

	it('sem horário no dia não há turno', () => {
		expect(t(null, 0)).toBeNull();
	});
});

describe('resumirLinhas e ordenarLinhas', () => {
	const doDia = (extra: Partial<ColaboradorPainel>, id: string, nome: string) =>
		montarLinha({ ...colaborador(extra), id, nome }, TERCA, brt('2026-03-04T09:00'), EMPRESA);

	it('conta cada situação e soma as marcações', () => {
		const linhas = [
			doDia(
				{ marcacoes: ['08:00', '12:00', '13:00', '17:00'].map((h) => brt(`${TERCA}T${h}`)) },
				'a',
				'Ana'
			),
			doDia({}, 'b', 'Bruno'),
			doDia({ ausencia: { tipo: 'ferias' } }, 'c', 'Carla')
		];
		const r = resumirLinhas(linhas);
		expect(r.cumpriram).toBe(1);
		expect(r.faltasProvaveis).toBe(1);
		expect(r.ferias).toBe(1);
		expect(r.escalados).toBe(3);
		expect(r.marcacoesDoDia).toBe(4);
	});

	// A tela lidera pela divergência: falta e dia em aberto vêm antes de quem cumpriu.
	it('põe a divergência antes de quem cumpriu', () => {
		const linhas = [
			doDia(
				{ marcacoes: ['08:00', '12:00', '13:00', '17:00'].map((h) => brt(`${TERCA}T${h}`)) },
				'a',
				'Ana'
			),
			doDia({}, 'z', 'Zeca'),
			doDia(
				{ marcacoes: ['08:00', '12:00', '13:00'].map((h) => brt(`${TERCA}T${h}`)) },
				'b',
				'Bruno'
			)
		];
		expect(ordenarLinhas(linhas).map((l) => l.nome)).toEqual(['Zeca', 'Bruno', 'Ana']);
	});
});
