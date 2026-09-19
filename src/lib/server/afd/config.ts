/**
 * @module lib/server/afd/config
 * @description Identificação do REP-P (o software) no AFD. São dados do
 * DESENVOLVEDOR/registro do programa, não da empresa cliente — por isso ficam
 * como configuração do produto (não no banco por empresa).
 *
 * ATENÇÃO: valores placeholder. Antes de uso real, preencher com o número de
 * registro do programa no INPI e o CNPJ do desenvolvedor. Podem vir de variáveis
 * de ambiente (server-side) sem prefixo VITE_.
 */

/** Versão do leiaute do AFD (campo 11 do cabeçalho). */
export const AFD_VERSAO_LEIAUTE = '004';

/** Número de registro do programa no INPI (17 dígitos, campo 7 do cabeçalho). */
export const REP_INPI = process.env.AFD_REP_INPI ?? '00000000000000000';

/** Tipo de inscrição do desenvolvedor do REP (campo 12): "1" CNPJ | "2" CPF. */
export const REP_DEV_INSCRICAO_TIPO = process.env.AFD_REP_DEV_TIPO ?? '1';

/** CNPJ/CPF do desenvolvedor do REP (campo 13, só dígitos). */
export const REP_DEV_INSCRICAO = process.env.AFD_REP_DEV_INSCRICAO ?? '00000000000000';

// ── PTRP (Programa de Tratamento de Registro de Ponto) — registro "08" do AEJ ──
// O PTRP é o módulo de tratamento deste sistema (ajustes, espelho, AEJ). Também
// placeholders: preencher com os dados reais do desenvolvedor antes do uso real.

/** Versão do leiaute do AEJ (campo 10 do registro "01"). */
export const AEJ_VERSAO_LEIAUTE = '002';

/** Nome e versão do PTRP (campos 2 e 3 do registro "08"). */
export const PTRP_NOME = process.env.PTRP_NOME ?? 'OnTime - Controle de Jornada Digital';
export const PTRP_VERSAO = process.env.PTRP_VERSAO ?? '0.1.0';

/** Razão social/nome e e-mail do desenvolvedor do PTRP (campos 6 e 7 do registro "08"). */
export const PTRP_DESENV_RAZAO = process.env.PTRP_DESENV_RAZAO ?? 'OnTime Sistemas';
export const PTRP_DESENV_EMAIL = process.env.PTRP_DESENV_EMAIL ?? 'contato@ontime.dev';
