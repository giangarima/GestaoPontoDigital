import { prisma } from '@/lib/server/db';
import type { Prisma } from '@/lib/server/prisma-client/client';
import { formatDate, formatTime } from '@/utils/date';
import { formatCpfInput } from '@/utils/validators';
import { formatNsr } from '@/lib/server/nsr';
import type { ComprovanteData, RegistroTipo } from './types';

type RegistroCompletamenteCarregado = Prisma.RegistroGetPayload<{
	include: { empresa: true; colaborador: { include: { usuario: true } } };
}>;

export const TIPO_LABELS: Record<string, string> = {
	entrada: 'ENTRADA',
	saida_almoco: 'SAÍDA ALMOÇO',
	retorno_almoco: 'RETORNO ALMOÇO',
	saida: 'SAÍDA'
};

export async function buildComprovanteData(registroId: string): Promise<ComprovanteData> {
	const registro = (await prisma.registro.findUnique({
		where: { id: registroId },
		include: { empresa: true, colaborador: { include: { usuario: true } } }
	})) as RegistroCompletamenteCarregado | null;
	if (!registro) throw new Error('Registro não encontrado');

	const u = registro.colaborador.usuario;
	const marcadoEm = registro.marcadoEm;
	const nsr = registro.nsr ?? 0n;
	const nsrFormatado = formatNsr(nsr);
	const tipo = registro.tipo as RegistroTipo;

	const data: ComprovanteData = {
		sistemaNome: 'GestaoPontoDigital',
		registroId: registro.id,
		nsr,
		nsrFormatado,
		tipo,
		tipoLabel: TIPO_LABELS[tipo] ?? tipo,
		marcadoEm,
		data: formatDate(marcadoEm),
		hora: formatTime(marcadoEm),
		empresaNome: registro.empresa.nome,
		empresaId: registro.empresaId,
		empresaCnpj: registro.empresa.cnpj ?? null,
		colaboradorNome: u.nome,
		colaboradorId: registro.colaboradorId,
		colaboradorCpf: formatCpfInput(u.cpf),
		colaboradorEmail: u.email,
		assinadoEm: undefined,
		hashDocumento: undefined,
		nomeArquivo: `comprovante-ponto-${nsrFormatado}.pdf`
	};

	return data;
}

export default buildComprovanteData;
