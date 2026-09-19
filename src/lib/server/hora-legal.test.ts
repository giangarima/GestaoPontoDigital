import dgram from 'node:dgram';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { consultarNtp, lerRespostaSntp, medirHoraLegal, montarPedidoSntp } from './hora-legal';

const NTP_EPOCA_UNIX_S = 2_208_988_800;

function ts(buf: Buffer, pos: number, ms: number): void {
	buf.writeUInt32BE(Math.floor(ms / 1000) + NTP_EPOCA_UNIX_S, pos);
	buf.writeUInt32BE(Math.round(((ms % 1000) / 1000) * 2 ** 32), pos + 4);
}

/** Resposta de servidor: copia o transmit do pedido em originate; t2/t3 dados. */
function resposta(
	pedido: Buffer,
	t2: number,
	t3: number,
	extra: { modo?: number; estrato?: number; li?: number } = {}
): Buffer {
	const r = Buffer.alloc(48);
	r[0] = ((extra.li ?? 0) << 6) | (4 << 3) | (extra.modo ?? 4);
	r[1] = extra.estrato ?? 1;
	pedido.copy(r, 24, 40, 48);
	ts(r, 32, t2);
	ts(r, 40, t3);
	return r;
}

describe('montarPedidoSntp', () => {
	it('versão 4, modo cliente, instante de envio no campo transmit', () => {
		const p = montarPedidoSntp(Date.UTC(2026, 0, 5, 12, 0, 0, 250));
		expect(p).toHaveLength(48);
		expect(p[0]).toBe(0x23);
		expect(p.readUInt32BE(40)).toBe(Date.UTC(2026, 0, 5, 12) / 1000 + NTP_EPOCA_UNIX_S);
	});
});

describe('lerRespostaSntp', () => {
	const t1 = Date.UTC(2026, 0, 5, 12, 0, 0);

	it('servidor 5 s atrasado e 40 ms de rede → offset +5000, atraso 40', () => {
		const pedido = montarPedidoSntp(t1);
		// hora legal = relógio local + 5000; 20 ms para ir, 20 para voltar
		const r = resposta(pedido, t1 + 20 + 5000, t1 + 20 + 5000);
		expect(lerRespostaSntp(r, pedido, t1 + 40)).toEqual({
			offsetMs: 5000,
			atrasoMs: 40,
			estrato: 1
		});
	});

	it('servidor adiantado → offset negativo', () => {
		const pedido = montarPedidoSntp(t1);
		const r = resposta(pedido, t1 + 10 - 45_000, t1 + 12 - 45_000);
		expect(lerRespostaSntp(r, pedido, t1 + 22).offsetMs).toBe(-45_000);
	});

	it('recusa modo errado, estrato 0 (kiss-o-death), LI=3 e resposta de outro pedido', () => {
		const pedido = montarPedidoSntp(t1);
		expect(() => lerRespostaSntp(resposta(pedido, t1, t1, { modo: 3 }), pedido, t1)).toThrow(
			/modo/
		);
		expect(() => lerRespostaSntp(resposta(pedido, t1, t1, { estrato: 0 }), pedido, t1)).toThrow(
			/estrato/
		);
		expect(() => lerRespostaSntp(resposta(pedido, t1, t1, { li: 3 }), pedido, t1)).toThrow(/LI=3/);
		const outro = montarPedidoSntp(t1 + 1000);
		expect(() => lerRespostaSntp(resposta(outro, t1, t1), pedido, t1)).toThrow(/não corresponde/);
		expect(() => lerRespostaSntp(Buffer.alloc(10), pedido, t1)).toThrow(/curta/);
	});
});

describe('consultarNtp / medirHoraLegal (servidor NTP falso em localhost)', () => {
	const sockets: dgram.Socket[] = [];

	afterEach(() => {
		while (sockets.length) sockets.pop()!.close();
	});

	/** Servidor que responde com o relógio local deslocado de `deslocamentoMs`. */
	async function servidorFalso(deslocamentoMs: number): Promise<number> {
		const s = dgram.createSocket('udp4');
		sockets.push(s);
		s.on('message', (msg, rinfo) => {
			const agora = Date.now() + deslocamentoMs;
			s.send(resposta(msg, agora, agora), rinfo.port, rinfo.address);
		});
		await new Promise<void>((ok) => s.bind(0, '127.0.0.1', ok));
		return (s.address() as AddressInfo).port;
	}

	it('mede o deslocamento de um servidor 2 s adiantado', async () => {
		const porta = await servidorFalso(2000);
		const m = await consultarNtp('127.0.0.1', { porta });
		expect(m.offsetMs).toBeGreaterThan(1950);
		expect(m.offsetMs).toBeLessThan(2050);
		expect(m.estrato).toBe(1);
	});

	it('sem resposta: timeout com mensagem que aponta a porta UDP', async () => {
		const mudo = dgram.createSocket('udp4');
		sockets.push(mudo);
		await new Promise<void>((ok) => mudo.bind(0, '127.0.0.1', ok));
		const porta = (mudo.address() as AddressInfo).port;
		await expect(consultarNtp('127.0.0.1', { porta, timeoutMs: 150 })).rejects.toThrow(
			/sem resposta em 150 ms/
		);
	});

	it('diagnóstico traz a medição do primeiro servidor que responde', async () => {
		const porta = await servidorFalso(1000);
		const d = await medirHoraLegal(['127.0.0.1'], { porta });
		expect(d.falhas).toEqual([]);
		expect(d.medicao?.offsetMs).toBeGreaterThan(950);
	});

	it('nenhum servidor respondeu: medição null e a lista de falhas', async () => {
		const d = await medirHoraLegal(['127.0.0.1', '127.0.0.1'], { porta: 9, timeoutMs: 100 });
		expect(d.medicao).toBeNull();
		expect(d.falhas).toHaveLength(2);
	});
});
