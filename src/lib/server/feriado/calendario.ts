/**
 * @module lib/server/feriado/calendario
 * @description Feriados e pontos facultativos da apuração.
 *
 *  - **Tipo**: `feriado` (descanso obrigatório; trabalhar nele é "feriado
 *    trabalhado", base do pagamento em dobro ou da folga compensatória — Lei
 *    605/1949, art. 9º; Súmula 146 do TST) ou `ponto_facultativo` (não é
 *    feriado: a empresa privada escolhe dispensar ou não; quem trabalha tem um
 *    dia comum).
 *  - **Abrangência**: `nacional`, `estadual` ou `municipal`. Os nacionais são
 *    fixos em lei e calculados aqui (Lei 662/1949, Lei 6.802/1980 e Lei
 *    14.759/2023); estaduais e municipais são cadastrados pela empresa.
 *    Sexta-feira Santa e Corpus Christi são móveis — `feriadosMoveis` sugere as
 *    datas e o cadastro decide o tipo e a abrangência que valem no município.
 *  - **Escala**: a empresa pode abrir no dia, inclusive com equipe reduzida.
 *    Quem está escalado segue a própria jornada (e leva falta se não vier);
 *    para os demais o dia é sem expediente — nem falta, nem déficit, fora do
 *    previsto, e o que se trabalhar nele é extra.
 *
 * PURO (sem Prisma nem alias `@/`, para o seed também usar) — ver `carregar.ts`
 * para a carga do banco.
 */
import { dataPura, diaDaDataPura, type Dia } from '../periodo';

export type TipoFeriado = 'feriado' | 'ponto_facultativo';
export type Abrangencia = 'nacional' | 'estadual' | 'municipal';

export const TIPOS_FERIADO: readonly TipoFeriado[] = ['feriado', 'ponto_facultativo'];
export const ABRANGENCIAS: readonly Abrangencia[] = ['nacional', 'estadual', 'municipal'];

/** Dia de feriado/ponto facultativo da empresa, com a escala de quem trabalha. */
export interface FeriadoEmpresa {
	nome: string;
	tipo: TipoFeriado;
	abrangencia: Abrangencia;
	/** Colaboradores (id) escalados para trabalhar. Vazio = empresa fechada. */
	escalados: ReadonlySet<string>;
}

/** Feriados da empresa por dia. */
export type Feriados = ReadonlyMap<Dia, FeriadoEmpresa>;

/** O dia visto por um colaborador: o que entra na apuração dele. */
export interface FeriadoDoDia {
	nome: string;
	tipo: TipoFeriado;
	abrangencia: Abrangencia;
	/** Escalado para trabalhar: o dia segue a jornada contratual. */
	escalado: boolean;
}

/** Feriados de um colaborador por dia. */
export type FeriadosColaborador = ReadonlyMap<Dia, FeriadoDoDia>;

const NACIONAIS: [string, string][] = [
	['01-01', 'Confraternização Universal'],
	['04-21', 'Tiradentes'],
	['05-01', 'Dia do Trabalho'],
	['09-07', 'Independência do Brasil'],
	['10-12', 'Nossa Senhora Aparecida'],
	['11-02', 'Finados'],
	['11-15', 'Proclamação da República'],
	['11-20', 'Dia Nacional de Zumbi e da Consciência Negra'],
	['12-25', 'Natal']
];

