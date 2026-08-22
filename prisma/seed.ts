import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/lib/server/prisma-client/client';
import { GENESIS_HASH, hashRegistro } from '../src/lib/server/registro-hash';
import bcrypt from 'bcryptjs';
import process from 'process';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// ── Jornadas ─────────────────────────────────────────────────────────────────
const jornadaComercial = {
	segunda: {
		ativo: true,
		entrada: '08:00',
		saida_almoco: '12:00',
		retorno_almoco: '13:00',
		saida: '17:00'
	},
	terca: {
		ativo: true,
		entrada: '08:00',
		saida_almoco: '12:00',
		retorno_almoco: '13:00',
		saida: '17:00'
	},
	quarta: {
		ativo: true,
		entrada: '08:00',
		saida_almoco: '12:00',
		retorno_almoco: '13:00',
		saida: '17:00'
	},
	quinta: {
		ativo: true,
		entrada: '08:00',
		saida_almoco: '12:00',
		retorno_almoco: '13:00',
		saida: '17:00'
	},
	sexta: {
		ativo: true,
		entrada: '08:00',
		saida_almoco: '12:00',
		retorno_almoco: '13:00',
		saida: '17:00'
	},
	sabado: { ativo: false, entrada: '', saida_almoco: '', retorno_almoco: '', saida: '' },
	domingo: { ativo: false, entrada: '', saida_almoco: '', retorno_almoco: '', saida: '' }
};

const jornadaMeioPeriodo = {
	segunda: {
		ativo: true,
		entrada: '08:00',
		saida_almoco: '10:00',
		retorno_almoco: '10:15',
		saida: '12:00'
	},
	terca: {
		ativo: true,
		entrada: '08:00',
		saida_almoco: '10:00',
		retorno_almoco: '10:15',
		saida: '12:00'
	},
	quarta: {
		ativo: true,
		entrada: '08:00',
		saida_almoco: '10:00',
		retorno_almoco: '10:15',
		saida: '12:00'
	},
	quinta: {
		ativo: true,
		entrada: '08:00',
		saida_almoco: '10:00',
		retorno_almoco: '10:15',
		saida: '12:00'
	},
	sexta: {
		ativo: true,
		entrada: '08:00',
		saida_almoco: '10:00',
		retorno_almoco: '10:15',
		saida: '12:00'
	},
	sabado: { ativo: false, entrada: '', saida_almoco: '', retorno_almoco: '', saida: '' },
	domingo: { ativo: false, entrada: '', saida_almoco: '', retorno_almoco: '', saida: '' }
};

type DiaConfig = typeof jornadaComercial;

// ── PRNG determinístico (LCG) ────────────────────────────────────────────────
// Garante seed reprodutível: rodar `db:seed` sempre gera os mesmos timestamps.
function makeRng(seed: number) {
	let state = seed >>> 0;
	return () => {
		state = (state * 1664525 + 1013904223) >>> 0;
		return state / 0x100000000;
	};
}

function randInt(rng: () => number, min: number, max: number): number {
	return Math.floor(rng() * (max - min + 1)) + min;
}

function chance(rng: () => number, prob: number): boolean {
	return rng() < prob;
}

// ── Helpers de data ──────────────────────────────────────────────────────────
const TZ_OFFSET = '-03:00'; // America/Sao_Paulo

function buildTimestamp(dateISO: string, timeHHMM: string, offsetMinutes = 0): Date {
	const [h, m] = timeHHMM.split(':').map(Number);
	const total = h * 60 + m + offsetMinutes;
	const hh = String(Math.floor(total / 60)).padStart(2, '0');
	const mm = String(total % 60).padStart(2, '0');
	return new Date(`${dateISO}T${hh}:${mm}:00${TZ_OFFSET}`);
}

function diaSemanaKey(date: Date): keyof DiaConfig {
	const idx = date.getUTCDay(); // 0=Dom, 1=Seg…
	return ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'][
		idx
	] as keyof DiaConfig;
}

