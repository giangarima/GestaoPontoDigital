/**
 * @module lib/server/atestado/gerar
 * @description Gera o PDF do Atestado Técnico e Termo de Responsabilidade para
 * a empresa do admin: um atestado do REP-P e um do PTRP. Desenvolvedora e
 * programa vêm da configuração (`afd/config.ts`); destinatária, do banco.
 *
 * Com certificado configurado, o PDF recebe a assinatura PAdES do sistema
 * apenas como demonstração (o aviso sai no próprio documento): a assinatura
 * válida é a qualificada (e-CPF) de cada responsável, feita fora do sistema.
 */
import { prisma } from '@/lib/server/db';
import {
	PTRP_DESENV_RAZAO,
	PTRP_NOME,
	PTRP_VERSAO,
	REP_DEV_INSCRICAO,
	REP_DEV_INSCRICAO_TIPO,
	REP_INPI
} from '@/lib/server/afd/config';
import { finalizarPdf, podeAssinarPdf } from '@/lib/server/assinatura/pdf';
import { inscricaoBr } from '@/lib/server/pdf/formatar';
import type { AtestadoEntrada, TipoAtestado } from './montar';
import { desenharAtestadoPdf } from './pdf';

/** Certificado de registro de programa de computador no INPI (quando houver). */
const CERTIFICADO_INPI = process.env.ATESTADO_CERTIFICADO_INPI || 'N/A';

export interface AtestadoPdf {
	conteudo: Uint8Array;
	nome: string;
	assinado: boolean;
}

export async function gerarAtestadoPdf(empresaId: string): Promise<AtestadoPdf> {
	const empresa = await prisma.empresa.findUniqueOrThrow({ where: { id: empresaId } });

	const entrada = (tipo: TipoAtestado): AtestadoEntrada => ({
		tipo,
		desenvolvedora: {
			razaoSocial: PTRP_DESENV_RAZAO,
			inscricaoTipo: REP_DEV_INSCRICAO_TIPO,
			inscricao: inscricaoBr(REP_DEV_INSCRICAO)
		},
		programa: {
			inpi: REP_INPI,
			certificadoInpi: CERTIFICADO_INPI,
			nome: PTRP_NOME,
			versao: PTRP_VERSAO
		},
		destinataria: {
			razaoSocial: empresa.razaoSocial ?? empresa.nome,
			cnpj: inscricaoBr(empresa.cnpj)
		}
	});

	const assinadoDemo = podeAssinarPdf();
	const doc = await desenharAtestadoPdf([entrada('REP-P'), entrada('PTRP')], { assinadoDemo });
	const { conteudo, assinado } = await finalizarPdf(doc, {
		motivo: 'Demonstração - não substitui a assinatura qualificada dos responsáveis (art. 89)',
		nome: PTRP_DESENV_RAZAO,
		local: PTRP_DESENV_RAZAO
	});
	const cnpj = (empresa.cnpj ?? '').replace(/\D/g, '');
	return { conteudo, nome: `atestado_tecnico_${cnpj}.pdf`, assinado };
}
