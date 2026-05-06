import { assetUrlBySourcePath, getRepresentativeAssetUrlForCategory } from "@/lib/catalogAssets";

const legacyAssetPathAliases: Record<string, string> = {
  "/src/assets/shoes/casual/LV #sneaker.jfif": "/src/assets/shoes/casual/lv-sneaker.jfif",
  "/src/assets/shoes/loafers/#MenStyle #MensFashion #CorporateStyle #MensShoe\u2026.jfif":
    "/src/assets/shoes/loafers/mens-style-corporate-loafer.jfif",
  "/src/assets/caps and hats/caps/100% Italian Subalpino linen contemporary baseball\u2026.jfif":
    "/src/assets/caps and hats/caps/cap-italian-subalpino-linen-baseball.jfif",
  "/src/assets/jackets/Half-jackets/PRICES MAY VARY_ Bequeme Textur_ 100% Nylon\u2026.jfif":
    "/src/assets/jackets/Half-jackets/half-jacket-nylon-texture.jfif",
  "/src/assets/jackets/Half-jackets/Shell_ 100% Polyester; Lining_ 100% Polyester\u2026.jfif":
    "/src/assets/jackets/Half-jackets/half-jacket-polyester-shell-lining.jfif",
  "/src/assets/jackets/Half-jackets/_ 95% Polyester, 5% Spandex, _ The vest runs\u2026.jfif":
    "/src/assets/jackets/Half-jackets/half-jacket-poly-spandex-vest.jfif",
  "/src/assets/jackets/Jacket/100% recycled polyester puffer jacket will a\u2026.jfif":
    "/src/assets/jackets/Jacket/jacket-recycled-polyester-puffer.jfif",
  "/src/assets/Polo shirts/knitted polo/Machine washable_ Main 85% Cotton, 15% Kapok\u2026.jfif":
    "/src/assets/Polo shirts/knitted polo/knitted-polo-machine-washable-kapok.jfif",
  "/src/assets/Polo shirts/knitted polo/Package Included_ 1_PoloComposition_ 95%\u2026.jfif":
    "/src/assets/Polo shirts/knitted polo/knitted-polo-package-included.jfif",
  "/src/assets/Polo shirts/polos/Machine washable_ 56% Cotton, 38% LENZING\u2122\u2026.jfif":
    "/src/assets/Polo shirts/polos/polo-machine-washable-lenzing.jfif",
};

export const siteHeroSuitUrl =
  getRepresentativeAssetUrlForCategory("suits") ??
  getRepresentativeAssetUrlForCategory("shirts") ??
  Object.values(assetUrlBySourcePath)[0] ??
  "";

export const categorySuitsUrl = getRepresentativeAssetUrlForCategory("suits") ?? siteHeroSuitUrl;
export const categoryShoesUrl = getRepresentativeAssetUrlForCategory("shoes") ?? siteHeroSuitUrl;

function toOptimizedVariants(src: string): string[] {
  const avif = src.replace(/\.(jpg|jpeg|png|jfif)$/i, ".avif");
  const webp = src.replace(/\.(jpg|jpeg|png|jfif)$/i, ".webp");
  return [avif, webp];
}

export function canonicalizeAssetSourcePath(src: string | null | undefined): string | null {
  if (!src) return null;
  if (!src.startsWith("/src/assets/")) return src;
  return legacyAssetPathAliases[src] ?? src;
}

export function hasResolvableAssetSourcePath(src: string | null | undefined): boolean {
  const canonicalSrc = canonicalizeAssetSourcePath(src);
  if (!canonicalSrc || !canonicalSrc.startsWith("/src/assets/")) return false;

  const [avifKey, webpKey] = toOptimizedVariants(canonicalSrc);
  return Boolean(
    assetUrlBySourcePath[avifKey] ||
    assetUrlBySourcePath[webpKey] ||
    assetUrlBySourcePath[canonicalSrc],
  );
}

export function resolveImage(src: string | null | undefined): string {
  if (!src) return siteHeroSuitUrl;
  if (!src.startsWith("/src/assets/")) return src;

  const canonicalSrc = canonicalizeAssetSourcePath(src);
  if (!canonicalSrc) return siteHeroSuitUrl;

  const [avifKey, webpKey] = toOptimizedVariants(canonicalSrc);
  if (assetUrlBySourcePath[canonicalSrc]) return assetUrlBySourcePath[canonicalSrc];
  if (assetUrlBySourcePath[avifKey]) return assetUrlBySourcePath[avifKey];
  if (assetUrlBySourcePath[webpKey]) return assetUrlBySourcePath[webpKey];
  return siteHeroSuitUrl;
}
