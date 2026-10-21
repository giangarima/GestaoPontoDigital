import { describe, expect, it } from 'vitest';
import {
	celulasComAjustes,
	colunasDoDia,
	celulasOriginais,
	rotuloColuna,
	totalDeColunas,
	type BatidaColuna
} from './espelho-colunas';

type R = BatidaColuna & { createdBy: string | null };

const r = (id: string, hora: string, extra: Partial<R> = {}): R => ({
	id,
	type: 'entrada',
	timestamp: `2026-10-17T${hora}:00.000Z`,
	anulacao: null,
	createdBy: null,
	...extra
});
const anulada = (id: string, hora: string, substituta: string | null = null): R =>
	r(id, hora, { anulacao: { registroSubstitutoId: substituta } });
const ids = (cs: { valida: R | null; anuladas: R[] }[]) =>
	cs.map((c) => [c.valida?.id ?? null, c.anuladas.map((a) => a.id)]);

describe('celulasComAjustes', () => {
	it('ordena por horário e mostra todas as válidas, mesmo além da 4ª', () => {
		const cs = celulasComAjustes([
			r('e', '21:00'),
			r('a', '11:00'),
			r('b', '15:00'),
			r('c', '16:00'),
			r('d', '20:00')
		]);
		expect(cs.map((c) => c.valida!.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
	});

	it('anulada por ajuste fica na célula da substituta', () => {
		const cs = celulasComAjustes([
			anulada('x', '11:20', 'a'),
			r('a', '11:00', { createdBy: 'admin' }),
			r('b', '15:00')
		]);
		expect(ids(cs)).toEqual([
			['a', ['x']],
			['b', []]
		]);
	});

	it('anulada avulsa vai para a próxima válida; depois da última, célula própria', () => {
		const cs = celulasComAjustes([
			r('a', '11:00'),
			anulada('x', '11:02'),
			r('b', '15:00'),
			anulada('y', '22:00')
		]);
		expect(ids(cs)).toEqual([
			['a', []],
			['b', ['x']],
			[null, ['y']]
		]);
	});
});

it('celulasOriginais: só as do colaborador, anuladas inclusive', () => {
	const cs = celulasOriginais([
		r('b', '15:00'),
		r('i', '13:00', { createdBy: 'admin' }),
		anulada('a', '11:00')
	]);
	expect(cs.map((c) => c.valida!.id)).toEqual(['a', 'b']);
});

it('colunas em pares, no mínimo 4', () => {
	expect([0, 3, 4, 5, 6].map(totalDeColunas)).toEqual([4, 4, 4, 6, 6]);
	expect([0, 1, 2, 5].map(rotuloColuna)).toEqual(['Entrada 1', 'Saída 1', 'Entrada 2', 'Saída 3']);
});

describe('colunasDoDia', () => {
	const t = (id: string, hora: string, type: string) => r(id, hora, { type });
	const cols = (cs: ReturnType<typeof colunasDoDia<R>>) => cs.map((c) => c?.valida?.id ?? null);

	it('rótulos coerentes com buraco: Saída 2 fica em Saída 2 (01/09)', () => {
		const cs = celulasComAjustes([
			t('a', '09:25', 'entrada'),
			t('b', '13:00', 'saida_almoco'),
			anulada('x', '19:08', 'c'),
			t('c', '19:08', 'saida')
		]);
		expect(cols(colunasDoDia(cs, 4))).toEqual(['a', 'b', null, 'c']);
		expect(colunasDoDia(cs, 4)[3]!.anuladas.map((a) => a.id)).toEqual(['x']);
	});

	it('rótulo repetido, fora de ordem ou mais de 4: vale a posição', () => {
		const repetido = celulasComAjustes([t('a', '09:00', 'entrada'), t('b', '12:00', 'entrada')]);
		expect(cols(colunasDoDia(repetido, 4))).toEqual(['a', 'b', null, null]);
		const foraDeOrdem = celulasComAjustes([t('a', '09:00', 'saida'), t('b', '12:00', 'entrada')]);
		expect(cols(colunasDoDia(foraDeOrdem, 4))).toEqual(['a', 'b', null, null]);
		const seis = celulasComAjustes(
			['08', '10', '12', '14', '16', '18'].map((h, i) => t(`m${i}`, `${h}:00`, 'entrada'))
		);
		expect(cols(colunasDoDia(seis, 6))).toEqual(['m0', 'm1', 'm2', 'm3', 'm4', 'm5']);
	});
});
