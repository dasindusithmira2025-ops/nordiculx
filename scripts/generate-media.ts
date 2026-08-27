import './load-env';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';

/**
 * Generates the placeholder catalogue imagery used by `npm run db:seed`.
 *
 * These are DEMO ASSETS. They are drawn vector still-lifes in the Nordic Lux
 * palette — deliberately not stock photography, so nobody can mistake seeded
 * content for real Nordic Lux product photography (docs/PRODUCT.md § Content
 * safety). Real imagery is a client-supplied production input and swaps in
 * through the same media records without any code change.
 *
 * Output: public/media/{products,editorial,brands}/*.webp
 *
 *   npx tsx scripts/generate-media.ts
 */

const OUT_ROOT = join(process.cwd(), 'public', 'media');

/** Warm, low-chroma grounds. Index chosen per brand so a brand reads coherently. */
const GROUNDS = [
  { from: '#EDE7DB', to: '#DCD3C2', object: '#C4BAA6', accent: '#8A8D83' },
  { from: '#E6E9E1', to: '#D2D8CB', object: '#B0BAA6', accent: '#55614E' },
  { from: '#F1EAE2', to: '#E0D2C5', object: '#C9B49F', accent: '#6F6252' },
  { from: '#E4E4E0', to: '#D0D1CB', object: '#B3B5AC', accent: '#5A5D56' },
  { from: '#EFE9E9', to: '#DED2D0', object: '#C6B4B1', accent: '#7A625E' },
] as const;

export type VesselShape =
  'dropper' | 'pump' | 'jar' | 'tube' | 'flacon' | 'bottle' | 'pouch';

/** Maps a routine step to the vessel a product of that kind actually ships in. */
export function vesselForStep(step: string | null | undefined): VesselShape {
  switch (step) {
    case 'treat':
      return 'dropper';
    case 'cleanse':
      return 'pump';
    case 'moisturise':
      return 'jar';
    case 'protect':
      return 'tube';
    case 'fragrance':
      return 'flacon';
    case 'hair':
    case 'body':
      return 'bottle';
    case 'wellness':
      return 'pouch';
    default:
      return 'bottle';
  }
}

/** Where the vessel's straight body sits, so the label band can be placed on it. */
type Body = { x: number; y: number; w: number; h: number };

type Vessel = {
  /** Cap, collar and other furniture — drawn in a slightly darker tone. */
  furniture: string;
  /** The main body, which carries the gradient, sheen and label. */
  body: string;
  bodyBox: Body;
};

/**
 * Vessel silhouettes on a 1200x1600 canvas, centred on x=600, standing on a
 * floor line at y=1210.
 *
 * Body and furniture are separate paths rather than one clipped group: librsvg
 * (what sharp renders with) does not reliably honour a clip-path that
 * references a group inside a transformed parent, and a silently-dropped clip
 * is exactly how the first version lost every label and highlight.
 */
