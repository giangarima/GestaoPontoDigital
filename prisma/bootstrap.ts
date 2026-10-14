/**
 * @module prisma/bootstrap
 * @description Cria a primeira empresa e o primeiro admin num banco de produção vazio.
 *
 * Uso (na VPS):
 *   docker compose exec \
 *     -e EMPRESA_NOME="Minha Loja" -e EMPRESA_CNPJ=... \
 *     -e ADMIN_NOME="Fulana" -e ADMIN_EMAIL=... -e ADMIN_CPF=... -e ADMIN_SENHA=... \
 *     app npm run db:bootstrap
 *
 * Opcionais: HORA_ABERTURA / HORA_FECHAMENTO (padrão 08:00 / 18:00). Recusa se
 * o banco já tem empresa. Regras em `src/lib/server/bootstrap.ts`.
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/lib/server/prisma-client/client';
import process from 'process';
import { bootstrapEmpresa, lerDadosBootstrap } from '../src/lib/server/bootstrap';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
	const dados = lerDadosBootstrap(process.env);
	const { empresa, admin } = await bootstrapEmpresa(prisma, dados);
	console.log(`✓ Empresa "${empresa.nome}" criada.`);
	console.log(`  Admin: ${admin.email} — entre na aplicação e cadastre departamentos,`);
	console.log(`  jornadas e colaboradores pela interface.`);
}

main()
	.catch((e) => {
		console.error(e instanceof Error ? e.message : e);
		process.exit(1);
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
