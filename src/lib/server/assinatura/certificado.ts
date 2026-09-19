/**
 * @module lib/server/assinatura/certificado
 * @description Carrega a credencial de assinatura do REP (arquivo `.p12`/PFX) —
 * a mesma usada no comprovante de marcação (`COMPROVANTE_CERT_PATH` /
 * `COMPROVANTE_CERT_PASS`). Em produção deve ser um certificado ICP-Brasil do
 * empregador; em dev, o autoassinado de `npm run generate:cert`.
 *
 * Retorna `null` (sem lançar) quando a assinatura está desligada
 * (`COMPROVANTE_SKIP_SIGN=true`) ou o arquivo não existe, para o chamador
 * decidir o fallback. Lido uma vez e mantido em cache.
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

export function carregarCredencial(): Credencial | null {
	if (cache !== undefined) return cache;

	const caminho =
		process.env.COMPROVANTE_CERT_PATH || path.resolve(process.cwd(), 'certs', 'rep-dev.p12');
	if (process.env.COMPROVANTE_SKIP_SIGN === 'true' || !existsSync(caminho)) {
		cache = null;
		return cache;
	}

	cache = lerP12(readFileSync(caminho), process.env.COMPROVANTE_CERT_PASS ?? '');
	return cache;
}
