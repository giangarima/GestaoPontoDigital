/**
 * Assinatura CAdES destacada, verificada por um validador INDEPENDENTE (o
 * `openssl cms`), não pelo próprio código que assina.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { unzipSync } from 'fflate';
import forge from 'node-forge';
import { beforeAll, describe, expect, it } from 'vitest';
import { assinarCades, type Credencial } from './cades';
import { lerP12 } from './certificado';
import { empacotarAssinado } from './pacote';

const temOpenssl = spawnSync('openssl', ['version']).status === 0;

/** Certificado autoassinado de teste (mesmo perfil do `npm run generate:cert`). */
function gerarCertificado(nome = 'REP Teste') {
	const { privateKey, publicKey } = generateKeyPairSync('rsa', {
		modulusLength: 2048,
		privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
		publicKeyEncoding: { type: 'spki', format: 'pem' }
	});
	const { pki } = forge;
	const cert = pki.createCertificate();
	cert.publicKey = pki.publicKeyFromPem(publicKey);
	cert.serialNumber = '0a1b2c3d';
	cert.validity.notBefore = new Date(Date.now() - 60_000);
	cert.validity.notAfter = new Date(Date.now() + 86_400_000);
	const attrs = [
		{ name: 'commonName', value: nome },
		{ name: 'countryName', value: 'BR' }
	];
	cert.setSubject(attrs);
	cert.setIssuer(attrs);
	cert.setExtensions([
		{ name: 'basicConstraints', cA: false },
		{ name: 'keyUsage', digitalSignature: true, nonRepudiation: true }
	]);
	const chave = pki.privateKeyFromPem(privateKey);
	cert.sign(chave, forge.md.sha256.create());

	const credencial: Credencial = {
		chavePrivadaPem: privateKey,
		certificadoDer: Buffer.from(forge.asn1.toDer(pki.certificateToAsn1(cert)).getBytes(), 'binary')
	};
	return { credencial, cert, chave, certPem: pki.certificateToPem(cert) };
}

// AFD de mentira: latin1 com acento e CRLF — a assinatura é sobre os bytes exatos.
const CONTEUDO = new Uint8Array(
	Buffer.from('0000000011José da Conceição\r\n999999999000000001\r\n', 'latin1')
);

let dir: string;
let cert: ReturnType<typeof gerarCertificado>;

beforeAll(() => {
	dir = mkdtempSync(path.join(tmpdir(), 'cades-'));
	cert = gerarCertificado();
	writeFileSync(path.join(dir, 'ca.pem'), cert.certPem);
});

/** Roda `openssl cms -verify` e devolve se passou (+ a saída para diagnóstico). */
function verificarComOpenssl(conteudo: Uint8Array, p7s: Buffer, nome = 'arq') {
	const txt = path.join(dir, `${nome}.txt`);
	const sig = path.join(dir, `${nome}.p7s`);
	writeFileSync(txt, conteudo);
	writeFileSync(sig, p7s);
	const r = spawnSync('openssl', [
		'cms', '-verify', '-binary', '-inform', 'DER',
		'-in', sig, '-content', txt,
		'-CAfile', path.join(dir, 'ca.pem'), '-purpose', 'any',
		'-out', '/dev/null'
	], { encoding: 'utf8' }); // prettier-ignore
	return { ok: r.status === 0, saida: `${r.stdout}${r.stderr}` };
}

function imprimirEstrutura(p7s: Buffer): string {
	const sig = path.join(dir, 'estrutura.p7s');
	writeFileSync(sig, p7s);
	return execFileSync('openssl', ['cms', '-cmsout', '-print', '-inform', 'DER', '-in', sig], {
		encoding: 'utf8'
	});
}

