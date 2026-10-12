/**
 * @module store/theme.store
 * @description Tema da interface: modo (claro/escuro) e cor de destaque.
 *
 * Aplicado como `data-theme` / `data-accent` em <html>; os tokens de `app.css`
 * fazem o resto. O script inline do `app.html` aplica a mesma escolha antes do
 * primeiro paint — este store só assume depois da hidratação. Sem escolha
 * salva, o modo segue o sistema operacional.
 */

import { writable } from 'svelte/store';

export type Modo = 'light' | 'dark';
export type Destaque = 'azul' | 'violeta';

export interface Tema {
	modo: Modo;
	destaque: Destaque;
}

/** Chave compartilhada com o script do `app.html` — mudar nos dois lugares. */
const CHAVE = 'ontime-tema';

function inicial(): Tema {
	const padrao: Tema = { modo: 'light', destaque: 'azul' };
	if (typeof window === 'undefined') return padrao;
	const raiz = document.documentElement;
	// O script do app.html já resolveu a escolha (salva ou do sistema).
	return {
		modo: raiz.dataset.theme === 'dark' ? 'dark' : 'light',
		destaque: raiz.dataset.accent === 'violeta' ? 'violeta' : 'azul'
	};
}

export const tema = writable<Tema>(inicial());

function aplicar(t: Tema) {
	const raiz = document.documentElement;
	raiz.dataset.theme = t.modo;
	raiz.dataset.accent = t.destaque;
	try {
		localStorage.setItem(CHAVE, JSON.stringify(t));
	} catch {
		// Storage bloqueado (aba anônima, política do navegador): vale só nesta página.
	}
}

export function alternarModo() {
	tema.update((t) => {
		const novo: Tema = { ...t, modo: t.modo === 'dark' ? 'light' : 'dark' };
		aplicar(novo);
		return novo;
	});
}

export function definirDestaque(destaque: Destaque) {
	tema.update((t) => {
		const novo: Tema = { ...t, destaque };
		aplicar(novo);
		return novo;
	});
}
