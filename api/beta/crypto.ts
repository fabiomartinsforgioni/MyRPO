// O workspace Alpha não instala as declarações de tipos do Node.
// @ts-ignore -- módulo nativo do Node 24, exercitado pelos testes HTTP.
import { argon2, createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export function token(): string {
  return randomBytes(32).toString('base64url');
}

export function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function same(left: string, right: string): boolean {
  return timingSafeEqual(
    new TextEncoder().encode(digest(left)), new TextEncoder().encode(digest(right)),
  );
}

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(password: string, hash: string): Promise<boolean>;
}

function derive(password: string, salt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    argon2('argon2id', {
      message: password, nonce: salt, memory: 19456, passes: 2, parallelism: 1, tagLength: 32,
    }, (error: Error | null, key: { toString(encoding: string): string }) => {
      if (error) reject(error);
      else resolve(key.toString('base64url'));
    });
  });
}

export const passwordHasher: PasswordHasher = {
  async hash(password) {
    const salt = token();
    return 'argon2id-v1$' + salt + '$' + await derive(password, salt);
  },
  async verify(password, hash) {
    const [version, salt, expected, extra] = hash.split('$');
    return version === 'argon2id-v1' && extra === undefined && /^[\w-]{43}$/.test(salt)
      && /^[\w-]{43}$/.test(expected) && same(await derive(password, salt), expected);
  },
};
