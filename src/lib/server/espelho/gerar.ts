/**
 * @module lib/server/espelho/gerar
 * @description Carrega do banco os dados do espelho de um colaborador e gera o
 * PDF. A montagem (regras) fica em `montar.ts`; o desenho, em `pdf.ts`.
 *
 * O PDF sai assinado em PAdES com o mesmo certificado do comprovante quando há
 * um configurado. A portaria não exige assinatura no espelho; ela só garante a
 * integridade da cópia entregue ao trabalhador.
 */
import { SUBFILTER_ETSI_CADES_DETACHED } from '@signpdf/utils';
import { pdflibAddPlaceholder } from '@signpdf/placeholder-pdf-lib';
import { prisma } from '@/lib/server/db';
import { lerCertificadoP12 } from '@/lib/server/assinatura/certificado';
import signPdf from '@/lib/server/comprovante/sign-pdf';
import { ausenciaNoPeriodo, instantesDoPeriodo, type Dia } from '@/lib/server/periodo';
import { montarEspelho, type EspelhoEntrada } from './montar';
import { desenharEspelhoPdf } from './pdf';

/**
 * Registros do período (com anulação) + a entrada do espelho. `null` se o
 * colaborador não existe ou é de outra empresa.
 */
export async function carregarEspelho(
	empresaId: string,
	colaboradorId: string,
	inicio: Dia,
	fim: Dia,
	emitidoEm: Date = new Date()
) {
	const colaborador = await prisma.colaborador.findFirst({
		where: { id: colaboradorId, empresaId },
		include: {
			empresa: true,
			usuario: { select: { nome: true, cpf: true } },
			jornada: { include: { versoes: true } }
		}
	});
	if (!colaborador) return null;

	const [registros, ausencias] = await Promise.all([
		prisma.registro.findMany({
			where: { colaboradorId, marcadoEm: instantesDoPeriodo(inicio, fim) },
			orderBy: { marcadoEm: 'asc' },
			include: { anulacao: true }
		}),
		prisma.ausencia.findMany({
			where: { colaboradorId, empresaId, status: 'aprovada', ...ausenciaNoPeriodo(inicio, fim) }
		})
	]);

	const { empresa, usuario } = colaborador;
	const entrada: EspelhoEntrada = {
		empresa: {
			razaoSocial: empresa.razaoSocial ?? empresa.nome,
			cnpj: empresa.cnpj,
			caepfCno: empresa.caepfCno
		},
		trabalhador: {
			nome: usuario.nome,
			cpf: usuario.cpf,
			admissao: colaborador.dataAdmissao,
			desligamento: colaborador.deletedAt,
			cargo: colaborador.cargo
		},
		inicio,
		fim,
		emitidoEm,
		versoes: colaborador.jornada?.versoes ?? [],
		ausencias,
		marcacoes: registros
	};
	return { colaborador, registros, entrada };
}

export interface EspelhoPdf {
	conteudo: Uint8Array;
	nome: string;
	assinado: boolean;
}

function slug(nome: string): string {
	return nome
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[^A-Za-z0-9]+/g, '_')
		.replace(/^_|_$/g, '')
		.toLowerCase();
}

/** Espelho em PDF (assinado em PAdES quando há certificado configurado). */
export async function gerarEspelhoPdf(entrada: EspelhoEntrada): Promise<EspelhoPdf> {
	const espelho = montarEspelho(entrada);
	const doc = await desenharEspelhoPdf(espelho);
	const nome = `espelho_${slug(entrada.trabalhador.nome)}_${entrada.inicio}_${entrada.fim}.pdf`;

	const semAssinatura =
		process.env.COMPROVANTE_SKIP_SIGN === 'true' || lerCertificadoP12() === null;
	if (semAssinatura) {
		return { conteudo: await doc.save(), nome, assinado: false };
	}

	pdflibAddPlaceholder({
		pdfDoc: doc,
		reason: 'Espelho de Ponto Eletrônico (Portaria MTP 671/2021, art. 84)',
		contactInfo: '',
		name: espelho.empresa.razaoSocial,
		location: espelho.empresa.razaoSocial,
		subFilter: SUBFILTER_ETSI_CADES_DETACHED
	});
	const { buffer } = await signPdf(Buffer.from(await doc.save()));
	return { conteudo: new Uint8Array(buffer), nome, assinado: true };
}
