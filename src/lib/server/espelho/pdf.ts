/**
 * @module lib/server/espelho/pdf
 * @description Desenha o Espelho de Ponto Eletrônico (art. 84 da Portaria
 * 671/2021) em PDF A4 com pdf-lib — JS puro, sem navegador headless (o
 * Puppeteer do comprovante depende do Chrome instalado no servidor).
 *
 * Devolve o `PDFDocument` ainda aberto para o chamador poder incluir o
 * placeholder da assinatura PAdES antes de salvar (ver `gerar.ts`).
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { toDH } from '@/lib/server/afd/format';
import { PTRP_NOME, PTRP_VERSAO } from '@/lib/server/afd/config';
import type { DiaEspelho, Espelho } from './montar';

const A4: [number, number] = [595.28, 841.89];
const MARGEM = 36;
const LARGURA = A4[0] - 2 * MARGEM;
const RODAPE = 28;

const CINZA_TEXTO = rgb(0.35, 0.35, 0.35);
const CINZA_LINHA = rgb(0.8, 0.8, 0.8);
const CINZA_FUNDO = rgb(0.95, 0.95, 0.95);
const VERMELHO = rgb(0.72, 0.1, 0.1);
const PRETO = rgb(0, 0, 0);

// ── Formatação ───────────────────────────────────────────────────────────────

/**
 * Deixa o texto desenhável com as fontes padrão (WinAnsi): pontuação
 * tipográfica vira ASCII e o que sobrar fora do Latin-1 vira "?".
 */
function seguro(s: string): string {
	return s
		.replace(/[\u2013\u2014]/g, '-')
		.replace(/[\u2018\u2019]/g, "'")
		.replace(/[\u201C\u201D]/g, '"')
		.replace(/\u2026/g, '...')
		.replace(/[^\u0020-\u007E\u00A0-\u00FF]/g, '?');
}

function dataBr(dia: string): string {
	const [a, m, d] = dia.split('-');
	return `${d}/${m}/${a}`;
}

/** "dd/mm/aaaa hh:mm" em Brasília. */
function dataHoraBr(instante: Date): string {
	const dh = toDH(instante); // AAAA-MM-ddThh:mm:00-0300
	return `${dataBr(dh.slice(0, 10))} ${dh.slice(11, 16)}`;
}

function hora(instante: Date): string {
	return toDH(instante).slice(11, 16);
}

