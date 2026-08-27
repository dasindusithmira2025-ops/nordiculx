import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

/**
 * Password hashing.
 *
 * scrypt from Node's standard library — a memory-hard KDF, which is what
 * defeats GPU cracking. No native dependency to compile, no supply-chain
 * surface, and it is the same primitive bcrypt/argon2 alternatives compete
 * with rather than a home-made construction.
 *
 * Stored format is self-describing so parameters can be raised later without
 * invalidating existing hashes:
 *
 *   scrypt$N$r$p$<salt base64>$<derived key base64>
 *
 * NEVER store, log, or transmit a plaintext password. NEVER compare hashes
 * with `===`.
 */

// promisify() picks the 3-argument scrypt overload and drops the options
// parameter, so the wrapper is typed explicitly to keep N/r/p type-checked.
const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

// 2^16 iterations. Memory cost is 128 * N * r bytes ≈ 64 MiB per hash, which
// is deliberately expensive for an attacker and ~100ms for one honest login.
const N = 65536;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
// scrypt refuses to run if it would exceed maxmem; the default 32 MiB is below
// what these parameters need, so it is raised explicitly.
const MAX_MEM = 160 * 1024 * 1024;

export async function hashPassword(plain: string): Promise<string> {
  if (typeof plain !== 'string' || plain.length === 0) {
    throw new Error('Password must be a non-empty string');
  }
  const salt = randomBytes(SALT_LENGTH);
  const derived = (await scryptAsync(
    plain.normalize('NFKC'),
    salt,
    KEY_LENGTH,
    {
      N,
      r: R,
      p: P,
      maxmem: MAX_MEM,
    },
  )) as Buffer;

  return [
    'scrypt',
    N,
    R,
    P,
    salt.toString('base64'),
    derived.toString('base64'),
  ].join('$');
}

/**
 * Verifies a password against a stored hash.
 *
 * Returns false for malformed input rather than throwing: a corrupt hash in
 * the database must read as "authentication failed", never as a 500 that tells
 * an attacker the account exists.
 */
export async function verifyPassword(
  plain: string,
  stored: string,
): Promise<boolean> {
  if (typeof plain !== 'string' || typeof stored !== 'string') return false;

  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const [, nRaw, rRaw, pRaw, saltRaw, hashRaw] = parts;
  const n = Number(nRaw);
  const r = Number(rRaw);
  const p = Number(pRaw);
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) {
    return false;
  }

  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(saltRaw!, 'base64');
    expected = Buffer.from(hashRaw!, 'base64');
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length === 0) return false;

  try {
    const actual = (await scryptAsync(
      plain.normalize('NFKC'),
      salt,
      expected.length,
      {
        N: n,
        r,
        p,
        maxmem: MAX_MEM,
      },
    )) as Buffer;

    // Constant-time comparison. Lengths are equal by construction above, but
    // timingSafeEqual throws on a mismatch, so guard anyway.
    if (actual.length !== expected.length) return false;
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/**
 * True when a stored hash was produced with weaker parameters than the current
 * policy. Callers re-hash on the next successful login, which upgrades accounts
 * silently over time.
 */
export function needsRehash(stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return true;
  return Number(parts[1]) < N || Number(parts[2]) < R;
}
