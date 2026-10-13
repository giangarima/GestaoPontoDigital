/**
 * @module lib/server/empresa
 * @description DTO da empresa para a API.
 */
import type { Empresa } from '@/lib/server/prisma-client/client';

/**
 * A linha da empresa pronta para JSON: `ultimoNsr` é BigInt (contador do REP) e
 * `JSON.stringify` não serializa BigInt — devolver a linha crua dá 500.
 */
export function toEmpresaDTO(empresa: Empresa) {
	return { ...empresa, ultimoNsr: empresa.ultimoNsr.toString() };
}
