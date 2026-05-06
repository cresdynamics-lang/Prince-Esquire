import type { ProductCardData } from "@/components/site/ProductCard";
import { canonicalizeAssetSourcePath } from "@/lib/assetMap";
import { catalogAssets, getCatalogAssetsForCategory } from "@/lib/catalogAssets";
import { buildProductDescription, inferCategorySlugFromText } from "@/lib/productCopy";

export function fashionSlugFromFilename(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const PRICE_RANGE_BY_CATEGORY: Record<string, { min: number; max: number }> = {
  "polo-t-shirts": { min: 2200, max: 5200 },
  shoes: { min: 8500, max: 22000 },
  shirts: { min: 2500, max: 8500 },
  suits: { min: 15000, max: 55000 },
  blazers: { min: 10000, max: 30000 },
  "track-suits": { min: 5500, max: 18000 },
  jackets: { min: 7000, max: 28000 },
  trousers: { min: 3200, max: 12000 },
  linen: { min: 3800, max: 18000 },
  "caps-hats": { min: 900, max: 4500 },
  "belts-ties": { min: 1200, max: 6000 },
  socks: { min: 500, max: 2500 },
  sweaters: { min: 2500, max: 12000 },
  "t-shirts": { min: 1500, max: 6000 },
};

function hashSeed(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) % 100000;
  }
  return hash;
}

function estimateFashionPrice(category: string, slug: string): number {
  const range = PRICE_RANGE_BY_CATEGORY[category] ?? { min: 5000, max: 10000 };
  const steps = Math.max(1, Math.floor((range.max - range.min) / 500));
  const stepIndex = hashSeed(slug) % (steps + 1);
  return range.min + stepIndex * 500;
}

function normalizeLookupText(value: string | null | undefined): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildGroupKey(categorySlug: string, subcategoryName: string | null | undefined) {
  return `${categorySlug}::${normalizeLookupText(subcategoryName) || "all"}`;
}

function assetToProductCard(asset: (typeof catalogAssets)[number]): ProductCardData {
  const slug = fashionSlugFromFilename(asset.slugKey);
  return {
    id: `asset:${slug}`,
    slug,
    title: asset.title,
    price: estimateFashionPrice(asset.categorySlug, slug),
    sale_price: null,
    image: asset.image,
    category_name: asset.categoryName,
    category_slug: asset.categorySlug,
    subcategory_name: asset.subcategoryName,
  };
}

function assetToProductDetail(asset: (typeof catalogAssets)[number]): FashionProductDetail {
  const slug = fashionSlugFromFilename(asset.slugKey);
  const price = estimateFashionPrice(asset.categorySlug, slug);
  return {
    kind: "fashion",
    id: `asset:${slug}`,
    slug,
    title: asset.title,
    description: buildProductDescription({
      title: asset.title,
      categorySlug: asset.categorySlug,
      categoryName: asset.categoryName,
      subcategoryName: asset.subcategoryName,
    }),
    image: asset.image,
    price,
    salePrice: null,
    categorySlug: asset.categorySlug,
    categoryName: asset.categoryName,
    subcategoryName: asset.subcategoryName,
  };
}

const catalogProductDetailBySlug = new Map(
  catalogAssets.map((asset) => {
    const detail = assetToProductDetail(asset);
    return [detail.slug, detail] as const;
  }),
);

const catalogProductDetailByImage = new Map(
  Array.from(catalogProductDetailBySlug.values()).map((detail) => [
    canonicalizeAssetSourcePath(detail.image) ?? detail.image,
    detail,
  ]),
);

const catalogProductDetailsByCategory = new Map<string, FashionProductDetail[]>();
const catalogProductDetailsByCategoryAndSubcategory = new Map<string, FashionProductDetail[]>();
for (const detail of catalogProductDetailBySlug.values()) {
  const categoryList = catalogProductDetailsByCategory.get(detail.categorySlug) ?? [];
  categoryList.push(detail);
  catalogProductDetailsByCategory.set(detail.categorySlug, categoryList);

  const groupKey = buildGroupKey(detail.categorySlug, detail.subcategoryName);
  const groupList = catalogProductDetailsByCategoryAndSubcategory.get(groupKey) ?? [];
  groupList.push(detail);
  catalogProductDetailsByCategoryAndSubcategory.set(groupKey, groupList);
}

export type FashionProductLookup = {
  slug?: string | null;
  title?: string | null;
  image?: string | null;
  categorySlug?: string | null;
  categoryName?: string | null;
  subcategoryName?: string | null;
};

