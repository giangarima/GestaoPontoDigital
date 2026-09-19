/**
 * @module lib/server/auditoria
 * @description Auditoria de integridade do REP-P (Portaria 671/2021) de uma empresa.
 * Combina duas verificações complementares:
 *
 * 1. **Hash-chain das batidas** (`verificarCadeia`): detecta batida alterada ou
 *    removida do meio da cadeia.
 * 2. **Sequência de NSR**: todo NSR de 1 até `Empresa.ultimoNsr` precisa existir
 *    em alguma das tabelas do diário (batidas, eventos de empregador e de
 *    empregado). Cobre o que a cadeia sozinha não vê: exclusão da ÚLTIMA batida
 *    (nenhum elo posterior aponta para ela) e exclusão de eventos tipo 2/5 (que
 *    não entram no hash). Transação que falha não consome NSR, então qualquer
 *    buraco é anomalia.
 */
import { prisma } from '@/lib/server/db';
import { verificarCadeia, type CadeiaResultado } from '@/lib/server/registro-ledger';

/** Quantos NSRs ausentes listar (o total vem à parte). */
const LIMITE_AUSENTES = 50;
/** Quantos elos recentes da cadeia exibir. */
const ELOS_RECENTES = 10;

export interface EloDTO {
	nsr: string;
	colaborador: string;
	tipo: string;
	marcadoEm: string;
	registradoEm: string;
	hash: string;
	hashAnterior: string | null;
}

export interface AuditoriaDTO {
	/** true só se a cadeia confere E não há NSR faltando. */
	integra: boolean;
	verificadoEm: string;
	cadeia: CadeiaResultado;
	/** Batida onde a cadeia quebrou (null se íntegra). */
	quebra: EloDTO | null;
	sequencia: {
		ultimoNsr: string;
		totalAusentes: number;
		/** Primeiros NSRs ausentes, em ordem crescente (até LIMITE_AUSENTES). */
		ausentes: string[];
	};
	/** Últimas batidas, da mais recente para a mais antiga. */
	elos: EloDTO[];
}

const includeColaborador = {
	colaborador: { select: { usuario: { select: { nome: true } } } }
} as const;

function toEloDTO(r: {
	nsr: bigint | null;
	tipo: string;
	marcadoEm: Date;
	registradoEm: Date;
	hash: string | null;
	hashAnterior: string | null;
	colaborador: { usuario: { nome: string } };
}): EloDTO {
	return {
		nsr: String(r.nsr),
		colaborador: r.colaborador.usuario.nome,
		tipo: r.tipo,
		marcadoEm: r.marcadoEm.toISOString(),
		registradoEm: r.registradoEm.toISOString(),
		hash: r.hash ?? '',
		hashAnterior: r.hashAnterior
	};
}

/** NSRs entre 1 e `ultimo_nsr` que não existem em nenhuma tabela do diário. */
async function nsrsAusentes(empresaId: string): Promise<{ total: number; primeiros: bigint[] }> {
	const rows = await prisma.$queryRaw<{ nsr: bigint; total: bigint }[]>`
		WITH esperados AS (
			SELECT generate_series(1::bigint, e.ultimo_nsr) AS nsr
			FROM empresas e WHERE e.id = ${empresaId}
		),
		existentes AS (
			SELECT nsr FROM registros WHERE empresa_id = ${empresaId} AND fonte = 'O'
			UNION ALL SELECT nsr FROM eventos_empregador WHERE empresa_id = ${empresaId}
			UNION ALL SELECT nsr FROM eventos_empregado WHERE empresa_id = ${empresaId}
		),
		ausentes AS (
			SELECT nsr FROM esperados EXCEPT SELECT nsr FROM existentes
		)
		SELECT nsr, count(*) OVER () AS total FROM ausentes ORDER BY nsr LIMIT ${LIMITE_AUSENTES}`;

	return {
		total: rows.length ? Number(rows[0].total) : 0,
		primeiros: rows.map((r) => r.nsr)
	};
}

export async function auditarEmpresa(empresaId: string): Promise<AuditoriaDTO> {
	const [empresa, cadeia, ausentes, recentes] = await Promise.all([
		prisma.empresa.findUniqueOrThrow({ where: { id: empresaId }, select: { ultimoNsr: true } }),
		verificarCadeia(empresaId),
		nsrsAusentes(empresaId),
		prisma.registro.findMany({
			where: { empresaId, fonte: 'O' }, // inclusões (nsr NULL) viriam primeiro no DESC
			orderBy: { nsr: 'desc' },
			take: ELOS_RECENTES,
			include: includeColaborador
		})
	]);

	const quebra = cadeia.quebraNsr
		? await prisma.registro.findUnique({
				where: { empresaId_nsr: { empresaId, nsr: BigInt(cadeia.quebraNsr) } },
				include: includeColaborador
			})
		: null;

	return {
		integra: cadeia.valida && ausentes.total === 0,
		verificadoEm: new Date().toISOString(),
		cadeia,
		quebra: quebra ? toEloDTO(quebra) : null,
		sequencia: {
			ultimoNsr: empresa.ultimoNsr.toString(),
			totalAusentes: ausentes.total,
			ausentes: ausentes.primeiros.map(String)
		},
		elos: recentes.map(toEloDTO)
	};
}
