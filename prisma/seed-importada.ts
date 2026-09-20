/**
 * @module prisma/seed-importada
 * @description A empresa do seed, com marcações derivadas de um AFDT/ACJEF
 * (Portaria 1510/2009) de uma empresa real — a única fonte de dados de ponto com
 * a textura da operação de verdade que um gerador sintético não reproduz.
 *
 * ## Proveniência e anonimização
 *
 * Os arquivos-fonte NÃO estão no repositório e não são necessários: o que sobrou
 * deles é `seed-data/marcacoes.json`, já anonimizado de forma irreversível.
 * No caminho da importação foram descartados, sem nunca chegar ao banco:
 *
 * - o **PIS** de cada trabalhador (único identificador pessoal dos dois arquivos),
 *   substituído por um colaborador sintético — nome de lista fictícia e CPF com
 *   dígito verificador válido, derivados por hash com sal;
 * - o **cabeçalho do empregador** (CNPJ e razão social), trocado por uma empresa
 *   fictícia.
 *
 * O que permanece são os horários: é neles que está o valor, e eles não
 * identificam ninguém isoladamente. Os CPFs são sintéticos e não correspondem
 * a pessoas.
 *
 * ## Por que vale a pena
 *
 * Seis meses, 21 trabalhadores, 6.760 marcações, com o que a operação real produz
 * e o seed sintético não tem: 181 dias em aberto (esquecimento de batida),
 * inclusões do empregador com motivo ("Esqueceu de bater o ponto", "Ajuste
 * relógio", "Trabalho externo"), marcações desconsideradas ("Marcação no mesmo
 * minuto", "REGISTRO DUPLICADO"), dias com três e quatro pares E/S, jornada de
 * sábado em meio período e atrasos de poucos minutos na faixa da tolerância do
 * art. 58, §1º.
 *
 * Serviu de conferência do nosso cálculo: apurando as mesmas marcações que o
 * sistema de origem apurou, 1.728 de 1.733 dias fecharam **ao minuto** (99,7%).
 * Das 5 divergências, 4 vinham de uma cascata de rótulos E/S do sistema deles
 * (um dia ímpar invertia a fase e emendava a saída de um dia com a entrada do
 * outro, gerando 16h de "extra") e 1 de uma tolerância que absorvia 31 min num
 * dia — além do limite do art. 58, §1º lido com a Súmula 366 do TST.
 *
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { PrismaClient } from '../src/lib/server/prisma-client/client';
import { hashRegistro } from '../src/lib/server/registro-hash';

/** Rótulos de `Registro.tipo`, referenciados por índice no arquivo de dados. */
const TIPOS = ['entrada', 'saida_almoco', 'retorno_almoco', 'saida'] as const;

/**
 * Uma marcação. `h` é a hora local de Brasília e `t` o índice em `TIPOS`.
 * Sem `f`, é original do REP (fonte "O"); com `f: 'I'`, é inclusão do empregador
 * no tratamento e `mi` traz o motivo. `an` presente = marcação desconsiderada,
 * com o motivo da anulação.
 */
interface MarcacaoJson {
	h: string;
	t: number;
	f?: 'I';
	mi?: string | null;
	an?: string;
}

/** Marcações de um colaborador (`c`, índice) num dia (`d`, AAAA-MM-DD). */
interface DiaJson {
	c: number;
	d: string;
	m: MarcacaoJson[];
}

interface DadosJson {
	jornadas: { nome: string; dias: unknown }[];
	/**
	 * Departamento e jornada são independentes no schema: a Loja reúne os dois
	 * turnos da operação (abertura 08:30–17:20 e fechamento 10:00–19:00), que é
	 * o caso que dá sentido a `PATCH /api/departamentos/:id/jornada` — aplicar
	 * uma jornada a um departamento que tem mais de uma.
	 */
	departamentos: string[];
	colaboradores: {
		nome: string;
		cpf: string;
		email: string;
		cargo: string | null;
		admissao: string;
		jornada: number | null;
		/** Índice em `departamentos`. */
		departamento: number;
		/** Caso RH: gerencia (role="admin") **e** bate ponto. Ver seedEmpresaImportada. */
		admin?: boolean;
	}[];
	dias: DiaJson[];
	ausencias: { c: number; inicio: string; fim: string; tipo: string; motivo: string }[];
}

export interface ResumoImportada {
	colaboradores: number;
	departamentos: number;
	/** E-mail do colaborador que também é admin (caso RH), se houver. */
	rh: string | null;
	jornadas: number;
	originais: number;
	inclusoes: number;
	anulacoes: number;
	ausencias: number;
	ultimoNsr: bigint;
}

