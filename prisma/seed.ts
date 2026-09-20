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

/** Limpa o banco respeitando as FKs (o que referencia sai antes do referenciado). */
async function limpar() {
	await prisma.ausencia.deleteMany();
	await prisma.eventoEmpregado.deleteMany();
	await prisma.eventoSensivel.deleteMany();
	await prisma.eventoEmpregador.deleteMany();
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
