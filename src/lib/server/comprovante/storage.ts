import fs from 'fs';
import path from 'path';

const BASE =
	process.env.COMPROVANTE_STORAGE_PATH || path.resolve(process.cwd(), 'storage', 'comprovantes');

export interface StoredComprovante {
	caminhoRelativo: string;
	caminhoAbsoluto: string;
}

export async function salvarComprovantePdf(
	empresaId: string,
	nsrFormatado: string,
	pdfBuffer: Buffer
): Promise<StoredComprovante> {
	const now = new Date();
	const year = String(now.getFullYear());
	const month = String(now.getMonth() + 1).padStart(2, '0');
	const dir = path.join(BASE, empresaId, year, month);
	fs.mkdirSync(dir, { recursive: true });
	const filename = `comprovante-ponto-${nsrFormatado}.pdf`;
	const full = path.join(dir, filename);
	fs.writeFileSync(full, pdfBuffer);
	const rel = path.relative(process.cwd(), full);
	return { caminhoRelativo: rel.replace(/\\/g, '/'), caminhoAbsoluto: full };
}

export async function lerComprovantePdf(caminhoRelativo: string): Promise<Buffer> {
	const abs = path.resolve(process.cwd(), caminhoRelativo);
	return fs.readFileSync(abs);
}

export default { salvarComprovantePdf, lerComprovantePdf };
