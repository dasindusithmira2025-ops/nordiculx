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
 */

export type SocialPlatform = 'instagram' | 'facebook' | 'tiktok';

export type SocialLink = {
  platform: SocialPlatform;
  /** Accessible name — always names the platform AND the account holder. */
  label: string;
  href: string;
};

export function getSocialLinks(): SocialLink[] {
  const configured: [SocialPlatform, string, string | undefined][] = [
    ['instagram', 'Instagram', env.SOCIAL_INSTAGRAM_URL],
    ['facebook', 'Facebook', env.SOCIAL_FACEBOOK_URL],
    ['tiktok', 'TikTok', env.SOCIAL_TIKTOK_URL],
  ];

  return configured.flatMap(([platform, name, href]) =>
    href
      ? [{ platform, href, label: `Nordic Lux on ${name}` } as SocialLink]
      : [],
  );
}