function* iterDates(year: number, month: number): Generator<{ iso: string; dow: keyof DiaConfig }> {
	// month: 1-12
	const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
	for (let d = 1; d <= last; d++) {
		const date = new Date(Date.UTC(year, month - 1, d));
		yield {
			iso: `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
			dow: diaSemanaKey(date)
		};
	}
}

// ── Geração de pontos de um dia ──────────────────────────────────────────────
type RegistroTipo = 'entrada' | 'saida_almoco' | 'retorno_almoco' | 'saida';

interface RegistroSpec {
	tipo: RegistroTipo;
	marcadoEm: Date;
	metodo: 'manual';
}

interface DayBehavior {
	/** Probabilidade de o colaborador faltar (sem justificativa) */
	faltaProb: number;
	/** Probabilidade de chegar bem atrasado (>30min) */
	atrasoGraveProb: number;
	/** Probabilidade de esquecer alguma batida (1 batida faltando) */
	esqueceBatidaProb: number;
}

function gerarPontosDoDia(
	rng: () => number,
	dateISO: string,
	diaConfig: DiaConfig[keyof DiaConfig],
	comportamento: DayBehavior
): RegistroSpec[] {
	if (!diaConfig.ativo) return [];
	if (chance(rng, comportamento.faltaProb)) return [];

	const planejado: { tipo: RegistroTipo; horario: string }[] = [
		{ tipo: 'entrada', horario: diaConfig.entrada },
		{ tipo: 'saida_almoco', horario: diaConfig.saida_almoco },
		{ tipo: 'retorno_almoco', horario: diaConfig.retorno_almoco },
		{ tipo: 'saida', horario: diaConfig.saida }
	];

	// Atraso grave concentrado na entrada, "puxa" o dia
	const atrasoGrave = chance(rng, comportamento.atrasoGraveProb);

	const pontos: RegistroSpec[] = planejado.map((p, i) => {
		let offset: number;
		if (i === 0 && atrasoGrave) {
			offset = randInt(rng, 30, 65);
		} else if (p.tipo === 'saida') {
			// Saída tende a ser pontual ou um pouco depois (hora extra leve às vezes)
			offset = randInt(rng, -5, 15);
		} else if (p.tipo === 'saida_almoco') {
			offset = randInt(rng, -5, 10);
		} else if (p.tipo === 'retorno_almoco') {
			// Volta do almoço atrasa um pouco mais
			offset = randInt(rng, -3, 12);
		} else {
			offset = randInt(rng, -8, 10);
		}
		return {
			tipo: p.tipo,
			marcadoEm: buildTimestamp(dateISO, p.horario, offset),
			metodo: 'manual'
		};
	});

	// Eventualmente esquece uma batida (não a entrada — fica menos visível assim)
	if (chance(rng, comportamento.esqueceBatidaProb)) {
		const idxDrop = randInt(rng, 1, 3);
		pontos.splice(idxDrop, 1);
	}

	return pontos;
}

// ── Definição dos colaboradores ──────────────────────────────────────────────
interface ColaboradorSeed {
	nome: string;
	email: string;
	cpf: string;
	cargo: string;
	departamento: string;
	telefone?: string;
	dataAdmissao: string;
	status: 'ativo' | 'inativo' | 'ferias' | 'afastado';
	jornada: 'comercial' | 'meioPeriodo';
	rngSeed: number;
	comportamento: DayBehavior;
	/** Também tem acesso de gestão? (RH que gerencia E bate ponto → role='admin') */
	isAdmin?: boolean;
	/** Período de férias dentro de Jan/2026 (opcional) */
	feriasJaneiro?: { inicio: string; fim: string };
	/** Faltas justificadas (datas dentro de Jan/2026) */
	justificativas?: { data: string; motivo: string }[];
}

const colaboradoresSeed: ColaboradorSeed[] = [
	{
		nome: 'Carlos Souza',
		email: 'carlos@teste.com',
		cpf: '111.444.777-35',
		cargo: 'Desenvolvedor',
		departamento: 'Tecnologia',
		telefone: '11987654321',
		dataAdmissao: '2024-01-15',
		status: 'ativo',
		jornada: 'comercial',
		rngSeed: 101,
		comportamento: { faltaProb: 0.0, atrasoGraveProb: 0.05, esqueceBatidaProb: 0.04 }
	},
	{
		nome: 'Ana Pereira',
		email: 'ana@teste.com',
		cpf: '222.555.888-46',
		cargo: 'Analista Financeiro',
		departamento: 'Financeiro',
		telefone: '11912345678',
		dataAdmissao: '2023-06-01',
		status: 'ativo',
		jornada: 'meioPeriodo',
		rngSeed: 202,
		comportamento: { faltaProb: 0.0, atrasoGraveProb: 0.02, esqueceBatidaProb: 0.06 }
	},
	{
		nome: 'Bruno Oliveira',
		email: 'bruno@teste.com',
		cpf: '333.666.999-57',
		cargo: 'Designer',
		departamento: 'Marketing',
		telefone: '11955554444',
		dataAdmissao: '2024-03-10',
		status: 'ativo',
		jornada: 'comercial',
		rngSeed: 303,
		comportamento: { faltaProb: 0.0, atrasoGraveProb: 0.1, esqueceBatidaProb: 0.05 },
		justificativas: [{ data: '2026-01-22', motivo: 'Consulta médica' }]
	},
	{
		// Coordenadora de RH: gerencia (role='admin') E bate ponto (tem colaborador).
		nome: 'Daniela Martins',
		email: 'daniela@teste.com',
		cpf: '444.777.000-68',
		cargo: 'Coordenadora',
		departamento: 'RH',
		telefone: '11933332222',
		dataAdmissao: '2022-11-20',
		status: 'ativo',
		jornada: 'comercial',
		rngSeed: 404,
		comportamento: { faltaProb: 0.0, atrasoGraveProb: 0.03, esqueceBatidaProb: 0.02 },
		isAdmin: true
	},
	{
		nome: 'Eduardo Lima',
		email: 'eduardo@teste.com',
		cpf: '555.888.111-79',
		cargo: 'Suporte Técnico',
		departamento: 'Tecnologia',
		telefone: '11944443333',
		dataAdmissao: '2025-02-05',
		status: 'ativo',
		jornada: 'comercial',
		rngSeed: 505,
		comportamento: { faltaProb: 0.0, atrasoGraveProb: 0.07, esqueceBatidaProb: 0.08 },
		feriasJaneiro: { inicio: '2026-01-26', fim: '2026-01-30' }
	},
	{
		nome: 'Fernanda Costa',
		email: 'fernanda@teste.com',
		cpf: '666.999.222-80',
		cargo: 'Estagiária',
		departamento: 'Marketing',
		telefone: '11922221111',
		dataAdmissao: '2025-08-12',
		status: 'ativo',
		jornada: 'meioPeriodo',
		rngSeed: 606,
		comportamento: { faltaProb: 0.0, atrasoGraveProb: 0.04, esqueceBatidaProb: 0.05 },
		justificativas: [{ data: '2026-01-09', motivo: 'Atestado odontológico' }]
	}
];

// ── Ajustes/lançamentos de exemplo (admin) ───────────────────────────────────
// Demonstra a comparação do espelho: marcações do colaborador (criadoPor null,
// imutáveis) × estado com ajustes do admin. Cada ajuste anula a batida original
// e cria a corrigida vinculada (registroSubstitutoId); lançamentos manuais
// preenchem batidas que faltaram. Determinístico (usa os primeiros dias que se
// qualificam), então sobrevive a cada `db:seed`.
const TODOS_TIPOS: RegistroTipo[] = ['entrada', 'saida_almoco', 'retorno_almoco', 'saida'];
const HORARIO_PADRAO: Record<RegistroTipo, string> = {
	entrada: '08:00',
	saida_almoco: '12:00',
	retorno_almoco: '13:00',
	saida: '17:00'
};

// ── Cadeia de integridade (NSR + hash-chain) ─────────────────────────────────
// Encadeia cada batida na ordem de criação, usando o mesmo módulo puro que a
// aplicação (registro-hash.ts). NSR unitário por empresa, começando em 1. Assim
// o seed nasce com uma cadeia íntegra e verificável por `verificarCadeia`.
interface EloInput {
	colaboradorId: string;
	tipo: RegistroTipo;
	marcadoEm: Date;
	metodo: 'manual';
	criadoPor?: string | null;
	criadoMotivo?: string | null;
}

function makeEloAssigner(empresaId: string) {
	let ultimoNsr = 0n;
	let ultimoHash = GENESIS_HASH;
	return (r: EloInput): { nsr: bigint; hash: string; hashAnterior: string } => {
		const nsr = ultimoNsr + 1n;
		const hashAnterior = ultimoHash;
		const hash = hashRegistro(
			{
				empresaId,
				colaboradorId: r.colaboradorId,
				nsr,
				tipo: r.tipo,
				marcadoEm: r.marcadoEm,
				metodo: r.metodo,
				criadoPor: r.criadoPor,
				criadoMotivo: r.criadoMotivo
			},
			hashAnterior
		);
		ultimoNsr = nsr;
		ultimoHash = hash;
		return { nsr, hash, hashAnterior };
	};
}

type EloAssigner = ReturnType<typeof makeEloAssigner>;

async function seedAjustesDemo(
	empresaId: string,
	adminId: string,
	colaboradorId: string,
	elo: EloAssigner
) {
	const registros = await prisma.registro.findMany({
		where: { colaboradorId, criadoPor: null },
		orderBy: { marcadoEm: 'asc' }
	});

	const porDia = new Map<string, typeof registros>();
	for (const r of registros) {
		const dia = r.marcadoEm.toISOString().slice(0, 10);
		const lista = porDia.get(dia) ?? [];
		lista.push(r);
		porDia.set(dia, lista);
	}

	let manuais = 0;
	let ajustes = 0;

	// 1) Lançamentos manuais: até 2 dias com alguma batida faltando.
	for (const [dia, regs] of porDia) {
		if (manuais >= 2) break;
		const tipos = new Set(regs.map((r) => r.tipo));
		if (tipos.size === 0 || tipos.size === 4) continue;
		const faltando = TODOS_TIPOS.find((t) => !tipos.has(t));
		if (!faltando) continue;
		const marcadoEm = buildTimestamp(dia, HORARIO_PADRAO[faltando], 0);
		const criadoMotivo = 'Colaborador esqueceu de bater — confirmado pelo gestor.';
		const cadeia = elo({
			colaboradorId,
			tipo: faltando,
			marcadoEm,
			metodo: 'manual',
			criadoPor: adminId,
			criadoMotivo
		});
		await prisma.registro.create({
			data: {
				colaboradorId,
				empresaId,
				tipo: faltando,
				marcadoEm,
				metodo: 'manual',
				criadoPor: adminId,
				criadoMotivo,
				...cadeia
			}
		});
		manuais++;
	}

	// 2) Ajustes: até 3 dias completos, corrige um horário (anula + substitui).
	const correcoes: { tipo: RegistroTipo; horario: string; motivo: string }[] = [
		{
			tipo: 'entrada',
			horario: '07:30',
			motivo: 'Início antecipado autorizado — relógio não registrou.'
		},
		{
			tipo: 'saida',
			horario: '18:00',
			motivo: 'Hora extra autorizada não marcada pelo colaborador.'
		},
		{
			tipo: 'retorno_almoco',
			horario: '13:00',
			motivo: 'Catraca com horário adiantado no retorno do almoço.'
		}
	];
	let ci = 0;
	for (const [dia, regs] of porDia) {
		if (ci >= correcoes.length) break;
		if (new Set(regs.map((r) => r.tipo)).size !== 4) continue;
		const corr = correcoes[ci];
		const original = regs.find((r) => r.tipo === corr.tipo)!;
		const marcadoEm = buildTimestamp(dia, corr.horario, 0);
		const cadeia = elo({
			colaboradorId,
			tipo: corr.tipo,
			marcadoEm,
			metodo: 'manual',
			criadoPor: adminId,
			criadoMotivo: corr.motivo
		});
		await prisma.$transaction(async (tx) => {
			const novo = await tx.registro.create({
				data: {
					colaboradorId,
					empresaId,
					tipo: corr.tipo,
					marcadoEm,
					metodo: 'manual',
					criadoPor: adminId,
					criadoMotivo: corr.motivo,
					...cadeia
				}
			});
			await tx.registroAnulacao.create({
				data: {
					registroId: original.id,
					registroSubstitutoId: novo.id,
					empresaId,
					motivo: corr.motivo,
					anuladoPor: adminId
				}
			});
		});
		ajustes++;
		ci++;
	}

	return { ajustes, manuais };
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
	const senhaHash = await bcrypt.hash('Senha123', 10);

	await prisma.ausencia.deleteMany();
	await prisma.registroAnulacao.deleteMany();
	await prisma.registro.deleteMany();
	await prisma.colaborador.deleteMany();
	await prisma.usuario.deleteMany();
	await prisma.jornadaVersao.deleteMany();
	await prisma.jornada.deleteMany();
	await prisma.departamento.deleteMany();
	await prisma.empresa.deleteMany();

	const empresa = await prisma.empresa.create({
		data: {
			nome: 'Empresa Demo',
			cnpj: '00.000.000/0001-00',
			horaAbertura: '08:00',
			horaFechamento: '18:00'
		}
	});

	// Departamentos (cria todos os distintos a partir do seed de colaboradores)
	const nomesDepartamentos = Array.from(new Set(colaboradoresSeed.map((c) => c.departamento)));
	const departamentosMap = new Map<string, string>();
	for (const nome of nomesDepartamentos) {
		const d = await prisma.departamento.create({ data: { empresaId: empresa.id, nome } });
		departamentosMap.set(nome, d.id);
	}

	// Vigência da 1ª versão bem no passado, cobrindo todos os registros semeados.
	const vigenciaInicial = new Date('2020-01-01T00:00:00.000Z');
	const comercial = await prisma.jornada.create({
		data: {
			empresaId: empresa.id,
			nome: 'Comercial 8h',
			versoes: { create: { dias: jornadaComercial, vigenciaInicio: vigenciaInicial } }
		}
	});
	const meioPeriodo = await prisma.jornada.create({
		data: {
			empresaId: empresa.id,
			nome: 'Meio Período Manhã',
			versoes: { create: { dias: jornadaMeioPeriodo, vigenciaInicio: vigenciaInicial } }
		}
	});

	// Admin puro (sem vínculo de colaborador).
	const admin = await prisma.usuario.create({
		data: {
			empresaId: empresa.id,
			nome: 'Admin',
			email: 'admin@teste.com',
			cpf: '12345678900',
			senhaHash,
			role: 'admin'
		}
	});

	const jornadasMap = {
		comercial: { id: comercial.id, dias: jornadaComercial },
		meioPeriodo: { id: meioPeriodo.id, dias: jornadaMeioPeriodo }
	};

	let totalRegistros = 0;

	// Assinador da cadeia da empresa — compartilhado por todas as batidas (bulk +
	// ajustes/lançamentos), preservando NSR e hash-chain contínuos.
	const elo = makeEloAssigner(empresa.id);

	for (const c of colaboradoresSeed) {
		const jornada = jornadasMap[c.jornada];

		// Identidade (login) + extensão de vínculo (colaborador). Daniela (RH) tem
		// role='admin' e ainda ganha a linha de colaborador para bater ponto.
		const usuario = await prisma.usuario.create({
			data: {
				empresaId: empresa.id,
				nome: c.nome,
				email: c.email,
				cpf: c.cpf.replace(/\D/g, ''),
				senhaHash,
				role: c.isAdmin ? 'admin' : 'colaborador'
			}
		});

		const colaborador = await prisma.colaborador.create({
			data: {
				usuarioId: usuario.id,
				empresaId: empresa.id,
				cargo: c.cargo,
				departamentoId: departamentosMap.get(c.departamento)!,
				telefone: c.telefone,
				dataAdmissao: new Date(c.dataAdmissao),
				status: c.status,
				jornadaId: jornada.id
			}
		});

		if (c.feriasJaneiro) {
			await prisma.ausencia.create({
				data: {
					empresaId: empresa.id,
					colaboradorId: colaborador.id,
					tipo: 'ferias',
					dataInicio: new Date(c.feriasJaneiro.inicio),
					dataFim: new Date(c.feriasJaneiro.fim),
					motivo: 'Férias programadas',
					status: 'aprovada',
					revisadoPor: admin.id,
					revisadoEm: new Date('2025-12-15T12:00:00.000Z')
				}
			});
		}

		if (c.justificativas) {
			for (const j of c.justificativas) {
				await prisma.ausencia.create({
					data: {
						empresaId: empresa.id,
						colaboradorId: colaborador.id,
						tipo: 'atestado',
						dataInicio: new Date(j.data),
						dataFim: new Date(j.data),
						motivo: j.motivo,
						status: 'aprovada',
						revisadoPor: admin.id,
						revisadoEm: new Date(`${j.data}T12:00:00.000Z`)
					}
				});
			}
		}

		const rng = makeRng(c.rngSeed);
		const feriasSet = new Set<string>();
		if (c.feriasJaneiro) {
			const ini = new Date(c.feriasJaneiro.inicio);
			const fim = new Date(c.feriasJaneiro.fim);
			for (let d = new Date(ini); d <= fim; d.setUTCDate(d.getUTCDate() + 1)) {
				feriasSet.add(d.toISOString().slice(0, 10));
			}
		}
		const justSet = new Set((c.justificativas ?? []).map((j) => j.data));

		const registrosData: {
			colaboradorId: string;
			empresaId: string;
			tipo: RegistroTipo;
			marcadoEm: Date;
			metodo: 'manual';
			nsr: bigint;
			hash: string;
			hashAnterior: string;
		}[] = [];

		for (const { iso, dow } of iterDates(2026, 1)) {
			if (feriasSet.has(iso) || justSet.has(iso)) continue;
			const diaConfig = jornada.dias[dow];
			const pontos = gerarPontosDoDia(rng, iso, diaConfig, c.comportamento);
			for (const p of pontos) {
				const cadeia = elo({
					colaboradorId: colaborador.id,
					tipo: p.tipo,
					marcadoEm: p.marcadoEm,
					metodo: p.metodo
				});
				registrosData.push({
					colaboradorId: colaborador.id,
					empresaId: empresa.id,
					tipo: p.tipo,
					marcadoEm: p.marcadoEm,
					metodo: p.metodo,
					...cadeia
				});
			}
		}

		if (registrosData.length > 0) {
			await prisma.registro.createMany({ data: registrosData });
			totalRegistros += registrosData.length;
		}
	}

	// Ajustes/lançamentos de exemplo no Carlos, para demonstrar a comparação no espelho.
	const carlos = await prisma.colaborador.findFirst({
		where: { usuario: { email: 'carlos@teste.com' } }
	});
	const demo = carlos
		? await seedAjustesDemo(empresa.id, admin.id, carlos.id, elo)
		: { ajustes: 0, manuais: 0 };

	console.log(
		`✓ Seed concluído: 1 empresa, 2 jornadas, 1 admin, ${colaboradoresSeed.length} colaboradores, ${totalRegistros} pontos em Jan/2026.`
	);
	console.log(
		`  Exemplos de ajuste no Carlos: ${demo.ajustes} ajuste(s) + ${demo.manuais} lançamento(s) manual(is).`
	);
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
