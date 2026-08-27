import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';

/**
 * Opaque token generation and storage.
 *
 * Rule for the whole codebase: a token that is handed to a browser or emailed
 * to a customer is generated here, given to the recipient ONCE, and stored only
 * as a SHA-256 hash. A database dump therefore contains no usable session
 * cookies, no password-reset links and no guest order-lookup tokens.
 *
 * SHA-256 (not scrypt) is correct here because these tokens are 256 bits of
 * CSPRNG output — there is nothing to brute-force, so a slow KDF would only
 * cost latency.
 */

const TOKEN_BYTES = 32;

/** A URL-safe 256-bit random token. */
export function generateToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

/** Hash for storage and lookup. Deterministic, so it can be indexed. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Constant-time comparison of two hex digests. */
export function tokensMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  if (bufA.length === 0 || bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

const REFERENCE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

/**
 * Human-readable, non-sequential reference for orders and returns.
 *
 * Format: `NL-XXXX-XXXX`. The alphabet omits 0/O/1/I/L so a customer reading a
 * reference over the phone cannot produce an ambiguous character. 32^8 ≈ 1.1e12
 * possibilities makes enumeration impractical, and access control is still
 * enforced on top — knowing a reference is not authorisation.
 */
export function generateReference(prefix = 'NL'): string {
  const bytes = randomBytes(8);
  let out = '';
  for (let i = 0; i < 8; i++) {
    if (i === 4) out += '-';
    out += REFERENCE_ALPHABET[bytes[i]! % REFERENCE_ALPHABET.length];
  }
  return `${prefix}-${out}`;
}

/** Short code for shareable Routine Finder results. */
export function generateShortCode(length = 8): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += REFERENCE_ALPHABET[bytes[i]! % REFERENCE_ALPHABET.length];
  }
  return out;
}
