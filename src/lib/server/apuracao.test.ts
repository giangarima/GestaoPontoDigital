import { describe, expect, it } from 'vitest';
import { apurarDia, minutosNoturnos } from './apuracao';

const brt = (s: string) => new Date(`${s}:00-03:00`);

describe('minutosNoturnos (22h–5h de Brasília)', () => {
	it('turno diurno não tem minuto noturno', () => {
		expect(minutosNoturnos(brt('2026-01-05T08:00'), brt('2026-01-05T17:00'))).toBe(0);
	});

	it('conta só o trecho depois das 22h', () => {
		expect(minutosNoturnos(brt('2026-01-05T20:00'), brt('2026-01-05T23:30'))).toBe(90);
	});

	it('atravessa a meia-noite e para às 5h', () => {
		expect(minutosNoturnos(brt('2026-01-05T21:00'), brt('2026-01-06T06:00'))).toBe(7 * 60);
	});

	it('pega o trecho de madrugada (0h–5h) sem a véspera', () => {
		expect(minutosNoturnos(brt('2026-01-06T03:00'), brt('2026-01-06T09:00'))).toBe(120);
	});
});

describe('apurarDia', () => {
	const comercial = [
		brt('2026-01-05T08:00'),
		brt('2026-01-05T12:00'),
		brt('2026-01-05T13:00'),
		brt('2026-01-05T17:30')
	];

	it('forma pares pela ordem e compara com a jornada contratual', () => {
		expect(apurarDia(comercial, 480, false)).toEqual({
			realizadoMin: 510,
			noturnoMin: 0,
			extraMin: 30,
			deficitMin: 0,
			incompleto: false
		});
	});

	it('meio período (4h contratuais) não vira déficit de 8h', () => {
		const r = apurarDia([brt('2026-01-05T08:00'), brt('2026-01-05T12:00')], 240, false);
		expect(r).toMatchObject({ realizadoMin: 240, extraMin: 0, deficitMin: 0 });
	});

	it('hora noturna reduzida: 22h–5h (7h de relógio) valem 8h', () => {
		const r = apurarDia([brt('2026-01-05T22:00'), brt('2026-01-06T05:00')], 480, false);
		expect(r).toMatchObject({ realizadoMin: 480, noturnoMin: 420, extraMin: 0, deficitMin: 0 });
	});

	it('só o trecho noturno é reduzido', () => {
		// 20h–23h30: 120 min diurnos + 90 noturnos × 60/52,5 = 102,86 → 223
		const r = apurarDia([brt('2026-01-05T20:00'), brt('2026-01-05T23:30')], null, false);
		expect(r.realizadoMin).toBe(223);
	});

	it('marcação sem par: conta os pares completos e não aponta extras nem déficit', () => {
		const r = apurarDia(comercial.slice(0, 3), 480, false);
		expect(r).toEqual({
			realizadoMin: 240,
			noturnoMin: 0,
			extraMin: 0,
			deficitMin: 0,
			incompleto: true
		});
	});

	it('dia abonado não tem déficit; folga (0 contratual) é toda extra', () => {
		const meio = [brt('2026-01-05T08:00'), brt('2026-01-05T10:00')];
		expect(apurarDia(meio, 480, true).deficitMin).toBe(0);
		expect(apurarDia(meio, 0, false).extraMin).toBe(120);
	});

	it('sem jornada: nem extras nem déficit', () => {
		expect(apurarDia(comercial, null, false)).toMatchObject({ extraMin: 0, deficitMin: 0 });
	});

	it('ordem de chegada não importa', () => {
		expect(apurarDia([...comercial].reverse(), 480, false).realizadoMin).toBe(510);
	});
});