/** Minutos → "h:mm" ("" quando zero, para a tabela ficar limpa). */
function hm(min: number, zero = ''): string {
	if (min === 0) return zero;
	return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`;
}

function cpfBr(cpf: string): string {
	const d = cpf.replace(/\D/g, '').padStart(11, '0');
	return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function inscricaoBr(v: string | null): string {
	const d = (v ?? '').replace(/\D/g, '');
	if (d.length === 14)
		return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
	if (d.length === 11) return cpfBr(d);
	return d || '-';
}

function marcacaoTexto(m: DiaEspelho['marcacoes'][number]): string {
	if (m.desconsiderada) return `${hora(m.marcadoEm)}(D)`;
	if (m.fonte === 'I') return `${hora(m.marcadoEm)}(I)`;
	return hora(m.marcadoEm);
}

// ── Escritor com paginação ───────────────────────────────────────────────────

interface Coluna {
	titulo: string;
	largura: number;
	alinhar?: 'esq' | 'dir';
}

class Escritor {
	readonly doc: PDFDocument;
	private readonly normal: PDFFont;
	private readonly negrito: PDFFont;
	page!: PDFPage;
	y = 0;
	/** Cabeçalho de tabela a repetir ao quebrar página (null fora de tabela). */
	private colunas: Coluna[] | null = null;

	constructor(doc: PDFDocument, normal: PDFFont, negrito: PDFFont) {
		this.doc = doc;
		this.normal = normal;
		this.negrito = negrito;
		this.novaPagina();
	}

	novaPagina(): void {
		this.page = this.doc.addPage(A4);
		this.y = A4[1] - MARGEM;
		if (this.colunas) this.cabecalhoTabela(this.colunas);
	}

	/** Garante `altura` livre acima do rodapé; senão, quebra a página. */
	garantir(altura: number): void {
		if (this.y - altura < MARGEM + RODAPE) this.novaPagina();
	}

	largura(texto: string, tamanho: number, negrito = false): number {
		return (negrito ? this.negrito : this.normal).widthOfTextAtSize(seguro(texto), tamanho);
	}

	texto(
		texto: string,
		x: number,
		y: number,
		tamanho: number,
		opcoes: { negrito?: boolean; cor?: ReturnType<typeof rgb> } = {}
	): void {
		this.page.drawText(seguro(texto), {
			x,
			y,
			size: tamanho,
			font: opcoes.negrito ? this.negrito : this.normal,
			color: opcoes.cor ?? PRETO
		});
	}

	/** Quebra `texto` em linhas que caibam em `largura`. */
	quebrar(texto: string, largura: number, tamanho: number, negrito = false): string[] {
		const linhas: string[] = [];
		let atual = '';
		for (const palavra of seguro(texto).split(/\s+/).filter(Boolean)) {
			const tentativa = atual ? `${atual} ${palavra}` : palavra;
			if (this.largura(tentativa, tamanho, negrito) <= largura || !atual) atual = tentativa;
			else {
				linhas.push(atual);
				atual = palavra;
			}
		}
		if (atual) linhas.push(atual);
		return linhas.length ? linhas : [''];
	}

	linhaHorizontal(y: number, cor = CINZA_LINHA): void {
		this.page.drawLine({
			start: { x: MARGEM, y },
			end: { x: MARGEM + LARGURA, y },
			thickness: 0.5,
			color: cor
		});
	}

	iniciarTabela(colunas: Coluna[]): void {
		this.colunas = colunas;
		this.garantir(40);
		this.cabecalhoTabela(colunas);
	}

	encerrarTabela(): void {
		this.colunas = null;
	}

	private cabecalhoTabela(colunas: Coluna[]): void {
		const altura = 13;
		this.page.drawRectangle({
			x: MARGEM,
			y: this.y - altura,
			width: LARGURA,
			height: altura,
			color: CINZA_FUNDO
		});
		let x = MARGEM;
		for (const c of colunas) {
			const tx = c.alinhar === 'dir' ? x + c.largura - 3 - this.largura(c.titulo, 7, true) : x + 3;
			this.texto(c.titulo, tx, this.y - 9.5, 7, { negrito: true });
			x += c.largura;
		}
		this.y -= altura;
	}

	/** Uma linha de tabela; células com várias linhas crescem a altura da linha. */
	linhaTabela(
		celulas: string[],
		opcoes: { negrito?: boolean; fundo?: boolean; cores?: (ReturnType<typeof rgb> | null)[] } = {}
	): void {
		const colunas = this.colunas!;
		const tamanho = 7.5;
		const quebradas = celulas.map((c, i) =>
			this.quebrar(c, colunas[i].largura - 6, tamanho, opcoes.negrito)
		);
		const altura = Math.max(...quebradas.map((l) => l.length)) * 9 + 3;
		this.garantir(altura);

		if (opcoes.fundo) {
			this.page.drawRectangle({
				x: MARGEM,
				y: this.y - altura,
				width: LARGURA,
				height: altura,
				color: CINZA_FUNDO
			});
		}
		let x = MARGEM;
		quebradas.forEach((linhas, i) => {
			const c = colunas[i];
			linhas.forEach((l, j) => {
				const tx =
					c.alinhar === 'dir'
						? x + c.largura - 3 - this.largura(l, tamanho, opcoes.negrito)
						: x + 3;
				this.texto(l, tx, this.y - 8.5 - j * 9, tamanho, {
					negrito: opcoes.negrito,
					cor: opcoes.cores?.[i] ?? PRETO
				});
			});
			x += c.largura;
		});
		this.y -= altura;
		this.linhaHorizontal(this.y);
	}
}

// ── Documento ────────────────────────────────────────────────────────────────

const COLUNAS_DIAS: Coluna[] = [
	{ titulo: 'Data', largura: 42 },
	{ titulo: 'Dia', largura: 22 },
	{ titulo: 'Hor.', largura: 22 },
	{ titulo: 'Marcações', largura: 178 },
	{ titulo: 'Realizado', largura: 42, alinhar: 'dir' },
	{ titulo: 'Noturno', largura: 38, alinhar: 'dir' },
	{ titulo: 'Extras', largura: 36, alinhar: 'dir' },
	{ titulo: 'Déficit', largura: 38, alinhar: 'dir' },
	{ titulo: 'Ocorrência', largura: LARGURA - 418 }
];

const COLUNAS_TRATAMENTO: Coluna[] = [
	{ titulo: 'Data', largura: 50 },
	{ titulo: 'Hora', largura: 34 },
	{ titulo: 'Tratamento', largura: 70 },
	{ titulo: 'Motivo', largura: LARGURA - 154 }
];

export async function desenharEspelhoPdf(esp: Espelho): Promise<PDFDocument> {
	const doc = await PDFDocument.create();
	const normal = await doc.embedFont(StandardFonts.Helvetica);
	const negrito = await doc.embedFont(StandardFonts.HelveticaBold);
	const w = new Escritor(doc, normal, negrito);

	const periodo = `${dataBr(esp.inicio)} a ${dataBr(esp.fim)}`;
	doc.setTitle(seguro(`Espelho de Ponto - ${esp.trabalhador.nome} - ${periodo}`));
	doc.setAuthor(seguro(esp.empresa.razaoSocial));
	doc.setSubject('Espelho de Ponto Eletrônico (Portaria MTP 671/2021, art. 84)');
	doc.setCreator(seguro(`${PTRP_NOME} ${PTRP_VERSAO}`));
	doc.setProducer(seguro(PTRP_NOME));
	doc.setCreationDate(esp.emitidoEm);

	// ── Título, período e emissão (art. 84, III) ──
	w.texto('Espelho de Ponto Eletrônico', MARGEM, w.y - 14, 14, { negrito: true });
	const direita = [`Período: ${periodo}`, `Emitido em: ${dataHoraBr(esp.emitidoEm)}`];
	direita.forEach((l, i) =>
		w.texto(l, MARGEM + LARGURA - w.largura(l, 8), w.y - 8 - i * 10, 8, { cor: CINZA_TEXTO })
	);
	w.y -= 30;
	w.linhaHorizontal(w.y, PRETO);
	w.y -= 6;

	// ── Empregador (I) e trabalhador (II) ──
	const blocos: [string, [string, string][]][] = [
		[
			'Empregador',
			[
				['Razão social', esp.empresa.razaoSocial],
				['CNPJ/CPF', inscricaoBr(esp.empresa.cnpj)],
				['CAEPF/CNO', esp.empresa.caepfCno ? inscricaoBr(esp.empresa.caepfCno) : '-']
			]
		],
		[
			'Trabalhador',
			[
				['Nome', esp.trabalhador.nome],
				['CPF', cpfBr(esp.trabalhador.cpf)],
				[
					'Admissão',
					esp.trabalhador.admissao
						? dataBr(esp.trabalhador.admissao.toISOString().slice(0, 10))
						: '-'
				],
				['Cargo', esp.trabalhador.cargo || '-']
			]
		]
	];
	const topo = w.y;
	blocos.forEach(([titulo, campos], b) => {
		const x = MARGEM + b * (LARGURA / 2);
		let y = topo - 10;
		w.texto(titulo, x, y, 8.5, { negrito: true });
		for (const [rotulo, valor] of campos) {
			y -= 11;
			w.texto(`${rotulo}:`, x, y, 7.5, { cor: CINZA_TEXTO });
			const linhas = w.quebrar(valor, LARGURA / 2 - 70, 7.5);
			w.texto(linhas[0], x + 58, y, 7.5);
		}
	});
	w.y = topo - 10 - 11 * 4 - 8;

	// ── Horário e jornada contratual (IV) ──
	w.texto('Horário contratual', MARGEM, w.y - 8, 8.5, { negrito: true });
	w.y -= 10;
	const horarios = esp.semJornada
		? ['Sem jornada cadastrada: extras, déficit e faltas não são apurados.']
		: esp.horarios.map(
				(h) =>
					`${h.codigo}: ${h.pares.map(([e, s]) => `${e}-${s}`).join(' / ')}  (${hm(h.minutos, '0:00')} por dia)`
			);
	for (const l of horarios) {
		w.y -= 10;
		w.texto(l, MARGEM + 4, w.y, 7.5);
	}
	w.y -= 10;

	// ── Marcações e duração por dia (V, VI) ──
	w.iniciarTabela(COLUNAS_DIAS);
	for (const d of esp.dias) {
		const cor = d.falta ? VERMELHO : null;
		w.linhaTabela(
			[
				dataBr(d.dia).slice(0, 5),
				d.semana,
				d.horario ?? '',
				d.marcacoes.map(marcacaoTexto).join('  '),
				hm(d.realizadoMin),
				hm(d.noturnoMin),
				hm(d.extraMin),
				hm(d.deficitMin),
				d.ocorrencia
			],
			{
				fundo: d.semana === 'Sáb' || d.semana === 'Dom',
				cores: [cor, cor, null, null, null, null, null, cor, cor]
			}
		);
	}
	w.linhaTabela(
		[
			'Totais',
			'',
			'',
			`${esp.totais.diasTrabalhados} dia(s) trabalhado(s), ${esp.totais.faltas} falta(s)`,
			hm(esp.totais.realizadoMin, '0:00'),
			hm(esp.totais.noturnoMin, '0:00'),
			hm(esp.totais.extraMin, '0:00'),
			hm(esp.totais.deficitMin, '0:00'),
			''
		],
		{ negrito: true, fundo: true }
	);
	w.encerrarTabela();

	// ── Tratamentos (marcações incluídas / desconsideradas) ──
	if (esp.tratamentos.length > 0) {
		w.y -= 8;
		w.garantir(40);
		w.texto('Tratamentos do empregador', MARGEM, w.y - 8, 8.5, { negrito: true });
		w.y -= 14;
		w.iniciarTabela(COLUNAS_TRATAMENTO);
		for (const t of esp.tratamentos) {
			w.linhaTabela([
				dataBr(toDH(t.marcadoEm).slice(0, 10)),
				hora(t.marcadoEm),
				t.tipo,
				t.motivo || '-'
			]);
		}
		w.encerrarTabela();
	}

	// ── Legenda ──
	const legenda = [
		'(I) marcação incluída pelo empregador no tratamento. (D) marcação desconsiderada: a original continua registrada no AFD.',
		'Realizado considera a hora noturna reduzida (22h às 5h: 52min30s = 1 hora). Noturno = tempo de relógio trabalhado entre 22h e 5h.',
		'Falta = dia com expediente, sem marcação válida e sem ausência aprovada. Hor. = código do horário contratual do dia.'
	].flatMap((l) => w.quebrar(l, LARGURA, 6.5));
	w.y -= 6;
	w.garantir(legenda.length * 8 + 4);
	for (const l of legenda) {
		w.y -= 8;
		w.texto(l, MARGEM, w.y, 6.5, { cor: CINZA_TEXTO });
	}

	// ── Assinaturas ──
	w.garantir(60);
	w.y -= 44;
	const larguraAss = LARGURA / 2 - 30;
	[
		['Empregador', MARGEM],
		['Trabalhador', MARGEM + LARGURA / 2 + 30]
	].forEach(([rotulo, x]) => {
		w.page.drawLine({
			start: { x: x as number, y: w.y },
			end: { x: (x as number) + larguraAss, y: w.y },
			thickness: 0.5,
			color: PRETO
		});
		w.texto(rotulo as string, x as number, w.y - 9, 7.5, { cor: CINZA_TEXTO });
	});

	// ── Rodapé em todas as páginas ──
	const paginas = doc.getPages();
	const rodape = `${PTRP_NOME} - Espelho de Ponto Eletrônico (Portaria MTP 671/2021, art. 84) - ${esp.trabalhador.nome}`;
	paginas.forEach((p, i) => {
		const numero = `Página ${i + 1} de ${paginas.length}`;
		const tamanho = 6.5;
		p.drawText(seguro(rodape), {
			x: MARGEM,
			y: MARGEM - 10,
			size: tamanho,
			font: normal,
			color: CINZA_TEXTO
		});
		p.drawText(numero, {
			x: MARGEM + LARGURA - normal.widthOfTextAtSize(numero, tamanho),
			y: MARGEM - 10,
			size: tamanho,
			font: normal,
			color: CINZA_TEXTO
		});
	});

	return doc;
}
