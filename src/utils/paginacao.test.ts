import { describe, expect, it } from 'vitest';
import {
	ELIPSE,
	intervaloDaPagina,
	numerosDePagina,
	paginaValida,
	totalDePaginas
} from './paginacao';

describe('totalDePaginas', () => {
	it('arredonda para cima', () => {
		expect(totalDePaginas(35, 20)).toBe(2);
		expect(totalDePaginas(40, 20)).toBe(2);
		expect(totalDePaginas(41, 20)).toBe(3);
	});

	it('lista vazia ainda é uma página', () => {
		expect(totalDePaginas(0, 20)).toBe(1);
	});
});

describe('intervaloDaPagina', () => {
	it('numera os itens da página', () => {
		expect(intervaloDaPagina(1, 35, 20)).toEqual([1, 20]);
		expect(intervaloDaPagina(2, 35, 20)).toEqual([21, 35]);
	});

	it('lista vazia não tem intervalo', () => {
		expect(intervaloDaPagina(1, 0, 20)).toEqual([0, 0]);
	});
});

describe('paginaValida', () => {
	it('prende a página ao intervalo existente', () => {
		expect(paginaValida(0, 3)).toBe(1);
		expect(paginaValida(9, 3)).toBe(3);
		expect(paginaValida(2, 3)).toBe(2);
	});

	// Busca e filtro encolhem a lista sob os pés da página atual.
	it('traz de volta quando a lista encolhe', () => {
		expect(paginaValida(5, 1)).toBe(1);
	});
});

describe('numerosDePagina', () => {
	it('até 7 páginas mostra todas, sem reticência', () => {
		expect(numerosDePagina(1, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
	});

	it('no começo, corta só o meio', () => {
		expect(numerosDePagina(2, 20)).toEqual([1, 2, 3, ELIPSE, 20]);
	});

	it('no meio, corta os dois lados', () => {
		expect(numerosDePagina(10, 20)).toEqual([1, ELIPSE, 9, 10, 11, ELIPSE, 20]);
	});

	it('no fim, corta só o começo', () => {
		expect(numerosDePagina(19, 20)).toEqual([1, ELIPSE, 18, 19, 20]);
	});

	it('nunca repete reticência seguida', () => {
		for (let p = 1; p <= 30; p++) {
			const itens = numerosDePagina(p, 30);
			const seguidas = itens.some((x, i) => x === ELIPSE && itens[i + 1] === ELIPSE);
			expect(seguidas).toBe(false);
		}
	});

	it('sempre inclui a primeira, a última e a atual', () => {
		for (let p = 1; p <= 30; p++) {
			expect(numerosDePagina(p, 30)).toEqual(expect.arrayContaining([1, p, 30]));
		}
	});
});
