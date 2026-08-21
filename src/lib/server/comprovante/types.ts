export type RegistroTipo = 'entrada' | 'saida_almoco' | 'retorno_almoco' | 'saida';

export interface ComprovanteData {
	sistemaNome: string;
	registroId: string;
	nsr: bigint | number;
	nsrFormatado: string;
	tipo: RegistroTipo;
	tipoLabel: string;
	marcadoEm: Date;
	data: string;
	hora: string;
	empresaNome: string;
	empresaId: string;
	empresaCnpj?: string | null;
	colaboradorNome: string;
	colaboradorId: string;
	colaboradorCpf: string;
	colaboradorEmail: string;
	assinadoEm?: Date;
	hashDocumento?: string;
	nomeArquivo: string;
	emailHtml?: string;
	emailText?: string;
}