function vessel(shape: VesselShape): Vessel {
  switch (shape) {
    case 'dropper':
      // Narrow apothecary bottle with a long pipette cap and a glass bulb.
      return {
        furniture: `
          <rect x="558" y="300" width="84" height="120" rx="10" />
          <rect x="576" y="420" width="48" height="40" />
          <ellipse cx="600" cy="286" rx="30" ry="22" />`,
        body: `<path d="M498 460 h204 a30 30 0 0 1 30 30 v684 a36 36 0 0 1 -36 36 h-192 a36 36 0 0 1 -36 -36 v-684 a30 30 0 0 1 30 -30 z" />`,
        bodyBox: { x: 468, y: 460, w: 264, h: 750 },
      };

    case 'pump':
      // Tall bottle with a pump head and a nozzle projecting to the left.
      return {
        furniture: `
          <rect x="566" y="286" width="68" height="44" rx="8" />
          <rect x="588" y="330" width="24" height="96" />
          <path d="M566 286 h-96 a14 14 0 0 0 -14 14 v20 a14 14 0 0 0 14 14 h96 z" />
          <rect x="524" y="426" width="152" height="34" rx="8" />`,
        body: `<path d="M470 460 h260 a34 34 0 0 1 34 34 v676 a40 40 0 0 1 -40 40 h-248 a40 40 0 0 1 -40 -40 v-676 a34 34 0 0 1 34 -34 z" />`,
        bodyBox: { x: 436, y: 460, w: 328, h: 750 },
      };

    case 'jar':
      // Wide, squat, unmistakably not a bottle.
      return {
        furniture: `
          <path d="M406 604 h388 a22 22 0 0 1 22 22 v86 h-432 v-86 a22 22 0 0 1 22 -22 z" />`,
        body: `<path d="M392 712 h416 v396 a102 102 0 0 1 -102 102 h-212 a102 102 0 0 1 -102 -102 z" />`,
        bodyBox: { x: 392, y: 712, w: 416, h: 498 },
      };

    case 'tube':
      // Tapered, with a crimped seam at the base and a small screw cap.
      return {
        furniture: `
          <rect x="552" y="300" width="96" height="66" rx="10" />
          <rect x="574" y="366" width="52" height="30" />`,
        body: `<path d="M528 396 h144 l38 686 h-220 z" />
               <rect x="486" y="1082" width="228" height="52" rx="10" />
               <rect x="486" y="1134" width="228" height="16" />`,
        bodyBox: { x: 512, y: 430, w: 176, h: 620 },
      };

    case 'flacon':
      // Wide square perfume bottle with a heavy stopper.
      return {
        furniture: `
          <rect x="524" y="288" width="152" height="96" rx="6" />
          <rect x="566" y="384" width="68" height="52" />`,
        body: `<path d="M418 436 h364 a26 26 0 0 1 26 26 v696 a52 52 0 0 1 -52 52 h-312 a52 52 0 0 1 -52 -52 v-696 a26 26 0 0 1 26 -26 z" />`,
        bodyBox: { x: 392, y: 436, w: 416, h: 774 },
      };

    case 'pouch':
      // Flat sachet with a torn notch and a sealed top seam.
      return {
        furniture: `
          <path d="M446 452 h308 v46 h-308 z" />
          <path d="M754 470 l34 18 l-34 18 z" />`,
        body: `<path d="M462 498 h276 a20 20 0 0 1 20 20 v640 a52 52 0 0 1 -52 52 h-212 a52 52 0 0 1 -52 -52 v-640 a20 20 0 0 1 20 -20 z" />`,
        bodyBox: { x: 442, y: 498, w: 316, h: 712 },
      };

    case 'bottle':
    default:
      // Classic cylinder with a shoulder taper and a screw cap.
      return {
        furniture: `
          <rect x="546" y="288" width="108" height="82" rx="8" />
          <rect x="562" y="370" width="76" height="42" />`,
        body: `<path d="M562 412 h76 l82 96 a44 44 0 0 1 10 28 v596 a78 78 0 0 1 -78 78 h-104 a78 78 0 0 1 -78 -78 v-596 a44 44 0 0 1 10 -28 z" />`,
        bodyBox: { x: 470, y: 540, w: 260, h: 670 },
      };
  }
}

/**
 * A single still-life: graded ground, soft key light from upper left, the
 * vessel, its contact shadow, and a hairline label band.
 */
