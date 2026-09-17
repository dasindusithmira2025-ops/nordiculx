import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Nordic Lux supplied exact profile URLs for all three platforms. They ship as
 * defaults, in a fixed order, each with an accessible name that says whose
 * account it is. Configuration may override any of them.
 *
 * The module reads the validated env at load, so each case re-imports it.
 */

const SOCIAL_KEYS = [
  'SOCIAL_INSTAGRAM_URL',
  'SOCIAL_FACEBOOK_URL',
  'SOCIAL_TIKTOK_URL',
] as const;

const DEFAULTS = [
  'https://www.facebook.com/share/14p2RKmg9BX/?mibextid=wwXIfr',
  'https://www.tiktok.com/@thenordiclux?_r=1&_t=ZS-99mh0y5rkqF',
  'https://www.instagram.com/thenordiclux?stkn=MWplcXdubW11eWxqNQ==',
];

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
  it('ships the exact client-supplied URLs with nothing configured', async () => {
    const links = await loadWith({});
    expect(links.map((l) => l.platform)).toEqual([
      'facebook',
      'tiktok',
      'instagram',
    ]);
    expect(links.map((l) => l.href)).toEqual(DEFAULTS);
    expect(links.map((l) => l.label)).toEqual([
      'Nordic Lux on Facebook',
      'Nordic Lux on TikTok',
      'Nordic Lux on Instagram',
    ]);
  });

  it('falls back to the client URLs when a variable is blank', async () => {
    const links = await loadWith({ SOCIAL_TIKTOK_URL: '   ' });
    expect(links.map((l) => l.href)).toEqual(DEFAULTS);
  });

  it('lets configuration override a default', async () => {
    const links = await loadWith({
      SOCIAL_INSTAGRAM_URL: 'https://www.instagram.com/nordiclux/',
    });
    expect(links.map((l) => l.href)).toEqual([
      DEFAULTS[0],
      DEFAULTS[1],
      'https://www.instagram.com/nordiclux/',
    ]);
  });
});
