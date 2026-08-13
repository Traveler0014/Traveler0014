// 解密与执行封装。也是谜题的解锁口：
//   node scripts/sky-decrypt.mjs "<口令>"   → 猜对则打印明文代码，猜错则报「口令不对」。
// 密钥 = scrypt(口令, 公开 salt)。salt/iv/tag 都在 sky.enc 里，唯一秘密是口令。
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { scryptSync, createDecipheriv, randomBytes } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function decrypt(passphrase) {
  const env = JSON.parse(readFileSync(join(__dirname, 'sky.enc'), 'utf8'));
  const key = scryptSync(passphrase, Buffer.from(env.salt, 'base64'), 32, env.kdf);
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(env.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(env.tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(env.data, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

export async function loadSkyModule(passphrase) {
  const src = decrypt(passphrase);
  // 写到 scripts/ 下的临时文件再 import，让裸包名 astronomy-engine 从仓库 node_modules 解析
  const file = join(__dirname, `.decrypted-${randomBytes(6).toString('hex')}.mjs`);
  writeFileSync(file, src);
  try {
    return await import(pathToFileURL(file).href);
  } finally {
    rmSync(file, { force: true });
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const pass = process.argv[2];
  if (!pass) {
    console.error('用法: node scripts/sky-decrypt.mjs "<口令>"');
    process.exit(1);
  }
  try {
    console.log(decrypt(pass));
  } catch {
    console.error('口令不对。');
    process.exit(1);
  }
}
