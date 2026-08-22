import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { SignPdf } from '@signpdf/signpdf';
import { P12Signer } from '@signpdf/signer-p12';

export interface SignPdfResult {
	buffer: Buffer;
	hashSha256: string;
	assinadoEm: Date;
}

export async function signPdf(pdfBuffer: Buffer): Promise<SignPdfResult> {
	const skip = process.env.COMPROVANTE_SKIP_SIGN === 'true';
	if (skip) {
		const hash = createHash('sha256').update(pdfBuffer).digest('hex');
		return { buffer: pdfBuffer, hashSha256: hash, assinadoEm: new Date() };
	}

	const certPath =
		process.env.COMPROVANTE_CERT_PATH || path.resolve(process.cwd(), 'certs', 'rep-dev.p12');
	const certPass = process.env.COMPROVANTE_CERT_PASS ?? '';

	const p12 = fs.readFileSync(certPath);
	const signer = new P12Signer(p12, { passphrase: certPass });
	const signpdf = new SignPdf();

	const signed = await signpdf.sign(pdfBuffer, signer);
	const hash = createHash('sha256').update(signed).digest('hex');
	return { buffer: Buffer.from(signed), hashSha256: hash, assinadoEm: new Date() };
}

export default signPdf;