function stillLifeSvg(options: {
  shape: VesselShape;
  groundIndex: number;
  label: string;
  seed: number;
}): string {
  const g = GROUNDS[options.groundIndex % GROUNDS.length]!;
  const v = vessel(options.shape);
  const b = v.bodyBox;

  // Nudges the light and the vessel so a grid of cards never looks stamped.
  const lightX = 280 + ((options.seed * 37) % 240);
  const lightY = 220 + ((options.seed * 53) % 180);
  const tilt = (((options.seed * 17) % 5) - 2) * 0.3;

  const FLOOR = 1210;

  // Label band: centred on the body, sized from it, never wider than it.
  const labelW = Math.min(b.w * 0.78, 330);
  const labelH = 152;
  const labelX = 600 - labelW / 2;
  const labelY = b.y + b.h * 0.44;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1600" viewBox="0 0 1200 1600">
  <defs>
    <linearGradient id="ground" x1="0" y1="0" x2="0.35" y2="1">
      <stop offset="0%" stop-color="${g.from}"/>
      <stop offset="100%" stop-color="${g.to}"/>
    </linearGradient>
    <radialGradient id="key" cx="${(lightX / 1200).toFixed(3)}" cy="${(lightY / 1600).toFixed(3)}" r="0.7">
      <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.5"/>
      <stop offset="60%" stop-color="#FFFFFF" stop-opacity="0.05"/>
      <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0"/>
    </radialGradient>

    <!-- Form shading across the body: lit left edge, core tone, shadow side.
         This is what stops the vessel reading as a flat cut-out. -->
    <linearGradient id="vesselFill" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%"   stop-color="${g.accent}" stop-opacity="0.55"/>
      <stop offset="9%"   stop-color="${g.object}"/>
      <stop offset="26%"  stop-color="#FFFFFF" stop-opacity="0.85"/>
      <stop offset="46%"  stop-color="${g.object}"/>
      <stop offset="82%"  stop-color="${g.accent}" stop-opacity="0.78"/>
      <stop offset="100%" stop-color="${g.accent}" stop-opacity="0.95"/>
    </linearGradient>
    <linearGradient id="furnitureFill" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%"   stop-color="${g.accent}" stop-opacity="0.75"/>
      <stop offset="24%"  stop-color="${g.object}"/>
      <stop offset="70%"  stop-color="${g.accent}" stop-opacity="0.85"/>
      <stop offset="100%" stop-color="${g.accent}"/>
    </linearGradient>
    <!-- Ambient occlusion where the vessel meets the floor. -->
    <linearGradient id="footShade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${g.accent}" stop-opacity="0"/>
      <stop offset="100%" stop-color="${g.accent}" stop-opacity="0.42"/>
    </linearGradient>
    <radialGradient id="contact" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0%" stop-color="${g.accent}" stop-opacity="0.38"/>
      <stop offset="100%" stop-color="${g.accent}" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="1200" height="1600" fill="url(#ground)"/>
  <rect width="1200" height="1600" fill="url(#key)"/>

  <!-- Shallow surface the object stands on. -->
  <rect x="0" y="${FLOOR}" width="1200" height="${1600 - FLOOR}" fill="${g.accent}" opacity="0.07"/>
  <line x1="0" y1="${FLOOR}" x2="1200" y2="${FLOOR}" stroke="${g.accent}" stroke-opacity="0.18" stroke-width="1"/>

  <!-- Cast shadow, thrown away from the key light. -->
  <ellipse cx="${640 - (lightX - 400) * 0.06}" cy="${FLOOR + 16}" rx="${b.w * 0.72}" ry="40" fill="url(#contact)"/>

  <g transform="rotate(${tilt.toFixed(2)} 600 800)">
    <g fill="url(#furnitureFill)">${v.furniture}</g>
    <g fill="url(#vesselFill)">${v.body}</g>

    <!-- Occlusion band at the foot, drawn only across the body width. -->
    <rect x="${b.x}" y="${FLOOR - 90}" width="${b.w}" height="90" fill="url(#footShade)" opacity="0.5"/>

    <!-- Paper label. Positioned from the body box, so it always lands on the
         vessel regardless of shape — no clip path to silently fail. -->
    <rect x="${labelX.toFixed(1)}" y="${labelY.toFixed(1)}" width="${labelW.toFixed(1)}" height="${labelH}"
          fill="#FBF8F2" fill-opacity="0.92"/>
    <rect x="${labelX.toFixed(1)}" y="${labelY.toFixed(1)}" width="${labelW.toFixed(1)}" height="${labelH}"
          fill="none" stroke="${g.accent}" stroke-opacity="0.18" stroke-width="1"/>
    <text x="600" y="${(labelY + 52).toFixed(1)}" text-anchor="middle"
          font-family="Georgia, 'Times New Roman', serif" font-size="25"
          letter-spacing="6" fill="#2C3A2E" fill-opacity="0.92">NORDIC LUX</text>
    <line x1="${(600 - labelW * 0.3).toFixed(1)}" y1="${(labelY + 74).toFixed(1)}"
          x2="${(600 + labelW * 0.3).toFixed(1)}" y2="${(labelY + 74).toFixed(1)}"
          stroke="${g.accent}" stroke-opacity="0.4" stroke-width="1"/>
    <text x="600" y="${(labelY + 108).toFixed(1)}" text-anchor="middle"
          font-family="Helvetica, Arial, sans-serif" font-size="16"
          letter-spacing="3" fill="#55614E" fill-opacity="0.85">${escapeXml(
            options.label.toUpperCase().slice(0, 20),
          )}</text>
  </g>
</svg>`;
}

/**
 * Wide editorial frame.
 *
 * The first version was a flat gradient with two hairline circles, which on a
 * dark surface read as an image that had failed to load rather than as art
 * direction. This one builds actual depth: a raking light from one side, a
 * soft horizon, a large out-of-focus form, and a vignette — the abstraction of
 * a lit studio wall, which is what campaign photography will eventually be.
 */
function editorialSvg(options: {
  groundIndex: number;
  seed: number;
  dark: boolean;
  width: number;
  height: number;
}): string {
  const g = GROUNDS[options.groundIndex % GROUNDS.length]!;
  const { width: w, height: h, dark } = options;

  const from = dark ? '#1E231D' : g.from;
  const to = dark ? '#0A0C0B' : g.to;
  const light = dark ? '#C6D2BC' : '#FFFFFF';
  const ink = dark ? '#F3EFE7' : g.accent;

  // Light position and form placement vary per image so a page of them does
  // not look like the same asset repeated.
  const lightX = (0.16 + ((options.seed * 17) % 46) / 100) * w;
  const lightY = (0.14 + ((options.seed * 11) % 30) / 100) * h;
  const formX = (0.52 + ((options.seed * 7) % 34) / 100) * w;
  const horizon = h * (0.62 + ((options.seed * 5) % 14) / 100);
  const formR = h * 0.34;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.55" y2="1">
      <stop offset="0%" stop-color="${from}"/>
      <stop offset="100%" stop-color="${to}"/>
    </linearGradient>

    <!-- Raking key light. -->
    <radialGradient id="key" cx="${(lightX / w).toFixed(3)}" cy="${(lightY / h).toFixed(3)}" r="0.75">
      <stop offset="0%"   stop-color="${light}" stop-opacity="${dark ? 0.34 : 0.62}"/>
      <stop offset="45%"  stop-color="${light}" stop-opacity="${dark ? 0.08 : 0.16}"/>
      <stop offset="100%" stop-color="${light}" stop-opacity="0"/>
    </radialGradient>

    <!-- The large soft form: lit on the light side, lost on the other. -->
    <linearGradient id="form" x1="0" y1="0" x2="1" y2="0.35">
      <stop offset="0%"   stop-color="${light}" stop-opacity="${dark ? 0.16 : 0.5}"/>
      <stop offset="55%"  stop-color="${ink}"   stop-opacity="${dark ? 0.1 : 0.16}"/>
      <stop offset="100%" stop-color="${ink}"   stop-opacity="${dark ? 0.02 : 0.05}"/>
    </linearGradient>

    <!-- Ground plane below the horizon. -->
    <linearGradient id="floor" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="${ink}" stop-opacity="${dark ? 0.16 : 0.1}"/>
      <stop offset="100%" stop-color="${ink}" stop-opacity="0"/>
    </linearGradient>

    <radialGradient id="vignette" cx="0.5" cy="0.45" r="0.78">
      <stop offset="55%"  stop-color="#000000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="${dark ? 0.5 : 0.14}"/>
    </radialGradient>
  </defs>

  <rect width="${w}" height="${h}" fill="url(#bg)"/>
  <rect width="${w}" height="${h}" fill="url(#key)"/>

  <!-- Horizon and floor. -->
  <rect x="0" y="${horizon.toFixed(0)}" width="${w}" height="${(h - horizon).toFixed(0)}" fill="url(#floor)"/>
  <line x1="0" y1="${horizon.toFixed(0)}" x2="${w}" y2="${horizon.toFixed(0)}"
        stroke="${ink}" stroke-opacity="${dark ? 0.16 : 0.2}" stroke-width="1"/>

  <!-- Out-of-focus form standing on the horizon, plus its shadow. -->
  <ellipse cx="${(formX + formR * 0.2).toFixed(0)}" cy="${horizon.toFixed(0)}"
           rx="${(formR * 1.5).toFixed(0)}" ry="${(h * 0.05).toFixed(0)}"
           fill="${ink}" fill-opacity="${dark ? 0.2 : 0.12}"/>
  <circle cx="${formX.toFixed(0)}" cy="${(horizon - formR * 0.72).toFixed(0)}"
          r="${formR.toFixed(0)}" fill="url(#form)"/>
  <circle cx="${formX.toFixed(0)}" cy="${(horizon - formR * 0.72).toFixed(0)}"
          r="${formR.toFixed(0)}" fill="none"
          stroke="${light}" stroke-opacity="${dark ? 0.2 : 0.28}" stroke-width="1"/>

  <!-- A second, smaller form for depth. -->
  <circle cx="${(formX - formR * 1.5).toFixed(0)}" cy="${(horizon - formR * 0.3).toFixed(0)}"
          r="${(formR * 0.42).toFixed(0)}" fill="${light}"
          fill-opacity="${dark ? 0.07 : 0.22}"/>

  <!-- Editorial hairlines: a quiet reminder of the printed grid. -->
  <g stroke="${ink}" stroke-opacity="${dark ? 0.07 : 0.09}" stroke-width="1">
    <line x1="${(w * 0.08).toFixed(0)}" y1="0" x2="${(w * 0.08).toFixed(0)}" y2="${h}"/>
    <line x1="${(w * 0.92).toFixed(0)}" y1="0" x2="${(w * 0.92).toFixed(0)}" y2="${h}"/>
  </g>

  <rect width="${w}" height="${h}" fill="url(#vignette)"/>
</svg>`;
}

