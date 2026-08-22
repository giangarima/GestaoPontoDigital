#!/usr/bin/env node
import { generateKeyPairSync } from 'crypto';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import forge from 'node-forge';
import path from 'path';

const certsDir = path.resolve(process.cwd(), 'certs');
const keyPath = path.join(certsDir, 'rep-dev.key');
const crtPath = path.join(certsDir, 'rep-dev.crt');
const p12Path = path.join(certsDir, 'rep-dev.p12');
const pass = 'dev123';

if (!existsSync(certsDir)) mkdirSync(certsDir, { recursive: true });

try {
  console.log('Gerando certificado autoassinado via Node...');

  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' }
  });

  const pki = forge.pki;
  const cert = pki.createCertificate();
  cert.publicKey = pki.publicKeyFromPem(publicKey);
  cert.serialNumber = String(Date.now());

  const now = new Date();
  cert.validity.notBefore = new Date(now.getTime() - 60_000);
  cert.validity.notAfter = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);

  const attrs = [
    { name: 'commonName', value: 'GestaoPontoDigital REP Dev' },
    { name: 'countryName', value: 'BR' },
    { shortName: 'ST', value: 'SP' },
    { name: 'localityName', value: 'Sao Paulo' },
    { name: 'organizationName', value: 'GestaoPontoDigital' },
    { shortName: 'OU', value: 'Dev' }
  ];

  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.setExtensions([
    { name: 'basicConstraints', cA: false },
    { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
    { name: 'extKeyUsage', clientAuth: true, emailProtection: true },
    { name: 'subjectKeyIdentifier' }
  ]);

  const forgePrivateKey = pki.privateKeyFromPem(privateKey);
  cert.sign(forgePrivateKey, forge.md.sha256.create());

  const certificatePem = pki.certificateToPem(cert);
  writeFileSync(keyPath, privateKey);
  writeFileSync(crtPath, certificatePem);

  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(forgePrivateKey, [cert], pass, {
    algorithm: '3des',
    friendlyName: 'REP Dev'
  });
  const p12Der = forge.asn1.toDer(p12Asn1).getBytes();
  writeFileSync(p12Path, Buffer.from(p12Der, 'binary'));

  console.log(`Gerado ${p12Path} (senha: ${pass})`);
} catch (e) {
  console.error('Falha ao gerar certificado dev:', e);
  process.exit(1);
}
