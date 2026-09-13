import type { SVGProps } from 'react';

/**
 * Nordic Lux icon set.
 *
 * Hand-drawn on a 24px grid with a 1.25px stroke, round caps and no fills.
 * Deliberately lighter than off-the-shelf icon libraries (typically 2px) so
 * icons sit at the same optical weight as the hairline rules and the type,
 * instead of shouting over them. See docs/DESIGN.md § Iconography.
 *
 * Icons are decorative by default (`aria-hidden`). When an icon is the only
 * content of a control, the control itself carries the accessible name.
 */

type IconProps = SVGProps<SVGSVGElement> & { title?: string };

function Svg({ title, children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.25}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      focusable="false"
      {...props}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

export const SearchIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4.5 4.5" />
  </Svg>
);

export const BagIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4.5 7.5h15l-1.1 12.2a1.5 1.5 0 0 1-1.5 1.3H7.1a1.5 1.5 0 0 1-1.5-1.3Z" />
    <path d="M9 10V6.75a3 3 0 0 1 6 0V10" />
  </Svg>
);

export const HeartIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 20.5c-.4 0-.7-.1-1-.4l-6.4-6a5 5 0 0 1 7.4-6.7 5 5 0 0 1 7.4 6.7l-6.4 6c-.3.3-.6.4-1 .4Z" />
  </Svg>
);

export const HeartFilledIcon = (p: IconProps) => (
  <Svg {...p} fill="currentColor">
    <path d="M12 20.5c-.4 0-.7-.1-1-.4l-6.4-6a5 5 0 0 1 7.4-6.7 5 5 0 0 1 7.4 6.7l-6.4 6c-.3.3-.6.4-1 .4Z" />
  </Svg>
);

export const UserIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="8" r="3.75" />
    <path d="M4.5 20.5c.9-4 3.8-6 7.5-6s6.6 2 7.5 6" />
  </Svg>
);

export const MenuIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3.5 7.5h17M3.5 12h17M3.5 16.5h17" />
  </Svg>
);

export const CloseIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m5.5 5.5 13 13M18.5 5.5l-13 13" />
  </Svg>
);

export const ChevronDownIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m5.5 9 6.5 6.5L18.5 9" />
  </Svg>
);

export const ChevronUpIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m5.5 15 6.5-6.5L18.5 15" />
  </Svg>
);

export const ChevronRightIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m9 5.5 6.5 6.5L9 18.5" />
  </Svg>
);

export const ChevronLeftIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M15 5.5 8.5 12l6.5 6.5" />
  </Svg>
);

export const ArrowRightIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 12h16M14 6l6 6-6 6" />
  </Svg>
);

export const ArrowLeftIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20 12H4M10 6l-6 6 6 6" />
  </Svg>
);

export const PlusIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);

export const MinusIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 12h14" />
  </Svg>
);

export const CheckIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m4.5 12.5 5 5 10-11" />
  </Svg>
);

export const StarIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m12 3.75 2.6 5.4 5.9.85-4.25 4.2 1 5.9-5.25-2.8-5.25 2.8 1-5.9L3.5 10l5.9-.85Z" />
  </Svg>
);

export const StarFilledIcon = (p: IconProps) => (
  <Svg {...p} fill="currentColor">
    <path d="m12 3.75 2.6 5.4 5.9.85-4.25 4.2 1 5.9-5.25-2.8-5.25 2.8 1-5.9L3.5 10l5.9-.85Z" />
  </Svg>
);

export const FilterIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3.5 6.5h17M6.5 12h11M10 17.5h4" />
  </Svg>
);

export const TrashIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4.5 6.5h15M9.5 6.5V5a1.5 1.5 0 0 1 1.5-1.5h2A1.5 1.5 0 0 1 14.5 5v1.5" />
    <path d="M6.5 6.5 7.6 20a1.5 1.5 0 0 0 1.5 1.4h5.8a1.5 1.5 0 0 0 1.5-1.4L17.5 6.5" />
    <path d="M10.5 10.5v7M13.5 10.5v7" />
  </Svg>
);

export const ChatIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20.5 12c0 4-3.8 7.25-8.5 7.25a10 10 0 0 1-2.6-.34L4.5 20.5l1.3-3.6A6.9 6.9 0 0 1 3.5 12c0-4 3.8-7.25 8.5-7.25s8.5 3.25 8.5 7.25Z" />
  </Svg>
);

export const WhatsAppIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3.5 20.5 4.9 16a8 8 0 1 1 3.1 3Z" />
    <path d="M9 9.5c0 3 2.5 5.5 5.5 5.5.6 0 1-.4 1-1v-.7l-1.8-.8-.9 1a5.6 5.6 0 0 1-2.3-2.3l1-.9-.8-1.8H10c-.6 0-1 .4-1 1Z" />
  </Svg>
);

/* --- social ---------------------------------------------------------------
   Drawn on the same 24px grid at the same 1.25px stroke as the rest of the
   set, rather than dropped in as the platforms' filled brand marks. A wall of
   saturated brand colour in the footer would be the loudest thing on a page
   whose whole argument is restraint — and these are links to us, not badges
   for them. Each glyph keeps the silhouette that makes the platform
   recognisable at 18px, which is all a footer icon has to do. */

export const InstagramIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3.75" y="3.75" width="16.5" height="16.5" rx="4.75" />
    <circle cx="12" cy="12" r="3.85" />
    <path d="M16.9 7.1v.01" />
  </Svg>
);

export const FacebookIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3.75" y="3.75" width="16.5" height="16.5" rx="4.75" />
    <path d="M14.9 8.4h-1.1c-.9 0-1.4.5-1.4 1.4v1.5m0 0h-1.9m1.9 0h2.1m-2.1 0v5" />
  </Svg>
);

export const TikTokIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M13.9 3.75v10.9a3.75 3.75 0 1 1-3.75-3.75c.3 0 .6.03.85.1" />
    <path d="M13.9 3.75a4.6 4.6 0 0 0 4.35 4.15" />
  </Svg>
);

export const InfoIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 11v5.5M12 7.75v.5" />
  </Svg>
);

export const AlertIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 4.5 21 20H3Z" />
    <path d="M12 10v4M12 16.75v.5" />
  </Svg>
);

export const TruckIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2.5 6.5h11v10h-11Z" />
    <path d="M13.5 10h4l4 3.5v3h-8Z" />
    <circle cx="7" cy="18" r="1.75" />
    <circle cx="17" cy="18" r="1.75" />
  </Svg>
);

export const LeafIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20 4c0 9-5 13-11 13H5c0-8 5-12 11-12Z" />
    <path d="M4 20c2-5 5-8 9-10" />
  </Svg>
);

export const SparkleIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3.5 13.6 9 19 10.5 13.6 12 12 17.5 10.4 12 5 10.5 10.4 9Z" />
    <path d="M18.5 16.5 19.2 19l2.3.75-2.3.75-.7 2.5-.7-2.5-2.3-.75 2.3-.75Z" />
  </Svg>
);

export const ExternalIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M14 4.5h5.5V10" />
    <path d="M19.5 4.5 11 13" />
    <path d="M18 14.5v4a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6h4" />
  </Svg>
);

export const SpinnerIcon = (p: IconProps) => (
  <Svg
    {...p}
    className={['animate-spin', p.className].filter(Boolean).join(' ')}
  >
    <circle cx="12" cy="12" r="8.5" opacity={0.25} />
    <path d="M20.5 12A8.5 8.5 0 0 0 12 3.5" />
  </Svg>
);