/** Feriados nacionais do ano. 20/11 só a partir de 2024 (Lei 14.759/2023). */
export function feriadosNacionais(ano: number): Map<Dia, string> {
	const feriados = new Map<Dia, string>();
	for (const [mmdd, nome] of NACIONAIS) {
		if (mmdd === '11-20' && ano < 2024) continue;
		feriados.set(`${ano}-${mmdd}`, nome);
	}
	return feriados;
}

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher, calendário gregoriano). */
export function pascoa(ano: number): Dia {
	const a = ano % 19;
	const b = Math.floor(ano / 100);
	const c = ano % 100;
	const d = Math.floor(b / 4);
	const e = b % 4;
	const f = Math.floor((b + 8) / 25);
	const g = Math.floor((b - f + 1) / 3);
	const h = (19 * a + b - d - g + 15) % 30;
	const i = Math.floor(c / 4);
	const k = c % 4;
	const l = (32 + 2 * e + 2 * i - h - k) % 7;
	const m = Math.floor((a + 11 * h + 22 * l) / 451);
	const mes = Math.floor((h + l - 7 * m + 114) / 31);
	const dia = ((h + l - 7 * m + 114) % 31) + 1;
	return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

/** Desloca um dia em `n` dias de calendário. */
export function somarDias(dia: Dia, n: number): Dia {
	const d = dataPura(dia);
	d.setUTCDate(d.getUTCDate() + n);
	return diaDaDataPura(d);
}

export interface SugestaoFeriado {
	data: Dia;
	nome: string;
	tipo: TipoFeriado;
	abrangencia: Abrangencia;
}

/**
 * Datas móveis para sugerir no cadastro, com o enquadramento mais comum. Carnaval
 * e Corpus Christi são ponto facultativo no calendário federal (muitos municípios
 * fazem de Corpus Christi feriado); Sexta-feira Santa é feriado religioso
 * declarado pelo município (Lei 9.093/1995). A tela deixa ajustar antes de salvar.
 */
export function feriadosMoveis(ano: number): SugestaoFeriado[] {
	const domingo = pascoa(ano);
	return [
		{
			data: somarDias(domingo, -48),
			nome: 'Carnaval (segunda-feira)',
			tipo: 'ponto_facultativo',
			abrangencia: 'nacional'
		},
		{
			data: somarDias(domingo, -47),
			nome: 'Carnaval (terça-feira)',
			tipo: 'ponto_facultativo',
			abrangencia: 'nacional'
		},
		{
			data: somarDias(domingo, -2),
			nome: 'Sexta-feira Santa',
			tipo: 'feriado',
			abrangencia: 'municipal'
		},
		{
			data: somarDias(domingo, 60),
			nome: 'Corpus Christi',
			tipo: 'ponto_facultativo',
			abrangencia: 'nacional'
		}
	];
}

/** Linha da tabela `feriados` já com a escala (ver `carregar.ts`). */
export interface FeriadoCadastrado {
	data: Date;
	nome: string;
	tipo: string;
	abrangencia: string;
	escalados: string[];
}

/**
 * Nacionais do período [inicio, fim] somados aos cadastrados (puro). Uma linha
 * na data de um nacional só traz a escala: nome, tipo e abrangência vêm da lei.
 */
export function juntarFeriados(
	inicio: Dia,
	fim: Dia,
	cadastrados: FeriadoCadastrado[]
): Map<Dia, FeriadoEmpresa> {
	const feriados = new Map<Dia, FeriadoEmpresa>();
	for (let ano = Number(inicio.slice(0, 4)); ano <= Number(fim.slice(0, 4)); ano++) {
		for (const [dia, nome] of feriadosNacionais(ano)) {
			if (dia >= inicio && dia <= fim) {
				feriados.set(dia, { nome, tipo: 'feriado', abrangencia: 'nacional', escalados: new Set() });
			}
		}
	}
	for (const f of cadastrados) {
		const dia = diaDaDataPura(f.data);
		const escalados = new Set(f.escalados);
		const nacional = feriados.get(dia);
		feriados.set(
			dia,
			nacional
				? { ...nacional, escalados }
				: {
						nome: f.nome,
						tipo: f.tipo === 'ponto_facultativo' ? 'ponto_facultativo' : 'feriado',
						abrangencia: (ABRANGENCIAS as readonly string[]).includes(f.abrangencia)
							? (f.abrangencia as Abrangencia)
							: 'municipal',
						escalados
					}
		);
	}
	return feriados;
}

/** O calendário da empresa visto por um colaborador (escalado ou não em cada dia). */
export function feriadosDoColaborador(
	feriados: Feriados,
	colaboradorId: string
): Map<Dia, FeriadoDoDia> {
	const doColaborador = new Map<Dia, FeriadoDoDia>();
	for (const [dia, f] of feriados) {
		doColaborador.set(dia, {
			nome: f.nome,
			tipo: f.tipo,
			abrangencia: f.abrangencia,
			escalado: f.escalados.has(colaboradorId)
		});
	}
	return doColaborador;
}

/** Ocorrência do dia no espelho: "Feriado (X)", "Feriado trabalhado (X)"… */
export function rotuloFeriado(f: FeriadoDoDia): string {
	const base = f.tipo === 'feriado' ? 'Feriado' : 'Ponto facultativo';
	return `${base}${f.escalado ? ' trabalhado' : ''} (${f.nome})`;
}
