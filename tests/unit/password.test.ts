import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword, needsRehash } from '@/lib/auth/password';

describe('password hashing', () => {
  it('never stores the plaintext', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(hash).not.toContain('correct horse battery staple');
    expect(hash.startsWith('scrypt$')).toBe(true);
  });

  it('produces a different hash each time (unique salt)', async () => {
    const a = await hashPassword('same-password');
    const b = await hashPassword('same-password');
    expect(a).not.toBe(b);
  });

  it('verifies the correct password', async () => {
    const hash = await hashPassword('Str0ng!Passphrase');
    await expect(verifyPassword('Str0ng!Passphrase', hash)).resolves.toBe(true);
  });

  it('rejects the wrong password', async () => {
    const hash = await hashPassword('Str0ng!Passphrase');
    await expect(verifyPassword('str0ng!passphrase', hash)).resolves.toBe(
      false,
    );
    await expect(verifyPassword('', hash)).resolves.toBe(false);
  });

  it('handles unicode consistently through normalisation', async () => {
    // "é" composed vs decomposed must not lock a user out of their account.
    const composed = 'café-secret';
    const decomposed = 'café-secret';
    const hash = await hashPassword(composed);
    await expect(verifyPassword(decomposed, hash)).resolves.toBe(true);
  });

  it('returns false rather than throwing on a corrupt stored hash', async () => {
    await expect(verifyPassword('x', 'not-a-hash')).resolves.toBe(false);
    await expect(verifyPassword('x', 'scrypt$a$b$c$d$e')).resolves.toBe(false);
    await expect(verifyPassword('x', 'scrypt$16384$8$1$$')).resolves.toBe(
      false,
    );
    await expect(verifyPassword('x', '')).resolves.toBe(false);
  });

  it('refuses to hash an empty password', async () => {
    await expect(hashPassword('')).rejects.toThrow();
  });

  it('flags legacy parameters for rehashing', async () => {
    expect(needsRehash('scrypt$16384$8$1$c2FsdA==$aGFzaA==')).toBe(true);
    expect(needsRehash('bcrypt$whatever')).toBe(true);
    const current = await hashPassword('x');
    expect(needsRehash(current)).toBe(false);
  });
});