describe.skipIf(!temOpenssl)('assinarCades (verificado pelo openssl)', () => {
	it('o openssl valida a assinatura do arquivo original', () => {
		const p7s = assinarCades(CONTEUDO, cert.credencial);
		const r = verificarComOpenssl(CONTEUDO, p7s);
		expect(r.saida).toContain('Verification successful');
		expect(r.ok).toBe(true);
	});

	it('um único byte alterado no arquivo invalida a assinatura', () => {
		const p7s = assinarCades(CONTEUDO, cert.credencial);
		const adulterado = new Uint8Array(CONTEUDO);
		adulterado[15] ^= 0x01;
		const r = verificarComOpenssl(adulterado, p7s, 'adulterado');
		expect(r.ok).toBe(false);
		expect(r.saida).toMatch(/digest failure|verification failure/i);
	});

	it('não valida contra outro certificado confiável (assinante errado)', () => {
		const outro = gerarCertificado('Outro REP');
		const p7s = assinarCades(CONTEUDO, outro.credencial);
		expect(verificarComOpenssl(CONTEUDO, p7s, 'outro').ok).toBe(false);
	});

	it('é destacada e tem os atributos do CAdES-BES', () => {
		const estrutura = imprimirEstrutura(assinarCades(CONTEUDO, cert.credencial));
		expect(estrutura).toContain('eContent: <ABSENT>'); // conteúdo fora do .p7s
		expect(estrutura).toContain('contentType');
		expect(estrutura).toContain('messageDigest');
		expect(estrutura).toContain('signingTime');
		expect(estrutura).toMatch(/signingCertificateV2/);
		expect(estrutura).toContain('sha256WithRSAEncryption');
	});

	// O `openssl cms -verify` (3.0) NÃO confere o certHash do signingCertificateV2
	// — uma versão com hash corrompido passou na verificação. Por isso o teste próprio.
	it('signingCertificateV2 amarra a assinatura ao SHA-256 do certificado', () => {
		const estrutura = imprimirEstrutura(assinarCades(CONTEUDO, cert.credencial));
		const trecho = estrutura.slice(estrutura.indexOf('signingCertificateV2'));
		const certHash = createHash('sha256').update(cert.credencial.certificadoDer).digest('hex');
		expect(trecho.slice(0, 1500)).toContain(certHash.toUpperCase());
	});

	it('grava o horário de assinatura informado', () => {
		const estrutura = imprimirEstrutura(
			assinarCades(CONTEUDO, cert.credencial, new Date('2026-09-19T15:30:00Z'))
		);
		expect(estrutura).toMatch(/Sep 19 15:30:00 2026 GMT/);
	});
});

describe('lerP12', () => {
	function p12(senha: string): Buffer {
		const asn1 = forge.pkcs12.toPkcs12Asn1(cert.chave, [cert.cert], senha, { algorithm: '3des' });
		return Buffer.from(forge.asn1.toDer(asn1).getBytes(), 'binary');
	}

	it('extrai chave e certificado do signatário', () => {
		const credencial = lerP12(p12('dev123'), 'dev123');
		expect(credencial.certificadoDer.equals(cert.credencial.certificadoDer)).toBe(true);
		expect(credencial.cadeiaDer).toEqual([]);
	});

	it.skipIf(!temOpenssl)('a credencial lida do .p12 produz assinatura válida', () => {
		const credencial = lerP12(p12('dev123'), 'dev123');
		expect(verificarComOpenssl(CONTEUDO, assinarCades(CONTEUDO, credencial), 'p12').ok).toBe(true);
	});

	it('senha errada falha', () => {
		expect(() => lerP12(p12('dev123'), 'errada')).toThrow();
	});
});

describe('empacotarAssinado', () => {
	const NOME = 'AFD00000000000000000012345678000199REP_P.txt';

	it('com credencial: zip com o .txt original e o .p7s de mesmo nome-base', () => {
		const pacote = empacotarAssinado(NOME, CONTEUDO, cert.credencial);
		expect(pacote).toMatchObject({
			nome: 'AFD00000000000000000012345678000199REP_P.zip',
			contentType: 'application/zip',
			assinado: true
		});

		const arquivos = unzipSync(pacote.corpo);
		expect(Object.keys(arquivos).sort()).toEqual([
			'AFD00000000000000000012345678000199REP_P.p7s',
			NOME
		]);
		expect(Buffer.from(arquivos[NOME]).equals(Buffer.from(CONTEUDO))).toBe(true);
	});

	it.skipIf(!temOpenssl)('o .p7s de dentro do zip valida o .txt de dentro do zip', () => {
		const arquivos = unzipSync(empacotarAssinado(NOME, CONTEUDO, cert.credencial).corpo);
		const p7s = Buffer.from(arquivos[NOME.replace('.txt', '.p7s')]);
		expect(verificarComOpenssl(arquivos[NOME], p7s, 'zip').ok).toBe(true);
	});

	it('sem credencial: devolve só o .txt, marcado como não assinado', () => {
		expect(empacotarAssinado(NOME, CONTEUDO, null)).toEqual({
			corpo: CONTEUDO,
			nome: NOME,
			contentType: 'text/plain; charset=iso-8859-1',
			assinado: false
		});
	});
});
