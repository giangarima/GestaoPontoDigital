/**
 * @module hooks.server
 * @description Server hooks do SvelteKit — intercepta toda requisição.
 *
 * Responsável por:
 *  - Verificar token em cookies
 *  - Popular `event.locals.user`
 *  - Bloquear rotas protegidas para não-autenticados
 *  - Bloquear rotas admin para colaboradores
 */

import type { Handle, ServerInit } from '@sveltejs/kit';
import { redirect, json } from '@sveltejs/kit';
import { building, dev } from '$app/environment';
import { decodeToken } from '@/lib/server/token';
import { prisma } from '@/lib/server/db';
import { registrarInicioDoServidor, registrarParadaDoServidor } from '@/lib/server/disponibilidade';

/**
 * Disponibilidade do REP-P (AFD tipo 6): "07" ao iniciar e "08" no desligamento
 * ordenado (adapter-node emite `sveltekit:shutdown` após SIGTERM/SIGINT). Só no
 * servidor de produção — `vite dev` reinicia a toda hora e poluiria o AFD local.
 */
export const init: ServerInit = async () => {
	if (dev || building) return;
	await registrarInicioDoServidor().catch((e) =>
		console.error('[rep] falha ao registrar disponibilidade', e)
	);
	process.once('sveltekit:shutdown', () => {
		registrarParadaDoServidor()
			.catch((e) => console.error('[rep] falha ao registrar indisponibilidade', e))
			// Libera o pool do banco para o processo encerrar sem esperar o SIGKILL.
			.finally(() => prisma.$disconnect());
	});
};

// Rotas de API públicas (não exigem token)
const PUBLIC_API_PATHS = [
	'/api/auth/login',
	'/api/auth/forgot-password',
	'/api/auth/reset-password'
];

export const handle: Handle = async ({ event, resolve }) => {
	const token = event.cookies.get('auth_token');
	const decoded = token ? decodeToken(token) : null;

	// Token presente mas inválido → tratar como sessão expirada e limpar cookie.
	if (token && !decoded) {
		event.cookies.delete('auth_token', { path: '/' });
	}

	event.locals.user = decoded as App.Locals['user'];

	const { pathname } = event.url;

	// Rotas de página públicas e documentação
	if (pathname.startsWith('/auth') || pathname.startsWith('/api-docs')) {
		return resolve(event);
	}

	// Rotas de API públicas (login)
	if (PUBLIC_API_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
		return resolve(event);
	}

	// Rotas de API protegidas → retornar 401 JSON (não redirecionar)
	if (pathname.startsWith('/api/')) {
		if (!decoded) {
			return json({ error: 'Não autorizado' }, { status: 401 });
		}
		return resolve(event);
	}

	// Rotas de página protegidas → redirecionar
	if (!decoded) {
		throw redirect(303, '/auth/login');
	}

	// Rotas admin → exigem acesso de gestão (role='admin').
	if (pathname.startsWith('/admin') && decoded.role !== 'admin') {
		throw redirect(303, '/colaborador/registro');
	}

	// Rotas de colaborador (bater ponto) → exigem vínculo de colaborador.
	// Um admin puro (sem `colaboradorId`) não tem ponto; o RH (admin + colaborador)
	// tem `colaboradorId` e passa normalmente.
	if (pathname.startsWith('/colaborador') && !decoded.colaboradorId) {
		throw redirect(303, '/admin/dashboard');
	}

	return resolve(event);
};