function escapeXml(value: string) {
  return value.replace(
    /[<>&'"]/g,
    (c) =>
      ({
        '<': '&lt;',
        '>': '&gt;',
        '&': '&amp;',
        "'": '&apos;',
        '"': '&quot;',
      })[c]!,
  );
}

async function writeWebp(svg: string, outPath: string) {
  const buffer = await sharp(Buffer.from(svg)).webp({ quality: 82 }).toBuffer();
  await writeFile(outPath, buffer);
}

export type MediaRequest = {
  /** File name without extension. */
  key: string;
  shape: VesselShape;
  groundIndex: number;
  label: string;
};

/** Two frames per product: the primary still-life and a hover alternate. */
export async function generateProductMedia(requests: MediaRequest[]) {
  const dir = join(OUT_ROOT, 'products');
  await mkdir(dir, { recursive: true });

  let index = 0;
  for (const request of requests) {
    index += 1;
    await writeWebp(
      stillLifeSvg({
        shape: request.shape,
        groundIndex: request.groundIndex,
        label: request.label,
        seed: index,
      }),
      join(dir, `${request.key}.webp`),
    );
    await writeWebp(
      stillLifeSvg({
        shape: request.shape,
        // A different ground makes the hover swap read as a second shot.
        groundIndex: request.groundIndex + 2,
        label: request.label,
        seed: index * 7 + 3,
      }),
      join(dir, `${request.key}-alt.webp`),
    );
  }
  return requests.length * 2;
}

export async function generateEditorialMedia(
  requests: { key: string; dark: boolean; width: number; height: number }[],
) {
  const dir = join(OUT_ROOT, 'editorial');
  await mkdir(dir, { recursive: true });

  let index = 0;
  for (const request of requests) {
    index += 1;
    await writeWebp(
      editorialSvg({
        groundIndex: index,
        seed: index * 11,
        dark: request.dark,
        width: request.width,
        height: request.height,
      }),
      join(dir, `${request.key}.webp`),
    );
  }
  return requests.length;
}

// Allow running standalone for a quick visual check of the generator itself.
if (process.argv[1]?.endsWith('generate-media.ts')) {
  const shapes: VesselShape[] = [
    'dropper',
    'pump',
    'jar',
    'tube',
    'flacon',
    'bottle',
    'pouch',
  ];
  await generateProductMedia(
    shapes.map((shape, i) => ({
      key: `sample-${shape}`,
      shape,
      groundIndex: i,
      label: shape,
    })),
  );
  await generateEditorialMedia([
    { key: 'sample-dark', dark: true, width: 2000, height: 1100 },
    { key: 'sample-light', dark: false, width: 1600, height: 1200 },
  ]);
  console.warn('Sample media written to public/media/');
}
