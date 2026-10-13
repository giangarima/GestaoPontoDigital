import { describe, expect, it } from 'vitest';
import {
	alertasDaEscala,
	decisaoDoDia,
	diasDaEscala,
	horarioDoDia,
	sequenciaValida,
	type EscalaColaborador
} from './calendario';

const util = (entrada: string, saida: string) => ({
	ativo: true,
	entrada,
	saida_almoco: '12:00',
	retorno_almoco: '13:00',
	saida
});
const folga = { ativo: false, entrada: '', saida_almoco: '', retorno_almoco: '', saida: '' };

/** Seg–sáb 08:00–17:00 (sábado ativo); domingo sem horário. */
const VERSOES = [
	{
		vigenciaInicio: new Date('2020-01-01T00:00:00Z'),
		dias: {
			segunda: util('08:00', '17:00'),
			terca: util('08:00', '17:00'),
			quarta: util('08:00', '17:00'),
			quinta: util('08:00', '17:00'),
			sexta: util('08:00', '17:00'),
			sabado: { ...util('08:00', '17:00'), ativo: false }, // horário cadastrado, mas inativo
			domingo: folga
		}
	}
];

const escala = (
	ciclos: [string, string | null][],
	ajustes: [string, boolean][] = []
): EscalaColaborador => ({
	ciclos: ciclos.map(([dia, sequencia]) => ({
		vigenciaInicio: new Date(`${dia}T00:00:00Z`),
		sequencia
	})),
	ajustes: new Map(ajustes)
});

// 2026-03-02 é segunda-feira.
describe('decisaoDoDia', () => {
	it('sem escala: vale o padrão semanal da jornada', () => {
		expect(decisaoDoDia(null, '2026-03-02')).toEqual({ trabalha: null, origem: 'jornada' });
		expect(horarioDoDia(VERSOES, null, '2026-03-07')).toBeNull(); // sábado inativo
	});

	it('6x1 a partir da segunda: a folga cai no domingo e depois corre a semana', () => {
		const e = escala([['2026-03-02', 'TTTTTTF']]);
		const dias = diasDaEscala(VERSOES, e, '2026-03-02', '2026-03-15').map((d) =>
			d.trabalha ? 'T' : 'F'
		);
		expect(dias.join('')).toBe('TTTTTTFTTTTTTF');
		// No sábado o ciclo manda trabalhar: usa o horário cadastrado, ignorando `ativo`.
		expect(horarioDoDia(VERSOES, e, '2026-03-07')?.minutos).toBe(480);
	});

	it('12x36 alterna trabalho e folga', () => {
		const e = escala([['2026-03-02', 'TF']]);
		expect(decisaoDoDia(e, '2026-03-02').trabalha).toBe(true);
		expect(decisaoDoDia(e, '2026-03-03').trabalha).toBe(false);
		expect(decisaoDoDia(e, '2026-03-04').trabalha).toBe(true);
	});

	it('antes da vigência do 1º ciclo vale a jornada; ciclo null volta para ela', () => {
		const e = escala([
			['2026-03-02', 'TF'],
			['2026-03-10', null]
		]);
		expect(decisaoDoDia(e, '2026-03-01').origem).toBe('jornada');
		expect(decisaoDoDia(e, '2026-03-03').origem).toBe('ciclo');
		expect(decisaoDoDia(e, '2026-03-10').origem).toBe('jornada');
	});

	it('ajuste prevalece sobre o ciclo (troca de folga)', () => {
		const e = escala(
			[['2026-03-02', 'TTTTTFF']],
			[
				['2026-03-03', false],
				['2026-03-07', true]
			]
		);
		expect(decisaoDoDia(e, '2026-03-03')).toEqual({ trabalha: false, origem: 'ajuste' });
		expect(horarioDoDia(VERSOES, e, '2026-03-03')).toBeNull();
		expect(horarioDoDia(VERSOES, e, '2026-03-07')?.minutos).toBe(480);
	});

	it('sem jornada: nenhum horário, com ou sem escala', () => {
		expect(horarioDoDia([], escala([['2026-03-02', 'TF']]), '2026-03-02')).toBeNull();
	});
});

describe('alertasDaEscala', () => {
	it('ciclo que cai num dia sem horário na jornada avisa', () => {
		// 6x1 começando na terça: o domingo 08/03 é dia de trabalho, mas a jornada não tem horário.
		const dias = diasDaEscala(
			VERSOES,
			escala([['2026-03-03', 'TTTTTTF']]),
			'2026-03-03',
			'2026-03-09'
		);
		expect(alertasDaEscala(dias).map((a) => [a.tipo, a.dia])).toEqual([
			['sem_horario', '2026-03-08']
		]);
	});

	it('sete dias seguidos de trabalho: sem repouso semanal', () => {
		const e = escala([['2026-03-02', 'TTTTTTF']], [['2026-03-08', true]]);
		const domingoComHorario = [
			{
				...VERSOES[0],
				dias: { ...VERSOES[0].dias, domingo: util('08:00', '12:00') }
			}
		];
		const alertas = alertasDaEscala(diasDaEscala(domingoComHorario, e, '2026-03-02', '2026-03-09'));
		expect(alertas.map((a) => [a.tipo, a.dia])).toEqual([['sem_repouso', '2026-03-08']]);
	});

	it('três domingos seguidos de trabalho avisam (comércio)', () => {
		const dias = ['2026-03-01', '2026-03-08', '2026-03-15'].map((dia) => ({
			dia,
			trabalha: true,
			semHorario: false
		}));
		expect(alertasDaEscala(dias).map((a) => a.tipo)).toEqual(['sem_domingo']);
	});

	it('`desde` conta os dias anteriores mas só reporta a partir dele', () => {
		const dias = ['2026-03-01', '2026-03-08', '2026-03-15'].map((dia) => ({
			dia,
			trabalha: true,
			semHorario: false
		}));
		expect(alertasDaEscala(dias, '2026-03-16')).toEqual([]);
		expect(alertasDaEscala(dias, '2026-03-15')).toHaveLength(1);
	});
});

describe('sequenciaValida', () => {
	it.each([
		['TTTTTTF', true],
		['TF', true],
		['TTTT', false],
		['T', false],
		['TXF', false]
	])('%s → %s', (s, ok) => expect(sequenciaValida(s)).toBe(ok));
});
