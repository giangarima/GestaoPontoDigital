/**
 * @module lib/server/hora-legal
 * @description Mede a diferença entre o relógio do servidor (o REP-P) e a Hora
 * Legal Brasileira via SNTP (RFC 4330), consultando os servidores do NTP.br
 * (NIC.br, sincronizados com o Observatório Nacional).
 *
 * O parse do pacote é puro (testável); `consultarNtp` faz a ida e volta UDP.
 */
import dgram from 'node:dgram';

/** Segundos entre a época NTP (1900-01-01) e a época Unix (1970-01-01). */
const NTP_EPOCA_UNIX_S = 2_208_988_800;
const TAMANHO_PACOTE = 48;

/** Servidores estrato 1 do NTP.br; sobrescreva com `HORA_LEGAL_SERVIDORES` (vírgulas). */
export const SERVIDORES_PADRAO = ['a.st1.ntp.br', 'b.st1.ntp.br', 'c.st1.ntp.br', 'd.st1.ntp.br'];

export interface MedicaoNtp {
	servidor: string;
	/** Hora legal − relógio do servidor (ms). Positivo = servidor atrasado. */
	offsetMs: number;
	/** Atraso de ida e volta na rede (ms). */
	atrasoMs: number;
	estrato: number;
}

// ── Pacote SNTP (puro) ───────────────────────────────────────────────────────

function escreverTimestamp(buf: Buffer, pos: number, ms: number): void {
	const segundos = Math.floor(ms / 1000) + NTP_EPOCA_UNIX_S;
	const fracao = Math.round(((ms % 1000) / 1000) * 2 ** 32);
	buf.writeUInt32BE(segundos >>> 0, pos);
	buf.writeUInt32BE(Math.min(fracao, 2 ** 32 - 1), pos + 4);
}

function lerTimestamp(buf: Buffer, pos: number): number {
	const segundos = buf.readUInt32BE(pos) - NTP_EPOCA_UNIX_S;
	const fracao = buf.readUInt32BE(pos + 4) / 2 ** 32;
	return (segundos + fracao) * 1000;
}

/**
 * Pedido de cliente: LI=0, versão 4, modo 3. O instante de envio vai no campo
 * transmit; o servidor o devolve em originate (defesa contra resposta forjada).
 */
export function montarPedidoSntp(enviadoEmMs: number): Buffer {
	const buf = Buffer.alloc(TAMANHO_PACOTE);
	buf[0] = (0 << 6) | (4 << 3) | 3;
	escreverTimestamp(buf, 40, enviadoEmMs);
	return buf;
}

/**
 * Valida a resposta e calcula offset e atraso (RFC 4330, seção 5):
 * offset = ((t2 − t1) + (t3 − t4)) / 2; atraso = (t4 − t1) − (t3 − t2).
 */
export function lerRespostaSntp(
	resp: Buffer,
	pedido: Buffer,
	recebidoEmMs: number
): Omit<MedicaoNtp, 'servidor'> {
	if (resp.length < TAMANHO_PACOTE) throw new Error('resposta NTP curta');
	const li = resp[0] >> 6;
	const modo = resp[0] & 0b111;
	const estrato = resp[1];
	if (modo !== 4) throw new Error(`modo NTP inesperado (${modo})`);
	if (li === 3) throw new Error('servidor NTP não sincronizado (LI=3)');
	if (estrato === 0 || estrato > 15) throw new Error(`estrato inválido (${estrato})`);
	if (!resp.subarray(24, 32).equals(pedido.subarray(40, 48))) {
		throw new Error('resposta NTP não corresponde ao pedido');
	}

	const t1 = lerTimestamp(pedido, 40);
	const t2 = lerTimestamp(resp, 32);
	const t3 = lerTimestamp(resp, 40);
	const t4 = recebidoEmMs;
	return {
		offsetMs: Math.round((t2 - t1 + (t3 - t4)) / 2),
		atrasoMs: Math.round(t4 - t1 - (t3 - t2)),
		estrato
	};
}

// ── Rede ─────────────────────────────────────────────────────────────────────

/** Uma consulta SNTP a `servidor` (UDP). Rejeita em timeout ou resposta inválida. */
export function consultarNtp(
	servidor: string,
	opcoes: { porta?: number; timeoutMs?: number } = {}
): Promise<MedicaoNtp> {
	const { porta = 123, timeoutMs = 2000 } = opcoes;
	return new Promise((resolve, reject) => {
		const socket = dgram.createSocket('udp4');
		let terminado = false;
		const fim = (erro: Error | null, medicao?: MedicaoNtp) => {
			if (terminado) return;
			terminado = true;
			clearTimeout(timer);
			socket.close();
			if (erro) reject(erro);
			else resolve(medicao!);
		};
		const timer = setTimeout(
			() => fim(new Error(`sem resposta em ${timeoutMs} ms (UDP ${porta} bloqueada?)`)),
			timeoutMs
		);

		const pedido = montarPedidoSntp(Date.now());
		socket.on('error', (e) => fim(e));
		socket.on('message', (msg) => {
			try {
				fim(null, { servidor, ...lerRespostaSntp(msg, pedido, Date.now()) });
			} catch (e) {
				fim(e as Error);
			}
		});
		socket.send(pedido, porta, servidor, (e) => e && fim(e));
	});
}

export interface DiagnosticoHoraLegal {
	consultadoEm: string;
	/** null quando nenhum servidor respondeu (UDP 123 bloqueada ou servidores fora). */
	medicao: MedicaoNtp | null;
	falhas: { servidor: string; erro: string }[];
}

function servidoresConfigurados(): string[] {
	const env = process.env.HORA_LEGAL_SERVIDORES;
	return env
		? env
				.split(',')
				.map((s) => s.trim())
				.filter(Boolean)
		: SERVIDORES_PADRAO;
}

/** Tenta os servidores em ordem e usa a primeira resposta válida. */
export async function medirHoraLegal(
	servidores: string[] = servidoresConfigurados(),
	opcoes: { porta?: number; timeoutMs?: number } = {}
): Promise<DiagnosticoHoraLegal> {
	const falhas: DiagnosticoHoraLegal['falhas'] = [];
	for (const servidor of servidores) {
		try {
			const medicao = await consultarNtp(servidor, opcoes);
			return { consultadoEm: new Date().toISOString(), medicao, falhas };
		} catch (e) {
			falhas.push({ servidor, erro: e instanceof Error ? e.message : String(e) });
		}
	}
	return { consultadoEm: new Date().toISOString(), medicao: null, falhas };
}
