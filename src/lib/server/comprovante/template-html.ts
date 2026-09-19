/**
 * @module lib/server/comprovante/template-html
 * @description Corpo do e-mail do comprovante (HTML e texto). O comprovante
 * legal é o PDF em anexo (`pdf.ts`); o e-mail só repete os dados principais.
 */
import type { ComprovanteData } from './types';

export function renderEmailHtmlComprovante(data: ComprovanteData): string {
	return `
  <div style="font-family: 'DM Sans', Arial, sans-serif; max-width:520px; margin:0 auto; color:#111827;">
    <div style="background:#2563eb;color:#fff;padding:20px 24px;border-radius:12px 12px 0 0;">
      <div style="font-size:11px;opacity:0.9;">PONTO DIGITAL</div>
      <h1 style="margin:6px 0 0;font-size:18px;">Comprovante de Registro de Ponto do Trabalhador</h1>
    </div>
    <div style="border:1px solid #e5e7eb;border-top:none;padding:24px;border-radius:0 0 12px 12px;">
      <p>Olá, <strong>${data.colaboradorNome}</strong>.</p>
      <p style="color:#374151;line-height:1.6;">Sua marcação de ponto foi registrada com sucesso. O comprovante legal em PDF está <strong>em anexo</strong> neste e-mail.</p>
      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:16px 0;">
        <div style="font-size:11px;font-weight:700;color:#6b7280;margin-bottom:8px;">EMPRESA</div>
        <div><span style="color:#6b7280;">Nome:</span> <strong>${data.empresaNome}</strong></div>
        <div><span style="color:#6b7280;">CNPJ:</span> <strong>${data.empresaCnpj ?? ''}</strong></div>
      </div>
      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:16px 0;">
        <div style="font-size:11px;font-weight:700;color:#6b7280;margin-bottom:8px;">COLABORADOR</div>
        <div><span style="color:#6b7280;">Nome:</span> <strong>${data.colaboradorNome}</strong></div>
        <div><span style="color:#6b7280;">CPF:</span> <strong>${data.colaboradorCpf}</strong></div>
      </div>
      <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:16px;margin:16px 0;">
        <div style="font-size:11px;font-weight:700;color:#1d4ed8;margin-bottom:8px;">MARCAÇÃO</div>
        <div><span style="color:#1e40af;">Tipo:</span> <strong style="color:#1d4ed8;">${data.tipoLabel}</strong></div>
        <div><span style="color:#1e40af;">Data:</span> <strong>${data.data}</strong></div>
        <div><span style="color:#1e40af;">Hora:</span> <strong>${data.hora}</strong></div>
        <div><span style="color:#1e40af;">NSR:</span> <strong style="font-family:monospace;">${data.nsrFormatado}</strong></div>
        <div style="margin-top:8px;"><span style="color:#1e40af;">Hash (SHA-256):</span><br/><span style="font-family:monospace;font-size:12px;word-break:break-all;">${data.hashMarcacao}</span></div>
        <div style="margin-top:8px;"><span style="color:#1e40af;">REP-P (registro no INPI):</span> <span style="font-family:monospace;">${data.repInpi}</span></div>
      </div>
      <div style="background:#fffbeb;border-left:4px solid #f59e0b;padding:12px 16px;font-size:14px;color:#92400e;">
        <strong>⚠️ Horário registrado pelo servidor.</strong><br/>Validade legal conforme Portaria MTP 671/2021.
      </div>
      <p style="font-size:14px;color:#6b7280;margin-top:16px;">📎 Anexo: <strong>${data.nomeArquivo}</strong></p>
      <p style="font-size:12px;color:#9ca3af;border-top:1px solid #f3f4f6;padding-top:16px;margin-top:20px;">E-mail automático. Não responda.<br/>Em caso de divergência, contate o RH da sua empresa.</p>
    </div>
  </div>
  `;
}

export function renderEmailTextComprovante(data: ComprovanteData): string {
	return `PONTO DIGITAL\nComprovante de Registro de Ponto do Trabalhador\n\nOlá, ${data.colaboradorNome}.\n\nSua marcação foi registrada com sucesso. O comprovante legal em PDF está em anexo.\n\nEMPRESA\nNome: ${data.empresaNome}\nCNPJ: ${data.empresaCnpj ?? ''}\n\nCOLABORADOR\nNome: ${data.colaboradorNome}\nCPF: ${data.colaboradorCpf}\n\nMARCAÇÃO\nTipo: ${data.tipoLabel}\nData: ${data.data}\nHora: ${data.hora}\nNSR: ${data.nsrFormatado}\nHash (SHA-256): ${data.hashMarcacao}\nREP-P (registro no INPI): ${data.repInpi}\n\nHorário registrado pelo servidor. Validade legal conforme Portaria MTP 671/2021.\n\nAnexo: ${data.nomeArquivo}`;
}

export default { renderEmailHtmlComprovante, renderEmailTextComprovante };
