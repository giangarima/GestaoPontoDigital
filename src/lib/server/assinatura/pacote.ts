/**
 * @module lib/server/assinatura/pacote
 * @description Empacota um arquivo legal (AFD, AEJ) com a sua assinatura
 * destacada: um `.zip` com `<nome>.txt` + `<nome>.p7s` (mesmo nome-base, como
 * pede a Portaria 671/2021). Sem credencial configurada, devolve só o `.txt`
 * e sinaliza `assinado: false` para o endpoint avisar.
 */
import { zipSync } from 'fflate';
import { assinarCades, type Credencial } from './cades';

export interface Pacote {
	corpo: Uint8Array;
	nome: string;
	contentType: string;
	assinado: boolean;
}

export function empacotarAssinado(
	nomeTxt: string,
	conteudo: Uint8Array,
	credencial: Credencial | null
): Pacote {
	if (!credencial) {
		return {
			corpo: conteudo,
			nome: nomeTxt,
			contentType: 'text/plain; charset=iso-8859-1',
			assinado: false
		};
	}

	const base = nomeTxt.replace(/\.txt$/i, '');
	const p7s = assinarCades(conteudo, credencial);
	return {
		corpo: zipSync({ [nomeTxt]: conteudo, [`${base}.p7s`]: new Uint8Array(p7s) }),
		nome: `${base}.zip`,
		contentType: 'application/zip',
		assinado: true
	};
}

/** Response de download do pacote (header `X-Assinatura` indica se foi assinado). */
export function respostaDownload(pacote: Pacote): Response {
	// Cast: Uint8Array é um corpo válido em runtime; o tipo BodyInit do lib atual
	// não aceita Uint8Array<ArrayBufferLike> (fricção conhecida do TS).
	return new Response(pacote.corpo as unknown as BodyInit, {
		status: 200,
		headers: {
			'Content-Type': pacote.contentType,
			'Content-Disposition': `attachment; filename="${pacote.nome}"`,
			'X-Assinatura': pacote.assinado ? 'cades' : 'ausente'
		}
	});
}
