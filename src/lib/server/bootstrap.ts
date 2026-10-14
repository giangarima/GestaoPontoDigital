/**
 * @module lib/server/bootstrap
 * @description Primeira empresa e primeiro admin de um banco de produção vazio.
 *
 * O sistema não tem cadastro público de empresa: sem o seed (que é só de
 * desenvolvimento), alguém precisa existir para fazer o primeiro login. O resto —
 * departamentos, jornadas, colaboradores — o admin cadastra pela interface.
 *
 * Imports relativos de propósito: `prisma/bootstrap.ts` roda isto via tsx, fora
 * do Vite, onde os aliases `$lib`/`@/` não existem.
 */
import bcrypt from 'bcryptjs';
import type { PrismaClient } from './prisma-client/client';
import { isStrongPassword, isValidCnpj, isValidCpf, isValidEmail } from '../../utils/validators';

export interface DadosBootstrap {
	empresaNome: string;
	empresaCnpj: string | null;
	horaAbertura: string;
	horaFechamento: string;
	adminNome: string;
	adminEmail: string;
	adminCpf: string;
	adminSenha: string;
}

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Lê e valida as variáveis de ambiente do bootstrap. Junta todos os problemas
 * numa mensagem só, para quem roda no servidor corrigir de uma vez.
 */
export function lerDadosBootstrap(env: Record<string, string | undefined>): DadosBootstrap {
	const v = (k: string) => env[k]?.trim() ?? '';
	const dados: DadosBootstrap = {
		empresaNome: v('EMPRESA_NOME'),
		empresaCnpj: v('EMPRESA_CNPJ').replace(/\D/g, '') || null,
		horaAbertura: v('HORA_ABERTURA') || '08:00',
		horaFechamento: v('HORA_FECHAMENTO') || '18:00',
		adminNome: v('ADMIN_NOME'),
		adminEmail: v('ADMIN_EMAIL').toLowerCase(),
		adminCpf: v('ADMIN_CPF').replace(/\D/g, ''),
		adminSenha: env.ADMIN_SENHA ?? ''
	};

	const erros: string[] = [];
	if (!dados.empresaNome) erros.push('EMPRESA_NOME é obrigatório');
	if (dados.empresaCnpj && !isValidCnpj(dados.empresaCnpj)) erros.push('EMPRESA_CNPJ inválido');
	if (!HORA.test(dados.horaAbertura)) erros.push('HORA_ABERTURA deve ser HH:MM');
	if (!HORA.test(dados.horaFechamento)) erros.push('HORA_FECHAMENTO deve ser HH:MM');
	if (!dados.adminNome) erros.push('ADMIN_NOME é obrigatório');
	if (!isValidEmail(dados.adminEmail)) erros.push('ADMIN_EMAIL inválido');
	if (!isValidCpf(dados.adminCpf)) erros.push('ADMIN_CPF inválido');
	if (!isStrongPassword(dados.adminSenha))
		erros.push('ADMIN_SENHA precisa de 8+ caracteres, uma maiúscula e um número');
	if (erros.length) throw new Error(`Bootstrap recusado:\n  - ${erros.join('\n  - ')}`);
	return dados;
}

/**
 * Cria a empresa e o admin. Recusa se já existe qualquer empresa: o bootstrap é
 * para banco vazio, e rodar duas vezes não pode criar um segundo tenant por engano.
 */
export async function bootstrapEmpresa(prisma: PrismaClient, dados: DadosBootstrap) {
	const senhaHash = await bcrypt.hash(dados.adminSenha, 10);
	return prisma.$transaction(async (tx) => {
		const existentes = await tx.empresa.count();
		if (existentes > 0) {
			throw new Error(`Bootstrap recusado: o banco já tem ${existentes} empresa(s).`);
		}
		const empresa = await tx.empresa.create({
			data: {
				nome: dados.empresaNome,
				cnpj: dados.empresaCnpj,
				horaAbertura: dados.horaAbertura,
				horaFechamento: dados.horaFechamento
			}
		});
		const admin = await tx.usuario.create({
			data: {
				empresaId: empresa.id,
				nome: dados.adminNome,
				email: dados.adminEmail,
				cpf: dados.adminCpf,
				senhaHash,
				role: 'admin'
			}
		});
		return { empresa, admin };
	});
}
