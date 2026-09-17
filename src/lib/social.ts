import 'server-only';
import { env } from '@/lib/env';

/**
 * Nordic Lux social profiles.
 *
 * One list used by every surface that shows social links. The defaults below
 * are the exact profile URLs Nordic Lux supplied (share parameters included,
 * as given); `SOCIAL_*_URL` overrides any of them at deploy time. Never swap
 * in a guessed handle: it would link customers to somebody else's account.
 */

/** Client-supplied. Each is overridden by its SOCIAL_*_URL when that is set. */
const FACEBOOK_URL =
  'https://www.facebook.com/share/14p2RKmg9BX/?mibextid=wwXIfr';
const TIKTOK_URL =
  'https://www.tiktok.com/@thenordiclux?_r=1&_t=ZS-99mh0y5rkqF';
const INSTAGRAM_URL =
  'https://www.instagram.com/thenordiclux?stkn=MWplcXdubW11eWxqNQ==';

export type SocialPlatform = 'instagram' | 'facebook' | 'tiktok';

export type SocialLink = {
  platform: SocialPlatform;
  /** Visible platform name. */
  name: string;
  /** Accessible name — always names the platform AND the account holder. */
  label: string;
  href: string;
};

export function getSocialLinks(): SocialLink[] {
  const configured: [SocialPlatform, string, string | undefined][] = [
    ['facebook', 'Facebook', env.SOCIAL_FACEBOOK_URL ?? FACEBOOK_URL],
    ['tiktok', 'TikTok', env.SOCIAL_TIKTOK_URL ?? TIKTOK_URL],
    ['instagram', 'Instagram', env.SOCIAL_INSTAGRAM_URL ?? INSTAGRAM_URL],
  ];

  return configured.flatMap(([platform, name, href]) =>
    href
      ? [{ platform, name, href, label: `Nordic Lux on ${name}` } as SocialLink]
      : [],
  );
}
