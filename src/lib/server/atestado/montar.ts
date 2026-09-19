/**
 * @module lib/server/atestado/montar
 * @description Conteúdo do Atestado Técnico e Termo de Responsabilidade
 * (Portaria MTP 671/2021, art. 89), na ordem do modelo oficial publicado no
 * gov.br ("modelo-do-atestado-tecnico-e-termo-de-responsabilidade.pdf").
 *
 * O OnTime é REP-P (registra as marcações) e PTRP (programa de tratamento);
 * o modelo pede um tipo por documento, então há um atestado para cada um.
 * Os campos de equipamento e de assinatura do REP-C ficam "N/A".
 *
 * PURO: recebe os dados já carregados (empresa do banco, desenvolvedora da
 * configuração) — ver `gerar.ts`.
 */

export type TipoAtestado = 'REP-P' | 'PTRP';

export interface AtestadoEntrada {
	tipo: TipoAtestado;
	desenvolvedora: {
		razaoSocial: string;
		/** "1" CNPJ | "2" CPF (mesma convenção do AFD). */
		inscricaoTipo: string;
		inscricao: string;
	};
	programa: {
		/** Número de registro do REP-P no INPI. */
		inpi: string;
		/** Certificado de registro de programa de computador no INPI (ou "N/A"). */
		certificadoInpi: string;
		nome: string;
		versao: string;
	};
	destinataria: { razaoSocial: string; cnpj: string };
}

export const TITULO_ATESTADO = 'ATESTADO TÉCNICO E TERMO DE RESPONSABILIDADE';

const NA = 'N/A';

/** Parágrafo de abertura do modelo, com a desenvolvedora. */
export function declaracaoAtestado(e: AtestadoEntrada): string {
	const doc = e.desenvolvedora.inscricaoTipo === '2' ? 'CPF' : 'CNPJ';
	return (
		`Na qualidade de responsável técnico e de responsável legal da empresa ` +
		`${e.desenvolvedora.razaoSocial} (${doc} nº ${e.desenvolvedora.inscricao}), os signatários ` +
		`abaixo, em atenção ao art. 89 da Portaria MTP nº 671/2021, atestam e declaram que o ` +
		`equipamento e/ou programa identificados abaixo estão em conformidade com a Portaria MTP ` +
		`nº 671/2021.`
	);
}

export const TERMO_RESPONSABILIDADE =
	'Declaramos ainda, que estamos cientes das consequências legais, cíveis e criminais, quanto à ' +
	'falsa declaração, falso atestado e falsidade ideológica. Reiteramos ao usuário que este ' +
	'documento deve ficar disponível para pronta apresentação para a Inspeção do Trabalho.';

/** Campos de identificação, na ordem do modelo. */
export function camposAtestado(e: AtestadoEntrada): [rotulo: string, valor: string][] {
	return [
		['Tipo do REP/PTRP', e.tipo],
		['Marca Equipamento', NA],
		['Modelo Equipamento', NA],
		['Certificado de conformidade', NA],
		['Número de fabricação', NA],
		// O número de registro no INPI é "do REP-P" no modelo.
		['Número de registro no INPI', e.tipo === 'REP-P' ? e.programa.inpi : NA],
		['Certificado de registro de programa de computador no INPI', e.programa.certificadoInpi],
		['Identificador do Programa', e.programa.nome],
		['Versão do Programa', e.programa.versao]
	];
}

/** Bloco "Assinatura Eletrônica" do modelo: só se aplica ao REP-C. */
export function camposAssinaturaRepC(): [rotulo: string, valor: string][] {
	return [
		['Chave pública', NA],
		['Algoritmo de criptografia assimétrica', NA],
		['Algoritmo de hash', NA]
	];
}

export function camposDestinataria(e: AtestadoEntrada): [rotulo: string, valor: string][] {
	return [
		['Razão Social', e.destinataria.razaoSocial],
		['CNPJ/CPF', e.destinataria.cnpj]
	];
}