function pickBestDetailFromList(
  list: FashionProductDetail[],
  lookup: FashionProductLookup,
): FashionProductDetail | null {
  if (list.length === 0) return null;

  const titleText = normalizeLookupText(lookup.title);
  if (titleText) {
    const exact = list.find((detail) => normalizeLookupText(detail.title) === titleText);
    if (exact) return exact;

    const tokens = titleText.split(" ").filter((token) => token.length >= 3);
    let best: FashionProductDetail | null = null;
    let bestScore = 0;

    for (const detail of list) {
      const haystack = normalizeLookupText(detail.title);
      let score = 0;
      for (const token of tokens) {
        if (haystack.includes(token)) score += 1;
      }
      if (score > bestScore) {
        bestScore = score;
        best = detail;
      }
    }

    if (best && bestScore >= Math.min(2, tokens.length || 0)) {
      return best;
    }
  }

  const seed =
    `${lookup.slug ?? ""} ${lookup.title ?? ""} ${lookup.image ?? ""}`.trim() || list[0]?.slug;
  return list[hashSeed(seed) % list.length] ?? list[0] ?? null;
}

export function getCatalogFallbackForProduct(
  lookup: FashionProductLookup,
): FashionProductDetail | null {
  const slug = lookup.slug?.trim();
  if (slug) {
    const direct = catalogProductDetailBySlug.get(slug);
    if (direct) return direct;
  }

  const image = canonicalizeAssetSourcePath(lookup.image);
  if (image) {
    const direct = catalogProductDetailByImage.get(image);
    if (direct) return direct;
  }

  const categorySlug =
    lookup.categorySlug?.trim() ||
    inferCategorySlugFromText(
      `${lookup.title ?? ""} ${lookup.categoryName ?? ""} ${lookup.subcategoryName ?? ""}`,
    );
  const normalizedSubcategory = normalizeLookupText(lookup.subcategoryName);
  if (categorySlug) {
    if (normalizedSubcategory) {
      const grouped = catalogProductDetailsByCategoryAndSubcategory.get(
        buildGroupKey(categorySlug, normalizedSubcategory),
      );
      const groupedMatch = pickBestDetailFromList(grouped ?? [], lookup);
      if (groupedMatch) return groupedMatch;
    }

    const categoryMatch = pickBestDetailFromList(
      catalogProductDetailsByCategory.get(categorySlug) ?? [],
      lookup,
    );
    if (categoryMatch) return categoryMatch;
  }

  return pickBestDetailFromList(Array.from(catalogProductDetailBySlug.values()), lookup);
}

export function fashionProductsAsCards(): ProductCardData[] {
  return dedupeProductsBySlugPreferOrder(catalogAssets.map(assetToProductCard));
}

export function fashionProductsForCategorySlug(pageSlug: string): ProductCardData[] {
  return dedupeProductsBySlugPreferOrder(
    getCatalogAssetsForCategory(pageSlug).map(assetToProductCard),
  );
}

export type FashionProductDetail = {
  kind: "fashion";
  id: string;
  slug: string;
  title: string;
  description: string;
  image: string;
  price: number;
  salePrice: number | null;
  categorySlug: string;
  categoryName: string;
  subcategoryName?: string | null;
};

export function getFashionProductBySlug(slug: string): FashionProductDetail | null {
  return catalogProductDetailBySlug.get(slug) ?? null;
}

export function mergeCatalogFallbackIntoCard(product: ProductCardData): ProductCardData {
  const fallback = getCatalogFallbackForProduct({
    slug: product.slug,
    title: product.title,
    image: product.image,
    categorySlug: product.category_slug,
    categoryName: product.category_name,
    subcategoryName: product.subcategory_name,
  });
  if (!fallback) return product;

  const shouldPreferAssetImage = !product.image || product.image.startsWith("/src/assets/");

  return {
    ...product,
    title: product.title?.trim() || fallback.title,
    image: shouldPreferAssetImage ? fallback.image : product.image,
    category_name: product.category_name ?? fallback.categoryName,
    category_slug: product.category_slug ?? fallback.categorySlug,
    subcategory_name: product.subcategory_name ?? fallback.subcategoryName ?? null,
  };
}

export function dedupeProductsBySlugPreferOrder(products: ProductCardData[]): ProductCardData[] {
  const seenSlugs = new Set<string>();
  const seenIdentity = new Set<string>();
  const out: ProductCardData[] = [];
  for (const product of products) {
    const slugKey = normalizeLookupText(product.slug);
    const identityKey = [
      normalizeLookupText(product.title),
      normalizeLookupText(product.category_slug),
      normalizeLookupText(product.category_name),
      normalizeLookupText(product.subcategory_name),
      normalizeLookupText(product.image),
    ].join("::");
    if (seenSlugs.has(slugKey) || seenIdentity.has(identityKey)) continue;
    seenSlugs.add(slugKey);
    seenIdentity.add(identityKey);
    out.push(product);
  }
  return out;
}

export function dedupeProductCardsStable(products: ProductCardData[]): ProductCardData[] {
  const seenIds = new Set<string>();
  const byId = products.filter((product) => {
    if (seenIds.has(product.id)) return false;
    seenIds.add(product.id);
    return true;
  });
  return dedupeProductsBySlugPreferOrder(byId);
}
