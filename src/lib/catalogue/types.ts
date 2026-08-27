import type { RoutineStep, SkinType } from '@/lib/db/schema';

/**
 * Read models for the storefront.
 *
 * Pages never receive raw database rows. These shapes are what queries return
 * and what components consume, which means a schema change cannot silently
 * leak a new column (an internal note, a cost price, a customer's email) into
 * a server-rendered payload.
 */

export type VariantView = {
  id: string;
  sku: string;
  name: string;
  /** List price in cents. */
  price: number;
  /** Sale price in cents, or null. */
  salePrice: number | null;
  /** `salePrice ?? price` — the amount actually charged. */
  effectivePrice: number;
  onSale: boolean;
  discountPercent: number;
  volumeMl: number | null;
  imageUrl: string | null;
  isDefault: boolean;
  /** Sellable units: onHand − reserved. Never negative. */
  available: number;
  inStock: boolean;
  lowStock: boolean;
};

export type MediaView = {
  url: string;
  alt: string;
  width: number | null;
  height: number | null;
};

/** What a product card needs — nothing more, so lists stay cheap. */
export type ProductCardView = {
  id: string;
  slug: string;
  name: string;
  subtitle: string | null;
  brandName: string;
  brandSlug: string;
  image: MediaView | null;
  /** Second shot, revealed on hover. Null when the product has only one. */
  hoverImage: MediaView | null;
  fromPrice: number;
  effectivePrice: number;
  salePrice: number | null;
  onSale: boolean;
  discountPercent: number;
  ratingAverage: number;
  ratingCount: number;
  inStock: boolean;
  lowStock: boolean;
  isNew: boolean;
  variantCount: number;
  /** The variant a quick-add would put in the bag. */
  defaultVariantId: string | null;
};

export type ProductDetailView = ProductCardView & {
  description: string | null;
  excerpt: string | null;
  benefits: string[];
  howToUse: string | null;
  ingredientsList: string | null;
  suitableSkinTypes: SkinType[];
  routineStep: RoutineStep | null;
  categoryName: string | null;
  categorySlug: string | null;
  media: MediaView[];
  variants: VariantView[];
  concerns: { name: string; slug: string }[];
  keyIngredients: {
    name: string;
    slug: string;
    benefitSummary: string | null;
  }[];
  seoTitle: string | null;
  seoDescription: string | null;
};

export type ProductFilters = {
  categorySlugs?: string[];
  brandSlugs?: string[];
  concernSlugs?: string[];
  collectionSlug?: string;
  skinTypes?: SkinType[];
  /** Cents, inclusive. */
  minPrice?: number;
  maxPrice?: number;
  inStockOnly?: boolean;
  onSaleOnly?: boolean;
  search?: string;
};

export const PRODUCT_SORTS = [
  'featured',
  'newest',
  'price-asc',
  'price-desc',
  'rating',
  'name',
] as const;

export type ProductSort = (typeof PRODUCT_SORTS)[number];

export type ProductListResult = {
  items: ProductCardView[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

/** Facet counts for the PLP sidebar, computed against the active filters. */
export type FacetOption = {
  slug: string;
  name: string;
  count: number;
};

export type ProductFacets = {
  brands: FacetOption[];
  categories: FacetOption[];
  concerns: FacetOption[];
  skinTypes: FacetOption[];
  priceRange: { min: number; max: number };
};
