/**
 * @module prisma/seed
 * @description Popula o banco de desenvolvimento.
 *
 * Uma empresa, com histórico de ponto derivado de um AFDT/ACJEF real e
 * anonimizado — ver `seed-importada.ts` para a proveniência e o que foi
 * descartado no caminho.
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/lib/server/prisma-client/client';
import bcrypt from 'bcryptjs';
import process from 'process';
import { seedEmpresaImportada } from './seed-importada';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

/**
 * Tabelas com o trigger de somente inserção do diário do REP (migration
 * `diario_somente_insercao`). O seed é o único que apaga: desliga os triggers só
 * durante a limpeza (`DISABLE TRIGGER USER` exige ser o dono da tabela, como o
 * usuário das migrations) e religa mesmo se a limpeza falhar.
 */
const TABELAS_DO_DIARIO = [
	'registros',
	'eventos_empregador',
	'eventos_empregado',
	'eventos_sensiveis',
	'registro_anulacoes',
	'registro_anulacoes_revertidas',
	'empresas'
];

async function travasDoDiario(acao: 'ENABLE' | 'DISABLE') {
	for (const tabela of TABELAS_DO_DIARIO) {
		await prisma.$executeRawUnsafe(`ALTER TABLE "${tabela}" ${acao} TRIGGER USER`);
	}
}

/** Limpa o banco respeitando as FKs (o que referencia sai antes do referenciado). */
async function limpar() {
	await travasDoDiario('DISABLE');
	try {
		await apagarTudo();
	} finally {
		await travasDoDiario('ENABLE');
	}
}

async function apagarTudo() {
	await prisma.ausencia.deleteMany();
	await prisma.eventoEmpregado.deleteMany();
	await prisma.eventoSensivel.deleteMany();
	await prisma.eventoEmpregador.deleteMany();
	await prisma.registroAnulacaoRevertida.deleteMany();
	await prisma.registroAnulacao.deleteMany();
	// Comprovante referencia a marcação com onDelete: Restrict — sai antes dela.
	await prisma.comprovante.deleteMany();
	await prisma.registro.deleteMany();
	await prisma.colaborador.deleteMany();
	await prisma.usuario.deleteMany();
	await prisma.jornadaVersao.deleteMany();
	await prisma.jornada.deleteMany();
	await prisma.departamento.deleteMany();
	await prisma.empresa.deleteMany();
}

async function main() {
	// O seed começa apagando tudo: na produção isso seria perda total de dados.
	// Banco novo de produção usa `npm run db:bootstrap`.
	if (process.env.APP_ENV === 'production') {
		throw new Error(
			'Seed recusado: APP_ENV=production. Para criar a primeira empresa use `npm run db:bootstrap`.'
		);
	}
	await limpar();

	const senhaHash = await bcrypt.hash('Senha123', 10);
	const r = await seedEmpresaImportada(prisma, senhaHash);

	console.log(
		`✓ Seed concluído — Empresa 1: ${r.colaboradores} colaboradores ` +
			`(${r.desligados} desligados), ${r.departamentos} departamentos,\n` +
			`  ${r.jornadas} jornadas, ` +
			`${r.originais} batidas, ${r.inclusoes} inclusões, ${r.anulacoes} anulações, ` +
			`${r.ausencias} ausências (NSR 1..${r.ultimoNsr}).`
	);
	if (r.extensao.dias > 0) {
		console.log(
			`  ${r.extensao.dias} dias reamostrados dos reais de ${r.extensao.de} a ${r.extensao.ate}` +
				` (prisma/seed-extensao.ts).`
		);
	}
	console.log(`  Admin: admin@empresa1.com`);
	if (r.rh) console.log(`  Caso RH (admin + bate ponto): ${r.rh}`);
	console.log(`  Senha padrão para todos: Senha123`);
}

main()
	.catch((e) => {
		console.error(e);
		process.exit(1);
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
