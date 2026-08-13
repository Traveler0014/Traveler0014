// 本地一次性加密工具（不提交运行，只在你自己机器上跑一次）。
// 用法：node scripts/encrypt.mjs "<口令>"
// 读取 scripts/sky.template.js（明文，gitignored），用 scrypt(口令)→AES-256-GCM 加密，
// 输出 scripts/sky.enc（密文，提交）。口令不会写入任何文件。
import { readFileSync, writeFileSync } from 'node:fs';
import { scryptSync, randomBytes, createCipheriv } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const passphrase = process.argv[2];

if (!passphrase) {
  console.error('用法: node scripts/encrypt.mjs "<口令>"');
  process.exit(1);
}

const KDF = { name: 'scrypt', N: 16384, r: 8, p: 1 };

const plaintext = readFileSync(join(__dirname, 'sky.template.js'), 'utf8');
const salt = randomBytes(16);
const iv = randomBytes(12);
const key = scryptSync(passphrase, salt, 32, KDF);
const cipher = createCipheriv('aes-256-gcm', key, iv);
const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
const tag = cipher.getAuthTag();

const envelope = {
  algorithm: 'aes-256-gcm',
  kdf: KDF,
  salt: salt.toString('base64'),
  iv: iv.toString('base64'),
  tag: tag.toString('base64'),
  data: data.toString('base64'),
};

writeFileSync(join(__dirname, 'sky.enc'), JSON.stringify(envelope, null, 2) + '\n');
console.log('已生成 scripts/sky.enc（口令未写入任何文件）。');
