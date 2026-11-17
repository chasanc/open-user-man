import { Injectable } from '@nestjs/common';
import { argon2id, hash, needsRehash, verify } from 'argon2';

// OWASP argon2id option (19 MiB, t=2, p=1). p=1 because concurrency comes from parallel logins.
const HASH_OPTIONS = { type: argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

@Injectable()
export class PasswordService {
  async hash(plain: string): Promise<string> {
    return hash(plain, HASH_OPTIONS);
  }

  async verify(storedHash: string, plain: string): Promise<boolean> {
    if (!storedHash || !plain) {
      return false;
    }
    if (storedHash.startsWith('$argon2')) {
      return verify(storedHash, plain);
    }
    return false;
  }

  /** True when a verified hash was made with other parameters, such as the seed hash. */
  needsRehash(storedHash: string): boolean {
    return needsRehash(storedHash, HASH_OPTIONS);
  }
}
