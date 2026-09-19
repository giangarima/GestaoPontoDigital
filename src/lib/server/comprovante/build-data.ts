import { prisma } from '@/lib/server/db';
import { formatDate, formatTime } from '@/utils/date';
import { formatCpfInput } from '@/utils/validators';
import { formatNsr } from '@/lib/server/nsr';
import { REP_INPI } from '@/lib/server/afd/config';
import { inscricaoBr } from '@/lib/server/pdf/formatar';
import type { ComprovanteData, RegistroTipo } from './types';

export const TIPO_LABELS: Record<string, string> = {
	entrada: 'ENTRADA',
	saida_almoco: 'SAÍDA ALMOÇO',
	retorno_almoco: 'RETORNO ALMOÇO',
	saida: 'SAÍDA'
};

/**
 * Dados do comprovante de uma marcação ORIGINAL do REP (fonte "O"). Inclusão
 * do tratamento (fonte "I") não tem comprovante: não foi uma marcação do
 * trabalhador, não tem NSR nem hash.
 */
export async function buildComprovanteData(registroId: string): Promise<ComprovanteData> {
	const registro = await prisma.registro.findUnique({
		where: { id: registroId },
		include: { empresa: true, colaborador: { include: { usuario: true } } }
	});
	if (!registro) throw new Error('Registro não encontrado');
	if (registro.fonte !== 'O' || registro.nsr === null || registro.hash === null) {
		throw new Error('Só marcações originais do REP (fonte "O") têm comprovante');
	}

	const u = registro.colaborador.usuario;
	const { empresa, marcadoEm, nsr } = registro;
	const nsrFormatado = formatNsr(nsr);
	const tipo = registro.tipo as RegistroTipo;

	return {
		sistemaNome: 'GestaoPontoDigital',
		registroId: registro.id,
		nsr,
		nsrFormatado,
		tipo,
		tipoLabel: TIPO_LABELS[tipo] ?? tipo,
		marcadoEm,
		data: formatDate(marcadoEm),
		hora: formatTime(marcadoEm),
		empresaNome: empresa.razaoSocial ?? empresa.nome,
		empresaId: registro.empresaId,
		empresaCnpj: empresa.cnpj ? inscricaoBr(empresa.cnpj) : null,
		empresaCaepfCno: empresa.caepfCno ? inscricaoBr(empresa.caepfCno) : null,
		localPrestacao: empresa.localPrestacao,
		colaboradorNome: u.nome,
		colaboradorId: registro.colaboradorId,
		colaboradorCpf: formatCpfInput(u.cpf),
		colaboradorEmail: u.email,
		repInpi: REP_INPI,
		hashMarcacao: registro.hash,
		assinadoEm: undefined,
		hashDocumento: undefined,
		nomeArquivo: `comprovante-ponto-${nsrFormatado}.pdf`
	};
}

export default buildComprovanteData;
