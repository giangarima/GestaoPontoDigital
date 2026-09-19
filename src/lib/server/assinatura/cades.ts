/**
 * @module lib/server/assinatura/cades
 * @description Assinatura digital destacada (detached) no padrão CAdES-BES
 * (CMS/PKCS#7 SignedData, RFC 5652 + ETSI TS 101 733) — o formato do `.p7s` que
 * acompanha o AFD e o AEJ na Portaria 671/2021.
 *
 * Montada à mão com o `asn1` do node-forge porque o PKCS#7 do forge não aceita
 * o atributo `signingCertificateV2` (obrigatório no CAdES-BES: amarra a
 * assinatura ao certificado do signatário). A assinatura RSA em si é feita
 * pelo `crypto` do Node. PURO: sem Prisma nem alias `@/`.
 *
 * Atributos assinados: contentType, signingTime, messageDigest (SHA-256 do
 * arquivo) e signingCertificateV2 (SHA-256 do certificado). O conteúdo NÃO vai
 * dentro do `.p7s` (detached) — o verificador recebe o arquivo original à parte.
 */
import { createHash, sign } from 'node:crypto';
import forge from 'node-forge';

const { asn1 } = forge;
type Asn1 = forge.asn1.Asn1;

const OID = {
	signedData: '1.2.840.113549.1.7.2',
	data: '1.2.840.113549.1.7.1',
	sha256: '2.16.840.1.101.3.4.2.1',
	sha256WithRSA: '1.2.840.113549.1.1.11',
	contentType: '1.2.840.113549.1.9.3',
	messageDigest: '1.2.840.113549.1.9.4',
	signingTime: '1.2.840.113549.1.9.5',
	signingCertificateV2: '1.2.840.113549.1.9.16.2.47'
} as const;

/** Chave privada + certificado do signatário (e, opcionalmente, a cadeia). */
export interface Credencial {
	chavePrivadaPem: string;
	/** Certificado do signatário em DER. */
	certificadoDer: Buffer;
	/** Certificados da cadeia (AC intermediária/raiz) em DER, se houver. */
	cadeiaDer?: Buffer[];
}

const U = asn1.Class.UNIVERSAL;
const T = asn1.Type;

const seq = (v: Asn1[]) => asn1.create(U, T.SEQUENCE, true, v);
const set = (v: Asn1[]) => asn1.create(U, T.SET, true, v);
const oid = (o: string) => asn1.create(U, T.OID, false, asn1.oidToDer(o).getBytes());
const int = (n: number) => asn1.create(U, T.INTEGER, false, asn1.integerToDer(n).getBytes());
const octets = (b: Buffer) => asn1.create(U, T.OCTETSTRING, false, b.toString('binary'));
const nulo = () => asn1.create(U, T.NULL, false, '');
const ctx = (tag: number, v: Asn1[]) => asn1.create(asn1.Class.CONTEXT_SPECIFIC, tag, true, v);

const der = (node: Asn1): Buffer => Buffer.from(asn1.toDer(node).getBytes(), 'binary');
const fromDer = (b: Buffer): Asn1 => asn1.fromDer(b.toString('binary'));
const sha256 = (b: Buffer | Uint8Array): Buffer => createHash('sha256').update(b).digest();

/** Attribute ::= SEQUENCE { attrType OID, attrValues SET OF AttributeValue } */
function atributo(tipo: string, valor: Asn1): Asn1 {
	return seq([oid(tipo), set([valor])]);
}

/** Issuer (Name) e serialNumber do certificado, reaproveitando os bytes originais. */
function issuerESerial(certDer: Buffer): { issuer: Asn1; serial: Asn1 } {
	const tbs = (fromDer(certDer).value as Asn1[])[0].value as Asn1[];
	// tbsCertificate começa com [0] version quando o certificado é v2/v3.
	const temVersao = tbs[0].tagClass === asn1.Class.CONTEXT_SPECIFIC && tbs[0].type === 0;
	const i = temVersao ? 1 : 0;
	return { serial: tbs[i], issuer: tbs[i + 2] };
}

/**
 * SigningCertificateV2 ::= SEQUENCE { certs SEQUENCE OF ESSCertIDv2 }
 * ESSCertIDv2 ::= SEQUENCE { certHash OCTET STRING, issuerSerial IssuerSerial }
 * (hashAlgorithm omitido = SHA-256, o default). IssuerSerial usa GeneralNames
 * com o issuer como directoryName [4].
 */
function signingCertificateV2(certDer: Buffer): Asn1 {
	const { issuer, serial } = issuerESerial(certDer);
	const issuerSerial = seq([seq([ctx(4, [issuer])]), serial]);
	return seq([seq([seq([octets(sha256(certDer)), issuerSerial])])]);
}

/**
 * Assina `conteudo` e devolve o `.p7s` (DER). `assinadoEm` vai no atributo
 * signingTime (parâmetro para os testes; em produção, agora).
 */
export function assinarCades(
	conteudo: Uint8Array,
	credencial: Credencial,
	assinadoEm: Date = new Date()
): Buffer {
	const { certificadoDer, chavePrivadaPem } = credencial;

	// Os atributos assinados formam um SET OF: em DER, ordenados pelos bytes
	// codificados. A assinatura é sobre o SET (tag 0x31); no SignerInfo o mesmo
	// conteúdo vai como [0] IMPLICIT.
	const atributos = [
		atributo(OID.contentType, oid(OID.data)),
		atributo(OID.signingTime, asn1.create(U, T.UTCTIME, false, asn1.dateToUtcTime(assinadoEm))),
		atributo(OID.messageDigest, octets(sha256(conteudo))),
		atributo(OID.signingCertificateV2, signingCertificateV2(certificadoDer))
	].sort((a, b) => Buffer.compare(der(a), der(b)));

	const assinatura = sign('sha256', der(set(atributos)), chavePrivadaPem);

	const { issuer, serial } = issuerESerial(certificadoDer);
	const signerInfo = seq([
		int(1),
		seq([issuer, serial]), // IssuerAndSerialNumber
		seq([oid(OID.sha256)]),
		ctx(0, atributos),
		seq([oid(OID.sha256WithRSA), nulo()]),
		octets(assinatura)
	]);

	const certificados = [certificadoDer, ...(credencial.cadeiaDer ?? [])].map(fromDer);
	const signedData = seq([
		int(1),
		set([seq([oid(OID.sha256)])]),
		seq([oid(OID.data)]), // encapContentInfo sem eContent: assinatura destacada
		ctx(0, certificados),
		set([signerInfo])
	]);

	return der(seq([oid(OID.signedData), ctx(0, [signedData])]));
}