/**
 * Cadeia unificada de NSR da empresa (tipo 2 empregador, tipo 5 empregado, tipo 7
 * batida) com o hash-chain das batidas. Como num REP de verdade, o NSR segue a
 * ORDEM DE GRAVAÇÃO e o hash de cada batida aponta para o da batida anterior.
 */
function makeLedger() {
	let nsr = 0n;
	let ultimoHashBatida: string | null = null;
	return {
		/** Aloca o próximo NSR (eventos tipo 2/5 ficam fora do hash-chain). */
		nextNsr(): bigint {
			nsr += 1n;
			return nsr;
		},
		/** Aloca NSR e encadeia o hash de uma batida (tipo 7). */
		eloBatida(b: { cpf: string; marcadoEm: Date; registradoEm: Date }) {
			nsr += 1n;
			const hashAnterior = ultimoHashBatida;
			const hash = hashRegistro({ nsr, ...b }, hashAnterior);
			ultimoHashBatida = hash;
			return { nsr, hash, hashAnterior };
		},
		get total(): bigint {
			return nsr;
		}
	};
}

function instanteBrt(dia: string, hora: string): Date {
	return new Date(`${dia}T${hora}:00.000-03:00`);
}

/** Data pura (meia-noite UTC), como o resto do sistema grava vigência e ausência. */
function dataPura(dia: string): Date {
	return new Date(`${dia}T00:00:00.000Z`);
}

