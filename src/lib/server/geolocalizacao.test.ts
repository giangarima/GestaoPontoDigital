import { describe, expect, it } from 'vitest';
import {
	FOLGA_PRECISAO_MAX_M,
	avaliarPosicao,
	distanciaM,
	lerLocalTrabalho,
	validarPosicao,
	type LocalConferencia
} from './geolocalizacao';

// 0,001° de latitude ≈ 111,19 m em qualquer longitude.
const GRAU_LAT_M = 111_194.93;
const loja: LocalConferencia = { id: 'loja', latitude: -30.0346, longitude: -51.2177, raioM: 100 };
const deposito: LocalConferencia = {
	id: 'deposito',
	latitude: -30.05,
	longitude: -51.2177,
	raioM: 100
};
const aoNorteDe = (local: LocalConferencia, metros: number, precisao = 0) => ({
	latitude: local.latitude + metros / GRAU_LAT_M,
	longitude: local.longitude,
	precisao
});

describe('distanciaM (haversine)', () => {
	it('mesmo ponto é zero', () => {
		expect(distanciaM(loja, loja)).toBe(0);
	});

	it('1° de latitude ≈ 111,2 km', () => {
		expect(distanciaM({ latitude: 0, longitude: 0 }, { latitude: 1, longitude: 0 })).toBeCloseTo(
			GRAU_LAT_M,
			0
		);
	});

	it('Porto Alegre → São Paulo ≈ 852 km', () => {
		const sp = { latitude: -23.5505, longitude: -46.6333 };
		expect(distanciaM(loja, sp) / 1000).toBeCloseTo(852, -1);
	});
});

describe('avaliarPosicao', () => {
	it('sem locais ativos: a empresa não configurou, guarda a posição sem julgar', () => {
		const r = avaliarPosicao(aoNorteDe(loja, 10, 5), []);
		expect(r.localizacao).toBe('sem_locais');
		expect(r.latitude).not.toBeNull();
		expect(r.localTrabalhoId).toBeNull();
	});

	it('sem posição com locais cadastrados é divergência', () => {
		expect(avaliarPosicao(null, [loja])).toEqual({
			latitude: null,
			longitude: null,
			precisaoM: null,
			localizacao: 'sem_localizacao',
			localTrabalhoId: null,
			distanciaM: null
		});
	});

	it('dentro do raio', () => {
		const r = avaliarPosicao(aoNorteDe(loja, 60), [loja]);
		expect(r.localizacao).toBe('dentro');
		expect(r.localTrabalhoId).toBe('loja');
		expect(r.distanciaM).toBe(60);
	});

	it('na borda do raio ainda é dentro; um metro além é fora', () => {
		expect(avaliarPosicao(aoNorteDe(loja, 99.9), [loja]).localizacao).toBe('dentro');
		expect(avaliarPosicao(aoNorteDe(loja, 101), [loja]).localizacao).toBe('fora');
	});

	it('a precisão do GPS dá folga além do raio', () => {
		expect(avaliarPosicao(aoNorteDe(loja, 130, 40), [loja]).localizacao).toBe('dentro');
	});

	it('a folga da precisão tem teto: leitura imprecisa não aprova qualquer lugar', () => {
		const longe = aoNorteDe(loja, 100 + FOLGA_PRECISAO_MAX_M + 10, 2000);
		expect(avaliarPosicao(longe, [loja]).localizacao).toBe('fora');
	});

	it('vale o local mais próximo, e a distância é até ele', () => {
		const r = avaliarPosicao(aoNorteDe(deposito, 30), [loja, deposito]);
		expect(r.localizacao).toBe('dentro');
		expect(r.localTrabalhoId).toBe('deposito');
		expect(r.distanciaM).toBe(30);
	});

	it('fora de todos: aponta o mais próximo e a distância', () => {
		const r = avaliarPosicao(aoNorteDe(loja, 1200), [loja, deposito]);
		expect(r.localizacao).toBe('fora');
		expect(r.localTrabalhoId).toBe('loja');
		expect(r.distanciaM).toBe(1200);
	});

	it('arredonda a precisão gravada', () => {
		expect(avaliarPosicao(aoNorteDe(loja, 0, 12.7), [loja]).precisaoM).toBe(13);
	});
});

describe('validarPosicao', () => {
	it('aceita posição válida', () => {
		expect(validarPosicao({ latitude: -30, longitude: -51, precisao: 15 })).toEqual({
			latitude: -30,
			longitude: -51,
			precisao: 15
		});
	});

	it.each([
		['ausente', undefined],
		['nula', null],
		['latitude fora da faixa', { latitude: 91, longitude: 0, precisao: 1 }],
		['longitude fora da faixa', { latitude: 0, longitude: -181, precisao: 1 }],
		['precisão negativa', { latitude: 0, longitude: 0, precisao: -1 }],
		['texto no lugar de número', { latitude: '-30', longitude: '-51', precisao: 1 }],
		['sem precisão', { latitude: 0, longitude: 0 }]
	])('%s vira null (a batida entra sem localização)', (_, valor) => {
		expect(validarPosicao(valor)).toBeNull();
	});
});

describe('lerLocalTrabalho', () => {
	const valido = { nome: ' Loja Centro ', latitude: -30.03, longitude: -51.22, raioM: 150 };

	it('aceita e apara o nome', () => {
		expect(lerLocalTrabalho(valido)).toEqual({
			ok: true,
			local: { ...valido, nome: 'Loja Centro' }
		});
	});

	it.each([
		['nome vazio', { ...valido, nome: '  ' }, 'nome é obrigatório'],
		['raio pequeno demais', { ...valido, raioM: 5 }, 'raio deve ser de 20 a 5000 m'],
		['raio fracionário', { ...valido, raioM: 150.5 }, 'raio deve ser de 20 a 5000 m'],
		['latitude inválida', { ...valido, latitude: 120 }, 'latitude e longitude inválidas']
	])('%s', (_, valor, erro) => {
		expect(lerLocalTrabalho(valor)).toEqual({ ok: false, erro });
	});
});
