/**
 * @module lib/server/geolocalizacao
 * @description Conferência do local da batida contra os locais de trabalho da
 * empresa. Puro: recebe a posição do navegador e os locais, devolve o que gravar
 * em `Registro`. A regra só **sinaliza** — a batida fora do local ou sem posição
 * entra do mesmo jeito (art. 74 da Portaria 671 veda restringir a marcação, e o
 * GPS do celular erra). A localização não entra no AFD nem no hash da marcação.
 */
import { z } from 'zod';

export type SituacaoLocalizacao = 'dentro' | 'fora' | 'sem_localizacao' | 'sem_locais';

export interface Posicao {
	latitude: number;
	longitude: number;
	/** Raio de incerteza informado pelo navegador, em metros. */
	precisao: number;
}

export interface LocalConferencia {
	id: string;
	latitude: number;
	longitude: number;
	raioM: number;
}

/** O que vai para as colunas de geolocalização do `Registro`. */
export interface GeoRegistro {
	latitude: number | null;
	longitude: number | null;
	precisaoM: number | null;
	localizacao: SituacaoLocalizacao;
	localTrabalhoId: string | null;
	distanciaM: number | null;
}

/**
 * Teto da folga dada pela precisão do GPS. Sem ele, uma leitura de rede com
 * precisão de 2 km "aprovaria" qualquer batida da cidade.
 */
export const FOLGA_PRECISAO_MAX_M = 50;

const RAIO_TERRA_M = 6_371_000;

/** Distância em metros entre dois pontos (haversine). */
export function distanciaM(
	a: { latitude: number; longitude: number },
	b: { latitude: number; longitude: number }
): number {
	const rad = (g: number) => (g * Math.PI) / 180;
	const dLat = rad(b.latitude - a.latitude);
	const dLng = rad(b.longitude - a.longitude);
	const h =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLng / 2) ** 2;
	return 2 * RAIO_TERRA_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

const posicaoSchema = z.object({
	latitude: z.number().min(-90).max(90),
	longitude: z.number().min(-180).max(180),
	precisao: z.number().min(0).finite()
});

/**
 * Lê a posição do corpo da requisição. Ausente ou inválida vira `null` — a batida
 * segue como "sem localização", nunca é recusada por isso.
 */
export function validarPosicao(valor: unknown): Posicao | null {
	const r = posicaoSchema.safeParse(valor);
	return r.success ? r.data : null;
}

/**
 * Situação da batida: sem locais ativos a empresa ainda não configurou o recurso
 * (não é divergência); sem posição é divergência; com posição, vale o local mais
 * próximo — `dentro` se a distância cabe no raio mais a precisão (até o teto).
 */
export function avaliarPosicao(posicao: Posicao | null, locais: LocalConferencia[]): GeoRegistro {
	const coords = {
		latitude: posicao?.latitude ?? null,
		longitude: posicao?.longitude ?? null,
		precisaoM: posicao ? Math.round(posicao.precisao) : null
	};
	if (locais.length === 0) {
		return { ...coords, localizacao: 'sem_locais', localTrabalhoId: null, distanciaM: null };
	}
	if (!posicao) {
		return { ...coords, localizacao: 'sem_localizacao', localTrabalhoId: null, distanciaM: null };
	}

	let maisProximo = locais[0];
	let menor = distanciaM(posicao, maisProximo);
	for (const local of locais.slice(1)) {
		const d = distanciaM(posicao, local);
		if (d < menor) {
			menor = d;
			maisProximo = local;
		}
	}

	const folga = Math.min(posicao.precisao, FOLGA_PRECISAO_MAX_M);
	return {
		...coords,
		localizacao: menor <= maisProximo.raioM + folga ? 'dentro' : 'fora',
		localTrabalhoId: maisProximo.id,
		distanciaM: Math.round(menor)
	};
}

export const RAIO_MIN_M = 20;
export const RAIO_MAX_M = 5000;

const localSchema = z.object({
	nome: z.string().trim().min(1, 'nome é obrigatório').max(80),
	latitude: z.number().min(-90).max(90),
	longitude: z.number().min(-180).max(180),
	raioM: z.number().int().min(RAIO_MIN_M).max(RAIO_MAX_M),
	ativo: z.boolean().optional()
});

/** Campos do local devolvidos pela API (`/api/locais-trabalho`). */
export const LOCAL_SELECT = {
	id: true,
	nome: true,
	latitude: true,
	longitude: true,
	raioM: true,
	ativo: true
} as const;

export type LocalTrabalhoInput = z.infer<typeof localSchema>;

/** Valida o cadastro de um local; `erro` é a mensagem para a API. */
export function lerLocalTrabalho(
	valor: unknown
): { ok: true; local: LocalTrabalhoInput } | { ok: false; erro: string } {
	const r = localSchema.safeParse(valor);
	if (r.success) return { ok: true, local: r.data };
	const campo = r.error.issues[0];
	const nome = campo?.path.join('.') ?? '';
	if (nome === 'raioM')
		return { ok: false, erro: `raio deve ser de ${RAIO_MIN_M} a ${RAIO_MAX_M} m` };
	if (nome === 'nome') return { ok: false, erro: 'nome é obrigatório' };
	return { ok: false, erro: 'latitude e longitude inválidas' };
}
