/**
 * @module lib/server/perfil/carregar
 * @description Carrega do banco o perfil de um colaborador (regras em `montar.ts`).
 * Uma consulta de espelho cobre o período atual e o anterior; cada um é apurado
 * separado por `apurarPeriodo`, então os totais são os mesmos do espelho daquele
 * intervalo. O banco de horas vem de `carregarExtratoBanco` (ciclo atual).
 */
import { prisma } from '@/lib/server/db';
import { carregarEspelho } from '@/lib/server/espelho/gerar';
import { apurarPeriodo } from '@/lib/server/espelho/montar';
import { carregarExtratoBanco } from '@/lib/server/banco-horas/carregar';
import { diaDaDataPura, diaDe, type Dia } from '@/lib/server/periodo';
import {
	intervalosDoPeriodo,
	montarPerfil,
	type Granularidade,
	type Intervalo,
	type Perfil,
	type PeriodoPerfil,
	type ResumoPerfil
} from './montar';

export interface PerfilColaborador {
	colaborador: {
		id: string;
		nome: string;
		cargo: string | null;
		departamento: string | null;
		jornada: string | null;
		admissao: Dia | null;
		/** Dia do desligamento (soft delete), se houver. */
		desligamento: Dia | null;
	};
	periodo: PeriodoPerfil;
	granularidade: Granularidade;
	atual: Intervalo;
	anterior: Intervalo;
	perfil: Perfil;
	/** Só o resumo do período anterior — base das variações. */
	resumoAnterior: ResumoPerfil;
	/** Ciclo atual do banco de horas; `null` se a empresa não usa banco. */
	banco: { inicio: Dia; fim: Dia; saldoMin: number } | null;
}

/** `null` se o colaborador não existe ou é de outra empresa. */
export async function carregarPerfil(
	empresaId: string,
	colaboradorId: string,
	periodo: PeriodoPerfil,
	agora: Date = new Date()
): Promise<PerfilColaborador | null> {
	const { atual, anterior, granularidade } = intervalosDoPeriodo(periodo, agora);

	const [carga, cabecalho, extrato] = await Promise.all([
		carregarEspelho(empresaId, colaboradorId, anterior.inicio, atual.fim, agora),
		prisma.colaborador.findFirst({
			where: { id: colaboradorId, empresaId },
			select: {
				cargo: true,
				dataAdmissao: true,
				deletedAt: true,
				usuario: { select: { nome: true } },
				departamento: { select: { nome: true } },
				jornada: { select: { nome: true } }
			}
		}),
		carregarExtratoBanco(empresaId, colaboradorId, agora)
	]);
	if (!carga || !cabecalho) return null;

	const { entrada, registros } = carga;
	const apurar = (i: Intervalo) =>
		apurarPeriodo({
			...entrada,
			inicio: i.inicio,
			fim: i.fim,
			admissao: entrada.trabalhador.admissao,
			desligamento: entrada.trabalhador.desligamento
		});
	const localizacoes = (i: Intervalo) =>
		registros
			.filter((r) => r.fonte === 'O')
			.filter((r) => {
				const dia = diaDe(r.marcadoEm);
				return dia >= i.inicio && dia <= i.fim;
			})
			.map((r) => r.localizacao);

	const perfil = montarPerfil(apurar(atual), localizacoes(atual), granularidade);
	const resumoAnterior = montarPerfil(
		apurar(anterior),
		localizacoes(anterior),
		granularidade
	).resumo;

	return {
		colaborador: {
			id: colaboradorId,
			nome: cabecalho.usuario.nome,
			cargo: cabecalho.cargo,
			departamento: cabecalho.departamento?.nome ?? null,
			jornada: cabecalho.jornada?.nome ?? null,
			admissao: cabecalho.dataAdmissao ? diaDaDataPura(cabecalho.dataAdmissao) : null,
			desligamento: cabecalho.deletedAt ? diaDe(cabecalho.deletedAt) : null
		},
		periodo,
		granularidade,
		atual,
		anterior,
		perfil,
		resumoAnterior,
		banco: extrato?.ciclo
			? { inicio: extrato.ciclo.inicio, fim: extrato.ciclo.fim, saldoMin: extrato.ciclo.saldoMin }
			: null
	};
}
