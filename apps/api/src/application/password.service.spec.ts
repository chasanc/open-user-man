import { PasswordService } from './password.service.js';

describe('PasswordService', () => {
  const service = new PasswordService();
  const seedHash =
    '$argon2id$v=19$m=65536,t=3,p=4$dH9horpWSZ5n6PRUNwuwvg$yKZ5aiv24M1lgMYb0lkwK5DpGzJn5YAeSJ7WgckcDzY';

  it('verifies the seeded admin argon2id hash', async () => {
    await expect(service.verify(seedHash, 'changeme')).resolves.toBe(true);
    await expect(service.verify(seedHash, 'wrong')).resolves.toBe(false);
  });

  it('hashes and verifies a new password', async () => {
    const hashed = await service.hash('secret-password');
    expect(hashed.startsWith('$argon2id$')).toBe(true);
    await expect(service.verify(hashed, 'secret-password')).resolves.toBe(true);
  });

  it('flags old-parameter hashes for rehash but not new ones', async () => {
    expect(service.needsRehash(seedHash)).toBe(true);
    expect(service.needsRehash(await service.hash('x'))).toBe(false);
  });

  it('rejects HMAC-era hashes until an import story exists', async () => {
    await expect(service.verify('not-argon', 'changeme')).resolves.toBe(false);
  });
});
