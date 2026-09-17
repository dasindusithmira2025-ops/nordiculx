import 'server-only';
import { env } from '@/lib/env';

/**
 * Nordic Lux social profiles.
 *
 * One list, read from configuration, used by every surface that shows social
 * links. The rule that matters here is the omission: a platform with no
 * configured URL produces no entry, so the site can never link to a profile
 * Nordic Lux does not own. Adding a profile is a deploy-time environment
 * change, not a code change.
 *
 * Instagram is the one exception: the account below is the handle Nordic Lux
 * supplied, so it ships as the default and the environment variable only has
 * to be set to point somewhere else. Facebook and TikTok have no default and
 * never will — guessing a URL for either would link customers to an account
 * that may belong to somebody else entirely.
 */

/** Client-supplied. Overridden by SOCIAL_INSTAGRAM_URL when that is set. */
const INSTAGRAM_URL = 'https://www.instagram.com/thenordiclux/';

export type SocialPlatform = 'instagram' | 'facebook' | 'tiktok';

export type SocialLink = {
  platform: SocialPlatform;
  /** Accessible name — always names the platform AND the account holder. */
  label: string;
  href: string;
};

export function getSocialLinks(): SocialLink[] {
  const configured: [SocialPlatform, string, string | undefined][] = [
    ['instagram', 'Instagram', env.SOCIAL_INSTAGRAM_URL ?? INSTAGRAM_URL],
    ['facebook', 'Facebook', env.SOCIAL_FACEBOOK_URL],
    ['tiktok', 'TikTok', env.SOCIAL_TIKTOK_URL],
  ];

  return configured.flatMap(([platform, name, href]) =>
    href
      ? [{ platform, href, label: `Nordic Lux on ${name}` } as SocialLink]
      : [],
  );
}
