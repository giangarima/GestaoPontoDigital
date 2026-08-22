/**
 * @module lib/server/mailer
 * @description Envio de e-mails transacionais via SMTP (Nodemailer).
 *
 * Configuração por variáveis de ambiente `SMTP_*`. Se `SMTP_HOST` não estiver
 * definido, o envio cai em um fallback de desenvolvimento que apenas registra o
 * conteúdo no console — permitindo testar o fluxo completo sem conta externa.
 */

import 'dotenv/config';
import nodemailer, { type Transporter } from 'nodemailer';
import type { ComprovanteData } from '@/lib/server/comprovante/types';

let transporter: Transporter | null = null;

// As variáveis SMTP são lidas em tempo de execução (não no load do módulo) para
// não capturarem `undefined` caso este módulo seja avaliado antes do `.env`
// ser carregado no `process.env`.
function getTransporter(): Transporter | null {
	const host = process.env.SMTP_HOST;
	if (!host) return null;
	if (!transporter) {
		const port = Number(process.env.SMTP_PORT ?? 587);
		const user = process.env.SMTP_USER;
		transporter = nodemailer.createTransport({
			host,
			port,
			secure: port === 465,
			auth: user ? { user, pass: process.env.SMTP_PASS } : undefined
		});
	}
	return transporter;
}

/**
 * Envia o e-mail de recuperação de senha com o link de redefinição.
 * Em dev (sem SMTP configurado), loga o link no console em vez de enviar.
 */
export async function sendPasswordResetEmail(
	to: string,
	nome: string,
	resetUrl: string
): Promise<void> {
	const t = getTransporter();

	if (!t) {
		console.log(
			`\n[mailer:dev] Recuperação de senha para ${to} (${nome}).\n[mailer:dev] Link: ${resetUrl}\n`
		);
		return;
	}

	const html = `
		<div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #111827;">
			<h2 style="margin-bottom: 0.5rem;">Redefinição de senha</h2>
			<p>Olá, ${nome}.</p>
			<p>Recebemos um pedido para redefinir a senha da sua conta no <strong>Ponto Digital</strong>.
			Clique no botão abaixo para criar uma nova senha. Este link expira em 1 hora.</p>
			<p style="margin: 1.5rem 0;">
				<a href="${resetUrl}"
					style="background:#2563eb;color:#fff;text-decoration:none;padding:0.75rem 1.25rem;border-radius:8px;display:inline-block;">
					Criar nova senha
				</a>
			</p>
			<p style="font-size: 0.8rem; color: #6b7280;">
				Se você não solicitou esta alteração, ignore este e-mail — sua senha atual continua válida.
			</p>
			<p style="font-size: 0.75rem; color: #9ca3af; word-break: break-all;">${resetUrl}</p>
		</div>
	`;

	await t.sendMail({
		from: process.env.SMTP_FROM ?? 'Ponto Digital <no-reply@pontodigital.app>',
		to,
		subject: 'Redefinição de senha — Ponto Digital',
		html
	});
}

/**
 * Envia o e-mail de boas-vindas a um colaborador recém-cadastrado, com o link
 * para ele definir a própria senha. Em dev (sem SMTP), loga o link no console.
 */
export async function sendWelcomeEmail(
	to: string,
	nome: string,
	criarSenhaUrl: string
): Promise<void> {
	const t = getTransporter();

	if (!t) {
		console.log(
			`\n[mailer:dev] Boas-vindas para ${to} (${nome}).\n[mailer:dev] Link: ${criarSenhaUrl}\n`
		);
		return;
	}

	const html = `
		<div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #111827;">
			<h2 style="margin-bottom: 0.5rem;">Bem-vindo(a) ao Ponto Digital</h2>
			<p>Olá, ${nome}.</p>
			<p>Sua conta de colaborador foi criada. Para começar a registrar seu ponto,
			clique no botão abaixo e defina sua senha de acesso. Este link expira em 3 dias.</p>
			<p style="margin: 1.5rem 0;">
				<a href="${criarSenhaUrl}"
					style="background:#2563eb;color:#fff;text-decoration:none;padding:0.75rem 1.25rem;border-radius:8px;display:inline-block;">
					Criar minha senha
				</a>
			</p>
			<p style="font-size: 0.8rem; color: #6b7280;">
				Você fará login usando seu CPF e a senha que definir.
			</p>
			<p style="font-size: 0.75rem; color: #9ca3af; word-break: break-all;">${criarSenhaUrl}</p>
		</div>
	`;

	await t.sendMail({
		from: process.env.SMTP_FROM ?? 'Ponto Digital <no-reply@pontodigital.app>',
		to,
		subject: 'Bem-vindo ao Ponto Digital — crie sua senha',
		html
	});
}

/**
 * Envia o comprovante de ponto em anexo (PDF).
 * Se SMTP não estiver configurado, apenas loga o evento (dev).
 */
export async function sendComprovanteEmail(input: {
	to: string;
	data: ComprovanteData;
	pdfBuffer: Buffer;
}) {
	const { to, data, pdfBuffer } = input;
	const t = getTransporter();

	const subject = `Comprovante de Ponto — ${data.tipoLabel} — ${data.hora.slice(0, 5)} | ${data.data}`;
	const filename = data.nomeArquivo ?? `comprovante-ponto-${data.nsrFormatado}.pdf`;

	if (!t) {
		console.log(
			`\n[mailer:dev] Envio de comprovante para ${to} (${data.colaboradorNome}).\n[mailer:dev] Assunto: ${subject}\n[mailer:dev] Anexo: ${filename}\n`
		);
		return;
	}

	await t.sendMail({
		from: process.env.SMTP_FROM ?? 'Ponto Digital <no-reply@pontodigital.app>',
		to,
		subject,
		html: data.emailHtml ?? undefined,
		text: data.emailText ?? undefined,
		attachments: [
			{
				filename,
				content: pdfBuffer,
				contentType: 'application/pdf'
			}
		]
	});
}
