/**
 * @module services/api
 * @description Cliente HTTP centralizado para comunicação com a API.
 *
 * Todas as requisições do app passam por aqui, garantindo:
 *  - Base URL única
 *  - Headers padrão (Content-Type, Authorization)
 *  - Interceptação de erros (401 → redirect p/ login)
 *  - Tipagem forte nos retornos
 */

const BASE_URL = '/api';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

interface RequestOptions<TBody = unknown> {
	method?: HttpMethod;
	body?: TBody;
	headers?: Record<string, string>;
	signal?: AbortSignal;
}

interface ApiError {
	status: number;
	message: string;
	details?: unknown;
}

function getAuthToken(): string | null {
	if (typeof window === 'undefined') return null;
	return localStorage.getItem('auth_token');
}

function buildHeaders(custom?: Record<string, string>): HeadersInit {
	const headers: Record<string, string> = {
		'Content-Type': 'application/json',
		...custom
	};

	const token = getAuthToken();
	if (token) {
		headers['Authorization'] = `Bearer ${token}`;
	}

	return headers;
}

async function handleResponse<TResponse>(response: Response): Promise<TResponse> {
	if (!response.ok) {
		if (response.status === 401) {
			localStorage.removeItem('auth_token');
			document.cookie = 'auth_token=; Max-Age=0; path=/; SameSite=Lax';
			if (!window.location.pathname.startsWith('/auth/')) {
				window.location.href = '/auth/login';
			}
		}

		const error: ApiError = {
			status: response.status,
			message: response.statusText,
			details: await response.json().catch(() => null)
		};

		throw error;
	}

	if (response.status === 204) return undefined as TResponse;
	return response.json() as Promise<TResponse>;
}

export async function api<TResponse, TBody = unknown>(
	endpoint: string,
	options: RequestOptions<TBody> = {}
): Promise<TResponse> {
	const { method = 'GET', body, headers, signal } = options;

	const response = await fetch(`${BASE_URL}${endpoint}`, {
		method,
		headers: buildHeaders(headers),
		body: body ? JSON.stringify(body) : undefined,
		signal
	});

	return handleResponse<TResponse>(response);
}

/** Atalhos tipados para cada verbo HTTP */
export const get = <T>(url: string, signal?: AbortSignal) => api<T>(url, { signal });

export const post = <T, B = unknown>(url: string, body: B) =>
	api<T, B>(url, { method: 'POST', body });

export const put = <T, B = unknown>(url: string, body: B) =>
	api<T, B>(url, { method: 'PUT', body });

export const patch = <T, B = unknown>(url: string, body: B) =>
	api<T, B>(url, { method: 'PATCH', body });

export const del = <T>(url: string) => api<T>(url, { method: 'DELETE' });

/** Resultado de um download de arquivo (AFD, AEJ, espelho em PDF). */
export interface Download {
	/** `false` quando o servidor respondeu `X-Assinatura: ausente`. */
	assinado: boolean;
}

/**
 * Baixa um arquivo da API (resposta binária, não JSON) e abre o "salvar" do
 * navegador. O nome vem do `Content-Disposition` (ou `nomePadrao`).
 */
export async function baixar(endpoint: string, nomePadrao: string): Promise<Download> {
	const response = await fetch(`${BASE_URL}${endpoint}`, { headers: buildHeaders() });
	if (!response.ok) await handleResponse(response); // 401 → login; lança ApiError

	const disposicao = response.headers.get('Content-Disposition') ?? '';
	const nome = disposicao.match(/filename="(.+?)"/)?.[1] ?? nomePadrao;
	const url = URL.createObjectURL(await response.blob());
	const a = document.createElement('a');
	a.href = url;
	a.download = nome;
	a.click();
	URL.revokeObjectURL(url);
	return { assinado: response.headers.get('X-Assinatura') !== 'ausente' };
}
