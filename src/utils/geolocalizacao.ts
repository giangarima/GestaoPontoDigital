/**
 * @module utils/geolocalizacao
 * @description Posição do dispositivo para a batida e textos de exibição da
 * conferência de local. A captura nunca falha: sem permissão, sem GPS, sem a API
 * (HTTP fora de localhost) ou no timeout, devolve `null` e a batida segue sem
 * localização — quem decide o que isso significa é o servidor.
 */

export interface PosicaoDispositivo {
	latitude: number;
	longitude: number;
	/** Raio de incerteza, em metros. */
	precisao: number;
}

/**
 * O `timeout` da API só conta depois que o navegador obtém a permissão: com o pedido
 * de permissão aberto, a batida ficava esperando a pessoa responder. Por isso há um
 * relógio próprio, que vale desde a chamada.
 */
export function obterPosicao(timeoutMs = 8000): Promise<PosicaoDispositivo | null> {
	if (typeof navigator === 'undefined' || !navigator.geolocation) return Promise.resolve(null);
	return new Promise((resolve) => {
		const limite = setTimeout(() => resolve(null), timeoutMs);
		const fim = (p: PosicaoDispositivo | null) => {
			clearTimeout(limite);
			resolve(p);
		};
		navigator.geolocation.getCurrentPosition(
			(p) =>
				fim({
					latitude: p.coords.latitude,
					longitude: p.coords.longitude,
					precisao: p.coords.accuracy
				}),
			() => fim(null),
			{ enableHighAccuracy: true, maximumAge: 0, timeout: timeoutMs }
		);
	});
}

/** "35 m" / "1,2 km". */
export function formatDistancia(metros: number): string {
	if (metros < 1000) return `${Math.round(metros)} m`;
	return `${(metros / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km`;
}

/** Situação gravada na batida (`Registro.localizacao`). */
export type SituacaoLocalizacao = 'dentro' | 'fora' | 'sem_localizacao' | 'sem_locais';

/** Texto curto da conferência; `null` quando não há o que dizer (recurso não configurado). */
export function descreverLocalizacao(r: {
	localizacao?: string;
	distanciaM?: number;
	localNome?: string;
}): string | null {
	switch (r.localizacao) {
		case 'dentro':
			return r.localNome ? `${r.localNome} · ${formatDistancia(r.distanciaM ?? 0)}` : 'No local';
		case 'fora':
			return r.localNome && r.distanciaM != null
				? `Fora do local: ${formatDistancia(r.distanciaM)} de ${r.localNome}`
				: 'Fora do local';
		case 'sem_localizacao':
			return 'Sem localização';
		default:
			return null;
	}
}

/** Link para conferir a posição no OpenStreetMap. */
export function linkMapa(latitude: number, longitude: number): string {
	return `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=18/${latitude}/${longitude}`;
}

/**
 * Lê "lat, lng" colado do Google Maps ("-30.0346, -51.2177") ou de um link com
 * "@lat,lng". `null` se não houver um par válido.
 */
export function lerCoordenadas(texto: string): { latitude: number; longitude: number } | null {
	const m = texto.match(/(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)/);
	if (!m) return null;
	const latitude = Number(m[1]);
	const longitude = Number(m[2]);
	if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
	return { latitude, longitude };
}
