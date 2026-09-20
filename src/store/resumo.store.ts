/**
 * @module store/resumo.store
 * @description Contadores que o menu lateral mostra como badge: dias em aberto
 * no mês e justificativas aguardando aprovação.
 *
 * O menu aparece em toda tela do admin, então os números são buscados uma vez
 * no layout e ficam aqui — puxar o painel inteiro a cada navegação só para ler
 * dois inteiros seria desperdício. Quem trata os dias é `/admin/pendencias`, e
 * as justificativas, `/admin/justificativas`; depois de tratar, `recarregarResumo`
 * traz os números atualizados.
 */

import { writable } from 'svelte/store';
import { adminService, type ResumoAdmin } from '@/services/admin.service';

export const resumoAdmin = writable<ResumoAdmin>({
	diasEmAberto: 0,
	justificativasPendentes: 0
});

/**
 * Busca os contadores. Silencioso de propósito: um badge que não carregou não
 * justifica um erro na tela, e a própria página de destino mostra o número certo.
 */
export async function recarregarResumo(): Promise<void> {
	try {
		resumoAdmin.set(await adminService.resumo());
	} catch {
		// Mantém o valor anterior.
	}
}
