export type RegistroTipo = 'entrada' | 'saida_almoco' | 'retorno_almoco' | 'saida';

/** Dados do Comprovante de Registro de Ponto do Trabalhador (Portaria 671/2021, art. 79). */
export interface ComprovanteData {
	sistemaNome: string;
	registroId: string;
	/** II — NSR. */
	nsr: bigint | number;
	nsrFormatado: string;
	tipo: RegistroTipo;
	tipoLabel: string;
	/** VI — data e horário da marcação. */
	marcadoEm: Date;
	data: string;
	hora: string;
	/** III — empregador: nome (razão social), CNPJ/CPF e CAEPF/CNO. */
	empresaNome: string;
	empresaId: string;
	empresaCnpj?: string | null;
	empresaCaepfCno: string | null;
	/** IV — local da prestação do serviço, quando cadastrado. */
	localPrestacao: string | null;
	/** V — trabalhador: nome e CPF. */
	colaboradorNome: string;
	colaboradorId: string;
	colaboradorCpf: string;
	colaboradorEmail: string;
	/** VII — número de registro do REP-P no INPI. */
	repInpi: string;
	/** VIII — código hash (SHA-256) da marcação: o mesmo do registro tipo 7 no AFD. */
	hashMarcacao: string;
	assinadoEm?: Date;
	hashDocumento?: string;
	nomeArquivo: string;
	emailHtml?: string;
	emailText?: string;
}
