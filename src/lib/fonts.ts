import { Instrument_Serif, Archivo } from 'next/font/google';

/**
 * Two families, self-hosted at build time by next/font (no runtime request to
 * Google, no layout shift). The display serif ships at a single weight on
 * purpose — see docs/DESIGN.md § Typography.
 */

export const displaySerif = Instrument_Serif({
  subsets: ['latin'],
  weight: ['400'],
  style: ['normal', 'italic'],
  variable: '--font-instrument-serif',
  display: 'swap',
});

export const uiSans = Archivo({
  subsets: ['latin'],
  // Three weights only. Hierarchy in this design comes from size, spacing and
  // case — not from stacking weights, so more would go unused.
  weight: ['400', '500', '600'],
  variable: '--font-archivo',
  display: 'swap',
});

export const fontVariables = `${displaySerif.variable} ${uiSans.variable}`;
