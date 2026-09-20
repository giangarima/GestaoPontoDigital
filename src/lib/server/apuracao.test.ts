import { describe, expect, it } from 'vitest';
import { apurarDia, minutosNoturnos, toleranciaClt } from './apuracao';

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
			incompleto: false,
			toleranciaMin: 0
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
			incompleto: true,
			toleranciaMin: 0
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

describe('toleranciaClt (art. 58, §1º)', () => {
	const previstas = [
		brt('2026-01-05T08:00'),
		brt('2026-01-05T12:00'),
		brt('2026-01-05T13:00'),
		brt('2026-01-05T17:00')
	];
	/** Marcações batidas com `desvios` minutos de diferença do previsto. */
	const batidas = (...desvios: number[]) =>
		previstas.map((d, i) => new Date(d.getTime() + desvios[i] * 60_000));

	it('dia no horário exato: soma zero', () => {
		expect(toleranciaClt(previstas, previstas)).toBe(0);
	});

	it('variações de até 5 min somando até 10 no dia: tolerado', () => {
		expect(toleranciaClt(batidas(3, 0, 0, 5), previstas)).toBe(8);
		expect(toleranciaClt(batidas(-5, 5, 0, 0), previstas)).toBe(10);
	});

	it('uma variação acima de 5 min derruba a tolerância inteira', () => {
		expect(toleranciaClt(batidas(6, 0, 0, 0), previstas)).toBeNull();
	});

	it('soma acima de 10 min no dia derruba a tolerância (3+3+3+3)', () => {
		expect(toleranciaClt(batidas(3, -3, 3, -3), previstas)).toBeNull();
	});

	it('segundos não contam: a variação é medida em minutos cheios', () => {
		const com59s = [new Date(previstas[0].getTime() + 5 * 60_000 + 59_000), ...previstas.slice(1)];
		expect(toleranciaClt(com59s, previstas)).toBe(5);
	});

	it('quantidade de marcações diferente da prevista: não se aplica', () => {
		expect(toleranciaClt(previstas.slice(0, 2), previstas)).toBeNull();
		expect(toleranciaClt([], previstas)).toBeNull();
	});
});

describe('apurarDia com a tolerância da CLT', () => {
	const previstas = [
		brt('2026-01-05T08:00'),
		brt('2026-01-05T12:00'),
		brt('2026-01-05T13:00'),
		brt('2026-01-05T17:00')
	];
	const batidas = (...desvios: number[]) =>
		previstas.map((d, i) => new Date(d.getTime() + desvios[i] * 60_000));

	it('dentro da tolerância: realizado real, sem extras nem déficit', () => {
		// Entrou 3 min atrasado e saiu 3 min mais cedo: 7h54 de relógio.
		const r = apurarDia(batidas(3, 0, 0, -3), 480, false, previstas);
		expect(r).toMatchObject({ realizadoMin: 474, extraMin: 0, deficitMin: 0, toleranciaMin: 6 });
	});

	it('dentro da tolerância a favor do trabalhador: sem hora extra', () => {
		const r = apurarDia(batidas(-4, 0, 0, 4), 480, false, previstas);
		expect(r).toMatchObject({ realizadoMin: 488, extraMin: 0, toleranciaMin: 8 });
	});

	it('3+3+3+3 = 12 min: passa do limite diário e conta o tempo real', () => {
		// 08:03-11:57 e 13:03-16:57 = 7h48; sem tolerância, 12 min de déficit.
		const r = apurarDia(batidas(3, -3, 3, -3), 480, false, previstas);
		expect(r).toMatchObject({ realizadoMin: 468, deficitMin: 12, toleranciaMin: 0 });
	});

	it('acima de 5 min numa marcação: a totalidade do excesso vira extra (Súmula 366)', () => {
		const r = apurarDia(batidas(0, 0, 0, 20), 480, false, previstas);
		expect(r).toMatchObject({ realizadoMin: 500, extraMin: 20, toleranciaMin: 0 });
	});

	it('sem as previstas (dia sem horário), nada muda', () => {
		expect(apurarDia(batidas(3, 0, 0, -3), 480, false)).toMatchObject({
			deficitMin: 6,
			toleranciaMin: 0
		});
	});

	it('jornada noturna: a tolerância não apaga a redução da hora noturna', () => {
		// 22h–5h: 7h de relógio = 8h apuradas; o contrato prevê 7h (420 min).
		const noturnas = [brt('2026-01-05T22:00'), brt('2026-01-06T05:00')];
		const batidasNoturnas = [
			new Date(noturnas[0].getTime() + 2 * 60_000),
			new Date(noturnas[1].getTime() - 2 * 60_000)
		];
		const r = apurarDia(batidasNoturnas, 420, false, noturnas);
		expect(r).toMatchObject({ toleranciaMin: 4, extraMin: 60, deficitMin: 0 });
	});
});
