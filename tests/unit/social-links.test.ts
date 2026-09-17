import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The rule worth a test here is the omission.
 *
 * Instagram is the one account Nordic Lux has actually supplied, so it ships
 * as a default and is expected to render with nothing configured. Facebook and
 * TikTok have not been supplied. A regression that made either render anyway —
 * a bare `#`, a guessed handle, an icon linking nowhere — would point
 * customers at somebody else's profile, which is worse than showing no icon at
 * all. So: the known account plus whatever is configured, in a fixed order,
 * each carrying an accessible name that says whose account it is.
 *
 * The module reads the validated env at load, so each case re-imports it.
 */

const SOCIAL_KEYS = [
  'SOCIAL_INSTAGRAM_URL',
  'SOCIAL_FACEBOOK_URL',
  'SOCIAL_TIKTOK_URL',
] as const;

const INSTAGRAM_DEFAULT = 'https://www.instagram.com/thenordiclux/';

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
  it('ships the client-supplied Instagram account with nothing configured', async () => {
    expect(await loadWith({})).toEqual([
      {
        platform: 'instagram',
        href: INSTAGRAM_DEFAULT,
        label: 'Nordic Lux on Instagram',
      },
    ]);
  });

  it('falls back to the known account when the variable is blank', async () => {
    const links = await loadWith({ SOCIAL_INSTAGRAM_URL: '   ' });
    expect(links.map((l) => l.href)).toEqual([INSTAGRAM_DEFAULT]);
  });

  it('never invents a Facebook or TikTok profile', async () => {
    const links = await loadWith({});
    expect(links.map((l) => l.platform)).not.toContain('facebook');
    expect(links.map((l) => l.platform)).not.toContain('tiktok');
  });

  it('lets configuration override the Instagram default', async () => {
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

    expect(links.map((l) => l.label)).toEqual([
      'Nordic Lux on Instagram',
      'Nordic Lux on Facebook',
    ]);
  });
});
