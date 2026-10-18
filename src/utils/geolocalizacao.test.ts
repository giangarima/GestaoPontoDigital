import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	descreverLocalizacao,
	formatDistancia,
	lerCoordenadas,
	linkMapa,
	obterPosicao
} from './geolocalizacao';

describe('obterPosicao', () => {
	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	it('pedido de permissão sem resposta: desiste no prazo e a batida segue sem posição', async () => {
		vi.useFakeTimers();
		// Navegador que nunca chama de volta (permissão pendente).
		vi.stubGlobal('navigator', { geolocation: { getCurrentPosition: () => {} } });
		const p = obterPosicao(8000);
		vi.advanceTimersByTime(8000);
		await expect(p).resolves.toBeNull();
	});
});

describe('formatDistancia', () => {
	it('metros abaixo de 1 km, km com uma casa acima', () => {
		expect(formatDistancia(35.4)).toBe('35 m');
		expect(formatDistancia(1234)).toBe('1,2 km');
		expect(formatDistancia(15000)).toBe('15 km');
	});
});

describe('descreverLocalizacao', () => {
	it('dentro mostra o local e a distância', () => {
		expect(descreverLocalizacao({ localizacao: 'dentro', distanciaM: 35, localNome: 'Loja' })).toBe(
			'Loja · 35 m'
		);
	});

	it('fora mostra a distância até o local mais próximo', () => {
		expect(descreverLocalizacao({ localizacao: 'fora', distanciaM: 1200, localNome: 'Loja' })).toBe(
			'Fora do local: 1,2 km de Loja'
		);
	});

	it('sem localização', () => {
		expect(descreverLocalizacao({ localizacao: 'sem_localizacao' })).toBe('Sem localização');
	});

	it('recurso não configurado ou batida antiga não gera texto', () => {
		expect(descreverLocalizacao({ localizacao: 'sem_locais' })).toBeNull();
		expect(descreverLocalizacao({})).toBeNull();
	});
});

describe('linkMapa', () => {
	it('aponta para o OpenStreetMap com marcador', () => {
		expect(linkMapa(-30.03, -51.22)).toBe(
			'https://www.openstreetmap.org/?mlat=-30.03&mlon=-51.22#map=18/-30.03/-51.22'
		);
	});
});

describe('lerCoordenadas', () => {
	it('par colado do Google Maps', () => {
		expect(lerCoordenadas('-30.0346, -51.2177')).toEqual({
			latitude: -30.0346,
			longitude: -51.2177
		});
	});

	it('link com @lat,lng', () => {
		expect(lerCoordenadas('https://www.google.com/maps/@-30.0346,-51.2177,17z')).toEqual({
			latitude: -30.0346,
			longitude: -51.2177
		});
	});

	it('texto sem par válido', () => {
		expect(lerCoordenadas('Loja Centro')).toBeNull();
		expect(lerCoordenadas('95.1, 10')).toBeNull();
	});
});