/** Semeia a empresa e todo o seu histórico de ponto. */
export async function seedEmpresaImportada(
	prisma: PrismaClient,
	senhaHash: string
): Promise<ResumoImportada> {
	const ledger = makeLedger();
	const caminho = fileURLToPath(new URL('./seed-data/marcacoes.json', import.meta.url));
	const dados = JSON.parse(readFileSync(caminho, 'utf-8')) as DadosJson;

	const empresa = await prisma.empresa.create({
		data: {
			nome: 'Empresa 1',
			cnpj: '11222333000181',
			razaoSocial: 'EMPRESA 1 COMERCIO LTDA',
			localPrestacao: 'Matriz',
			horaAbertura: '08:00',
			horaFechamento: '19:00'
		}
	});

	const admin = await prisma.usuario.create({
		data: {
			empresaId: empresa.id,
			nome: 'Administrador',
			email: 'admin@empresa1.com',
			cpf: '11122233396',
			senhaHash,
			role: 'admin'
		}
	});

	// Jornadas. A vigência começa bem antes do período para cobrir todos os dias.
	const vigenciaInicio = dataPura('2020-01-01');
	const jornadaIds: string[] = [];
	for (const j of dados.jornadas) {
		const criada = await prisma.jornada.create({
			data: {
				empresaId: empresa.id,
				nome: j.nome,
				versoes: { create: { dias: j.dias as object, vigenciaInicio } }
			}
		});
		jornadaIds.push(criada.id);
	}

	const departamentoIds: string[] = [];
	for (const nome of dados.departamentos) {
		const d = await prisma.departamento.create({ data: { empresaId: empresa.id, nome } });
		departamentoIds.push(d.id);
	}

	const colaboradorIds: string[] = [];
	const cpfs: string[] = [];
	for (const c of dados.colaboradores) {
		// `role` marca só o acesso de gestão; quem bate ponto é quem tem a extensão
		// `Colaborador`. Um colaborador com `admin: true` tem os dois — é o caso do
		// RH que gerencia e também registra a própria jornada, e é o que exercita a
		// proteção de rotas (`/admin/*` exige role, `/colaborador/*` exige vínculo).
		const usuario = await prisma.usuario.create({
			data: {
				empresaId: empresa.id,
				nome: c.nome,
				email: c.email,
				cpf: c.cpf,
				senhaHash,
				role: c.admin ? 'admin' : 'colaborador'
			}
		});
		const colaborador = await prisma.colaborador.create({
			data: {
				usuarioId: usuario.id,
				empresaId: empresa.id,
				cargo: c.cargo,
				departamentoId: departamentoIds[c.departamento],
				status: 'ativo',
				dataAdmissao: dataPura(c.admissao),
				jornadaId: c.jornada === null ? undefined : jornadaIds[c.jornada]
			}
		});
		colaboradorIds.push(colaborador.id);
		cpfs.push(c.cpf);
	}

	// Como num REP real, o NSR segue a ordem de gravação: empregador, empregados
	// na implantação e só então as batidas, em ordem cronológica.
	await prisma.eventoEmpregador.create({
		data: {
			empresaId: empresa.id,
			nsr: ledger.nextNsr(),
			cpfResponsavel: admin.cpf,
			inscricaoTipo: '1',
			inscricao: empresa.cnpj!,
			razaoSocial: empresa.razaoSocial!,
			localPrestacao: empresa.localPrestacao
		}
	});
	for (let i = 0; i < colaboradorIds.length; i++) {
		await prisma.eventoEmpregado.create({
			data: {
				empresaId: empresa.id,
				nsr: ledger.nextNsr(),
				operacao: 'I',
				cpfEmpregado: cpfs[i],
				nomeEmpregado: dados.colaboradores[i].nome,
				cpfResponsavel: admin.cpf,
				colaboradorId: colaboradorIds[i]
			}
		});
	}

	// Achata os dias em marcações com instante absoluto, para ordenar a empresa
	// inteira cronologicamente antes de encadear os NSRs.
	const planas = dados.dias.flatMap((dia) =>
		dia.m.map((m) => ({
			colaboradorId: colaboradorIds[dia.c],
			cpf: cpfs[dia.c],
			marcadoEm: instanteBrt(dia.d, m.h),
			tipo: TIPOS[m.t] ?? 'entrada',
			fonte: m.f ?? 'O',
			motivoInclusao: m.mi ?? null,
			motivoAnulacao: m.an ?? null
		}))
	);
	planas.sort((a, b) => a.marcadoEm.getTime() - b.marcadoEm.getTime());

	const originais = planas.filter((p) => p.fonte === 'O');
	await prisma.registro.createMany({
		data: originais.map((p) => ({
			colaboradorId: p.colaboradorId,
			empresaId: empresa.id,
			cpf: p.cpf,
			tipo: p.tipo,
			metodo: 'manual',
			// Marcação on-line: gravada no instante da batida.
			marcadoEm: p.marcadoEm,
			registradoEm: p.marcadoEm,
			fonte: 'O',
			...ledger.eloBatida({ cpf: p.cpf, marcadoEm: p.marcadoEm, registradoEm: p.marcadoEm })
		}))
	});

	// Inclusões do empregador: sem NSR e sem hash, fora do AFD (só no AEJ).
	const inclusoes = planas.filter((p) => p.fonte === 'I');
	await prisma.registro.createMany({
		data: inclusoes.map((p) => ({
			colaboradorId: p.colaboradorId,
			empresaId: empresa.id,
			cpf: p.cpf,
			tipo: p.tipo,
			metodo: 'manual',
			marcadoEm: p.marcadoEm,
			registradoEm: p.marcadoEm,
			fonte: 'I',
			criadoPor: admin.id,
			criadoMotivo: p.motivoInclusao ?? 'Inclusão no tratamento'
		}))
	});

	// Desconsiderações: a marcação continua no AFD; a anulação a tira da apuração.
	// O motivo mais comum é justamente "Marcação no mesmo minuto", então existem
	// duas batidas com colaborador e instante idênticos e só uma é desconsiderada.
	// Por isso a chave não identifica um registro: cada uma consome um id da fila.
	const anuladas = planas.filter((p) => p.motivoAnulacao !== null);
	const candidatos = await prisma.registro.findMany({
		where: {
			empresaId: empresa.id,
			fonte: 'O',
			marcadoEm: { in: anuladas.map((p) => p.marcadoEm) }
		},
		select: { id: true, colaboradorId: true, marcadoEm: true },
		orderBy: { id: 'asc' }
	});
	const filaPorChave = new Map<string, string[]>();
	for (const r of candidatos) {
		const k = `${r.colaboradorId}|${r.marcadoEm.getTime()}`;
		filaPorChave.set(k, [...(filaPorChave.get(k) ?? []), r.id]);
	}
	let totalAnulacoes = 0;
	for (const p of anuladas) {
		const registroId = filaPorChave.get(`${p.colaboradorId}|${p.marcadoEm.getTime()}`)?.shift();
		if (!registroId) continue;
		await prisma.registroAnulacao.create({
			data: {
				registroId,
				empresaId: empresa.id,
				motivo: p.motivoAnulacao!,
				anuladoPor: admin.id,
				anuladoEm: p.marcadoEm
			}
		});
		totalAnulacoes++;
	}

	for (const a of dados.ausencias) {
		await prisma.ausencia.create({
			data: {
				colaboradorId: colaboradorIds[a.c],
				empresaId: empresa.id,
				tipo: a.tipo,
				dataInicio: dataPura(a.inicio),
				dataFim: dataPura(a.fim),
				motivo: a.motivo,
				status: 'aprovada',
				revisadoPor: admin.id,
				revisadoEm: dataPura(a.inicio)
			}
		});
	}

	await prisma.empresa.update({
		where: { id: empresa.id },
		data: { ultimoNsr: ledger.total }
	});

	return {
		colaboradores: colaboradorIds.length,
		departamentos: departamentoIds.length,
		rh: dados.colaboradores.find((c) => c.admin)?.email ?? null,
		jornadas: jornadaIds.length,
		originais: originais.length,
		inclusoes: inclusoes.length,
		anulacoes: totalAnulacoes,
		ausencias: dados.ausencias.length,
		ultimoNsr: ledger.total
	};
}
