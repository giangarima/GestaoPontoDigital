import { describe, expect, it } from 'vitest';
import {
	dataBrasiliaExtenso,
	desvioDoServidor,
	diaEHoraBrasilia,
	horaBrasilia,
	instanteBrasilia
} from './relogio';

describe('desvioDoServidor', () => {
	it('dispositivo 5 s adiantado, 200 ms de ida e volta → −5000', () => {
		// enviou em 10_000 (hora do dispositivo), servidor leu 5_100, chegou em 10_200
		expect(desvioDoServidor(10_000, 10_200, 5_100)).toBe(-5000);
	});

	it('dispositivo atrasado → desvio positivo', () => {
		expect(desvioDoServidor(1_000, 1_100, 61_050)).toBe(60_000);
	});

	it('relógios iguais → zero', () => {
		expect(desvioDoServidor(500, 700, 600)).toBe(0);
	});
});

describe('horário de Brasília independente do fuso do dispositivo', () => {
	const instante = new Date('2026-01-06T01:30:05Z'); // 22:30:05 de 05/01 em Brasília

	it('hora com segundos', () => {
		expect(horaBrasilia(instante)).toBe('22:30:05');
	});

	it('data por extenso do dia de Brasília', () => {
		expect(dataBrasiliaExtenso(instante)).toBe('segunda-feira, 05 de janeiro de 2026');
	});
});

describe('dia e hora de Brasília', () => {
	it('separa e remonta o instante, qualquer que seja o fuso do dispositivo', () => {
		// 01:30 UTC de 02/09 ainda é 01/09 em Brasília.
		expect(diaEHoraBrasilia('2026-09-02T01:30:00.000Z')).toEqual({
			dia: '2026-09-01',
			hora: '22:30'
		});
		expect(instanteBrasilia('2026-09-01', '22:30').toISOString()).toBe('2026-09-02T01:30:00.000Z');
	});
});
