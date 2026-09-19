/**
 * @module lib/server/assinatura/certificado
 * @description Carrega a credencial de assinatura do REP (`.p12`/PFX) — a mesma
 * do comprovante de marcação (PDF) e do `.p7s` do AFD/AEJ. Em produção deve ser
 * um certificado ICP-Brasil (e-CNPJ A1) do empregador; em dev, o autoassinado de
 * `npm run generate:cert`.
 *
 * Origem do `.p12`, em ordem de prioridade:
 * 1. `COMPROVANTE_CERT_BASE64` — o arquivo em base64 numa variável de ambiente
 *    (hospedagens como o Render só aceitam segredos em texto);
 * 2. `COMPROVANTE_CERT_PATH` — caminho do arquivo (default `certs/rep-dev.p12`).
 * Senha em `COMPROVANTE_CERT_PASS`.
 *
 * `carregarCredencial` retorna `null` (sem lançar) quando a assinatura está
 * desligada (`COMPROVANTE_SKIP_SIGN=true`) ou não há certificado, para o
 * chamador decidir o fallback. Lido uma vez e mantido em cache.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import forge from 'node-forge';
import type { Credencial } from './cades';

let cache: Credencial | null | undefined;

function paraDer(cert: forge.pki.Certificate): Buffer {
	return Buffer.from(forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes(), 'binary');
}

/** Extrai a chave e o certificado correspondente (mais a cadeia) de um `.p12`. */
export function lerP12(p12: Buffer, senha: string): Credencial {
	const pkcs12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(p12.toString('binary')), senha);
	const { oids } = forge.pki;

	const chaves = [
		...(pkcs12.getBags({ bagType: oids.pkcs8ShroudedKeyBag })[oids.pkcs8ShroudedKeyBag] ?? []),
		...(pkcs12.getBags({ bagType: oids.keyBag })[oids.keyBag] ?? [])
	];
	const chave = chaves[0]?.key as forge.pki.rsa.PrivateKey | undefined;
	if (!chave) throw new Error('Certificado .p12 sem chave privada RSA');

	const certs = (pkcs12.getBags({ bagType: oids.certBag })[oids.certBag] ?? [])
		.map((b) => b.cert)
		.filter((c): c is forge.pki.Certificate => !!c);

	// Signatário = o certificado cuja chave pública corresponde à chave privada.
	const doSignatario = (c: forge.pki.Certificate) =>
		(c.publicKey as forge.pki.rsa.PublicKey).n?.equals(chave.n);
	const signatario = certs.find(doSignatario);
	if (!signatario) throw new Error('Certificado .p12 sem o certificado da chave privada');

	return {
		chavePrivadaPem: forge.pki.privateKeyToPem(chave),
		certificadoDer: paraDer(signatario),
		cadeiaDer: certs.filter((c) => c !== signatario).map(paraDer)
	};
}

/**
 * Bytes do `.p12` configurado (base64 na env ou arquivo), ou `null` se não houver.
 * Não olha `COMPROVANTE_SKIP_SIGN` — isso é decisão de cada chamador.
 */
export function lerCertificadoP12(env: NodeJS.ProcessEnv = process.env): Buffer | null {
	const base64 = env.COMPROVANTE_CERT_BASE64?.replace(/\s/g, '');
	if (base64) return Buffer.from(base64, 'base64');

	const caminho = env.COMPROVANTE_CERT_PATH || path.resolve(process.cwd(), 'certs', 'rep-dev.p12');
	return existsSync(caminho) ? readFileSync(caminho) : null;
}

export function carregarCredencial(): Credencial | null {
	if (cache !== undefined) return cache;

	const p12 = process.env.COMPROVANTE_SKIP_SIGN === 'true' ? null : lerCertificadoP12();
	cache = p12 ? lerP12(p12, process.env.COMPROVANTE_CERT_PASS ?? '') : null;
	return cache;
}
