/**
 * Hand-verified official product pages.
 *
 * The automated harvest covers the brands that publish a machine-readable
 * catalogue (Shopify JSON, JSON-LD, a usable sitemap). The rest — Garnier,
 * Cetaphil, La Roche-Posay, Eucerin, Purito, Revuele, Ferrero Rocher — either
 * block automated requests or split their catalogue across country sites, so
 * their products are resolved one at a time against the manufacturer's own
 * page and recorded here.
 *
 * Every entry is a factual transcription from the URL given. `retrievedAt` is
 * the date the page was read. Nothing in this file is inferred, and no entry
 * exists for a product whose exact identity could not be confirmed.
 *
 * Images are recorded as source URLs only. They are downloaded, hashed and
 * re-encoded into `public/media/products/` by `media-fetch.ts`; the storefront
 * never hot-links a manufacturer URL.
 */

export type ManualSource = {
  url: string;
  title: string;
  retrievedAt: string;
  size?: string;
  description?: string;
  ingredients?: string;
  howToUse?: string;
  images?: string[];
};

export const MANUAL_SOURCES: Record<string, ManualSource> = {};

/**
 * Products whose official page *was* harvested but which the automatic matcher
 * left just under threshold, because our inventory title and the brand's own
 * title describe the same item in different words.
 *
 * Pinning by URL rather than lowering the threshold globally keeps the matcher
 * strict for the other 80 products. Each entry states the evidence that makes
 * the identification certain.
 */
export const MANUAL_MATCHES: Record<string, { url: string; evidence: string }> =
  {
    SK80CT0146: {
      url: 'https://www.cosrx.com/products/advanced-snail-92-all-in-one-cream',
      evidence:
        'Listed as "COSRX Snail Mucin 92% Face Moisturizer, 3.52 Oz". The PDF\'s own blurb names it: "The Advanced Snail 92 All In One Cream by COSRX". 3.52 fl oz = 100ml, the jar size COSRX sells.',
    },
    SK80CT0115: {
      url: 'https://skin1004.com/products/skin1004-madagascar-centella-ampoule-foam',
      evidence:
        'Listed as "Madagascar Centella Ampoule Foam 4.22 fl.oz, 125ml, Low pH Foam Cleanser". SKIN1004 sells this as "Centella Ampoule Foam" in 20ml and 125ml; 4.22 fl oz = 125ml.',
    },
    SK80CT0116: {
      url: 'https://skin1004.com/products/skin1004-madagascar-centella-ampoule',
      evidence:
        'Listed as "Madagascar Centella Asiatica Ampoule Facial Serum 1.85 fl.oz, 55ml". SKIN1004 sells this as "Centella Ampoule" in 30ml/55ml/100ml; 1.85 fl oz = 55ml.',
    },
    SK80CT0155: {
      url: 'https://www.garnier.co.uk/our-brands/body-care/superfood/mango',
      evidence:
        'Listed as "Garnier Body Lotion Mango", alongside sibling listings for Avocado, Cocoa and Oat Milk — the Garnier Body Superfood range. This is the range\'s mango variant; Garnier\'s own title for it is "Vitamin C Nutri-Glow Body Cream".',
    },
    SK80CT0083: {
      url: 'https://www.cetaphil.com/us/products/product-categories/all-moisturizers/moisturizing-cream/302993917564.html',
      evidence:
        'Listed as "Cetaphil - Moistursing Cream Dry to very Dry, Sensitive Skin". Cetaphil Moisturizing Cream is sold with exactly that descriptor ("for dry to very dry, sensitive skin"); it is the only cream in the range carrying it.',
    },
    SK80CT0081: {
      url: 'https://www.cetaphil.com/us/products/product-categories/all-cleansers/cetaphil-daily-facial-cleanser/302993927341.html',
      evidence:
        'Listed as "Cetaphil - Oily Cleanser Combination to Oily, Sensitive Skin". Cetaphil Daily Facial Cleanser is the range\'s cleanser for combination-to-oily sensitive skin, and carries that descriptor verbatim. (The Gentle Skin Cleanser, matched separately below, is the dry/normal counterpart.)',
    },
    SK80CT0082: {
      url: 'https://www.cetaphil.com/us/products/product-categories/all-cleansers/cetaphil-gentle-skin-cleanser/302990110227.html',
      evidence:
        'Listed as "Cetaphil Gentle Skin Cleanser, Face & Body Wash 236ml". Exact product-name match; 236ml is the 8oz bottle Cetaphil sells.',
    },
    SK80CT0143: {
      url: 'https://www.laroche-posay.co.uk/en_GB/anthelios-uvmune-400-hydrating-cream-spf50-for-sensitive-skin-50ml/LRP_030.html',
      evidence:
        'Listed as "Anthelios UVMune 400 Moisturizing Cream SPF50 Fragrance Free 50ml". La Roche-Posay sells this as "Anthelios UVMune 400 Hydrating Cream SPF50+", fragrance-free, 50ml — same product, UK naming. Distinct from the Hydrating *Tinted* Cream, which is a separate listing.',
    },
    SK80CT0142: {
      url: 'https://www.laroche-posay.co.uk/en_GB/anthelios-uvmune-oil-control-gel-cream-spf50/LRP_162.html',
      evidence:
        'Listed as "ANTHELIOS UVMUNE 400 Oil Control Dry Touch Gel-Cream SPF50+ 50ml". The UK page carries the display name "Anthelios Anti-Shine SPF50+" but its own URL is anthelios-uvmune-oil-control-gel-cream-spf50 — the same oil-control gel-cream.',
    },
  };
