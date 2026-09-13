import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The rule worth a test here is the omission.
 *
 * Nordic Lux has no recorded social accounts yet. A regression that made an
 * unset platform render anyway — a bare `#`, a guessed handle, an icon linking
 * nowhere — would point customers at somebody else's profile, which is worse
 * than showing no icons at all. So: only configured URLs, in a fixed order,
 * each carrying an accessible name that says whose account it is.
 *
 * The module reads the validated env at load, so each case re-imports it.
 */

const SOCIAL_KEYS = [
  'SOCIAL_INSTAGRAM_URL',
  'SOCIAL_FACEBOOK_URL',
  'SOCIAL_TIKTOK_URL',
] as const;

const original: Record<string, string | undefined> = {};

async function loadWith(env: Partial<Record<string, string>>) {
  for (const key of SOCIAL_KEYS) delete process.env[key];
  Object.assign(process.env, env);
  vi.resetModules();
  const { getSocialLinks } = await import('@/lib/social');
  return getSocialLinks();
}

beforeEach(() => {
  for (const key of SOCIAL_KEYS) original[key] = process.env[key];
});

afterEach(() => {
  for (const key of SOCIAL_KEYS) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }
  vi.resetModules();
});

describe('getSocialLinks', () => {
  it('renders nothing when no profile is configured', async () => {
    expect(await loadWith({})).toEqual([]);
  });

  it('treats a blank variable as not configured', async () => {
    expect(await loadWith({ SOCIAL_INSTAGRAM_URL: '   ' })).toEqual([]);
  });

  it('returns only the platforms that have a URL', async () => {
    const links = await loadWith({
      SOCIAL_INSTAGRAM_URL: 'https://www.instagram.com/nordiclux/',
      SOCIAL_TIKTOK_URL: 'https://www.tiktok.com/@nordiclux',
    });

    expect(links.map((l) => l.platform)).toEqual(['instagram', 'tiktok']);
    expect(links.map((l) => l.href)).toEqual([
      'https://www.instagram.com/nordiclux/',
      'https://www.tiktok.com/@nordiclux',
    ]);
  });

  it('names the account holder in every accessible label', async () => {
    const links = await loadWith({
      SOCIAL_FACEBOOK_URL: 'https://www.facebook.com/nordiclux',
    });

    expect(links).toHaveLength(1);
    expect(links[0]!.label).toBe('Nordic Lux on Facebook');
  });
});
