import { getCatalogGroupBySlug } from "@/lib/catalogTaxonomy";
import { inferSubcategory } from "@/lib/subcategories";

type AssetModuleMap = Record<string, string>;

const allAssetModules = import.meta.glob("../assets/**/*.{jpg,jpeg,png,webp,avif,jfif}", {
  eager: true,
  import: "default",
}) as AssetModuleMap;

const SOURCE_IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".jfif"];
const OPTIMIZED_IMAGE_EXTENSIONS = new Set([".webp", ".avif"]);
const EXCLUDED_TOP_LEVEL_DIRS = new Set(["catalog", "fashions"]);
const EXCLUDED_SEGMENTS = ["_files"];
const GENERIC_FILE_PATTERNS = [
  /^download(?:\s*\(\d+\))?$/i,
  /^oip(?:\s*\(\d+\))?$/i,
  /^image(?:\s*\(\d+\))?$/i,
  /^item$/i,
  /^th(?:\(\d+\))?$/i,
];

const PREFERRED_REPRESENTATIVE_FILE_PATTERNS: Record<string, RegExp[]> = {
  "belt and ties": [/leather-belt-with-plaque-buckle/i],
  blazers: [/^oip\s*\(1\)\.webp$/i, /^download\.webp$/i],
  "caps and hats": [/^8iabrxerT\.jpg$/i, /caps?/i],
  jackets: [/jacket-blazer-black-01\.webp$/i, /blazer/i],
  "khaki-pants": [/cargohose-herren-fruhling-herbst-baumwolle/i],
  linen: [/yellow-solid-short-sleeve-linen-shirt/i],
  "polo shirts": [/knitwear polish an everyday icon/i, /polo/i],
  shirts: [/shirt-formal-white-01\.jpg$/i, /formal/i],
  shoes: [/shoes-formal-brown-03\.webp$/i, /formal/i],
  socks: [/socks-quality-materials-dress-socks-made-with-fine/i],
  suits: [/suits-rockefeller-collection-double-breasted-stripe/i],
  sweaters: [/oip\s*\(19\)\.webp$/i, /sweater/i],
  tracksuits: [/tracksuit/i, /jogger/i],
  trousers: [/trousers-spring-autumn-smart-jeans-business-fashion/i],
};

export type CatalogAsset = {
  id: string;
  slugKey: string;
  image: string;
  url: string;
  fileName: string;
  categorySlug: string;
  categoryName: string;
  subcategoryName: string | null;
  title: string;
  topFolder: string;
  subFolder: string | null;
  tags: string[];
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function titleCase(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function toSourceAssetPath(modulePath: string) {
  return modulePath.replace(/^..\/assets\//, "/src/assets/").replace(/\\/g, "/");
}

function getPathSegments(modulePath: string) {
  return modulePath
    .replace(/\\/g, "/")
    .replace(/^..\/assets\//, "")
    .split("/");
}

function hasSourceImageForOptimizedAsset(modulePath: string) {
  const normalizedPath = modulePath.replace(/\\/g, "/");
  const extensionMatch = normalizedPath.match(/\.[^.]+$/);
  if (!extensionMatch) return false;

  const extension = extensionMatch[0]?.toLowerCase();
  if (!extension || !OPTIMIZED_IMAGE_EXTENSIONS.has(extension)) return false;

  const basePath = normalizedPath.slice(0, -extension.length);
  return SOURCE_IMAGE_EXTENSIONS.some((sourceExtension) =>
    Object.prototype.hasOwnProperty.call(allAssetModules, `${basePath}${sourceExtension}`),
  );
}

function isExcludedAssetPath(segments: string[]) {
  if (segments.length < 2) return true;
  const [topLevel] = segments;
  if (EXCLUDED_TOP_LEVEL_DIRS.has(String(topLevel).toLowerCase())) return true;
  return segments.some((segment) =>
    EXCLUDED_SEGMENTS.some((excluded) => segment.toLowerCase().includes(excluded)),
  );
}

function looksGenericFile(fileName: string) {
  const stem = fileName.replace(/\.[^.]+$/, "");
  return GENERIC_FILE_PATTERNS.some((pattern) => pattern.test(stem));
}

function trimLeadingCategoryNoise(
  baseText: string,
  topFolder: string,
  subFolder: string | null,
  categorySlug: string,
) {
  let output = baseText;
  const prefixes = [
    slugify(categorySlug),
    slugify(topFolder),
    slugify(subFolder ?? ""),
    "cat",
    "hero",
  ].filter(Boolean);

  for (const prefix of prefixes) {
    const prefixPattern = new RegExp(`^${prefix}-+`, "i");
    output = output.replace(prefixPattern, "");
  }

  return output;
}

function normalizeCategorySlug(topFolder: string, subFolder: string | null, fileName: string) {
  const joined = `${topFolder} ${subFolder ?? ""} ${fileName}`.toLowerCase();

  if (topFolder.toLowerCase() === "khaki-pants") return "trousers";
  if (topFolder.toLowerCase() === "polo shirts") return "polo-t-shirts";
  if (topFolder.toLowerCase() === "tracksuits") return "track-suits";
  if (topFolder.toLowerCase() === "belt and ties") return "belts-ties";
  if (topFolder.toLowerCase() === "caps and hats") return "caps-hats";
  if (topFolder.toLowerCase() === "socks") return "socks";
  if (subFolder && /t-?shirts?/.test(subFolder.toLowerCase())) return "t-shirts";

  if (/(sock)/.test(joined)) return "socks";
  if (/(polo)/.test(joined)) return "polo-t-shirts";
  if (/(shoe|loafer|oxford|boot|sandal)/.test(joined)) return "shoes";
  if (
    /(three-piece|3 piece|two-piece|2 piece|wedding suit|suit)/.test(joined) &&
    !/(track)/.test(joined)
  ) {
    return "suits";
  }
  if (/(blazer)/.test(joined)) return "blazers";
  if (/(track|jogger|athleisure)/.test(joined)) return "track-suits";
  if (/(jacket|coat|bomber|gilet|vest)/.test(joined)) return "jackets";
  if (/(khaki|chino|jean|gurkha|trouser|pant)/.test(joined)) return "trousers";
  if (/(linen)/.test(joined)) return "linen";
  if (/(cap|hat)/.test(joined)) return "caps-hats";
  if (/(belt|tie)/.test(joined)) return "belts-ties";
  if (/(sweater|knitwear|cardigan|pullover)/.test(joined)) return "sweaters";
  if (/(t-shirt|tee|sweat-shirt|sweatshirt|round-neck|round neck|v-neck|v neck)/.test(joined)) {
    return "t-shirts";
  }
  if (/(shirt|presidential)/.test(joined)) return "shirts";

  return slugify(topFolder);
}

function inferSubcategoryFromFolders(
  categorySlug: string,
  topFolder: string,
  subFolder: string | null,
  fileName: string,
) {
  const text = `${topFolder} ${subFolder ?? ""} ${fileName}`.toLowerCase();

  if (categorySlug === "polo-t-shirts") {
    return /knitted|knit/.test(text) ? "Knitted Polos" : "Polos";
  }
  if (categorySlug === "shoes") {
    if (/formal/.test(text)) return "Formal shoes";
    if (/boot/.test(text)) return "Boots";
    if (/sandal/.test(text)) return "Sandals";
    if (/loafer/.test(text)) return "Loafers";
    return "Casual";
  }
  if (categorySlug === "shirts") {
    if (/presidential/.test(text)) return "Presidential";
    if (/formal|dress|oxford|button-down|button down/.test(text)) return "Formal shirts";
    return "Casual";
  }
  if (categorySlug === "suits") {
    return /three|3 piece|3-piece|three-piece/.test(text) ? "Three piece" : "Two piece";
  }
  if (categorySlug === "jackets") {
    if (/denim/.test(text)) return "Denim Jackets";
    if (/half|vest|gilet/.test(text)) return "Half jackets";
    return "Jackets";
  }
  if (categorySlug === "trousers") {
    if (/khaki/.test(text)) return "Khaki";
    if (/chino/.test(text)) return "Chino";
    if (/jean|denim/.test(text)) return "Jeans";
    if (/gurkha/.test(text)) return "Gurkha";
    return "Formal";
  }
  if (categorySlug === "linen") {
    if (/line set|linen set|set/.test(text)) return "Linen Set";
    if (/trouser|pant/.test(text)) return "Linen Trousers";
    if (/shirt/.test(text)) return "Linen shirts";
    if (/short/.test(text)) return "Linen shorts";
    return "Linen Set";
  }
  if (categorySlug === "caps-hats") {
    return /hat/.test(text) ? "Hats" : "Caps";
  }
  if (categorySlug === "belts-ties") {
    return /tie/.test(text) ? "Ties" : "Belts";
  }
  if (categorySlug === "t-shirts") {
    return inferSubcategory(categorySlug, text) ?? "Round-neck T-shirts";
  }

  return null;
}

function buildAssetTitle(
  fileName: string,
  topFolder: string,
  subFolder: string | null,
  categorySlug: string,
  fallbackLabel: string,
) {
  if (looksGenericFile(fileName)) return fallbackLabel;

  const stem = trimLeadingCategoryNoise(
    slugify(fileName.replace(/\.[^.]+$/, "")),
    topFolder,
    subFolder,
    categorySlug,
  );
  const words = stem.split("-").filter(Boolean);
  if (words.length < 2) return fallbackLabel;

  return titleCase(words.slice(0, 12).join(" "));
}

const assetUrlBySourcePathEntries = new Map<string, string>();
for (const [modulePath, url] of Object.entries(allAssetModules)) {
  const sourcePath = toSourceAssetPath(modulePath);
  const extension = modulePath.replace(/^.*(\.[^.]+)$/, "$1").toLowerCase();
  const isOptimized = OPTIMIZED_IMAGE_EXTENSIONS.has(extension);
  const existing = assetUrlBySourcePathEntries.get(sourcePath);
  if (existing && isOptimized) continue;
  assetUrlBySourcePathEntries.set(sourcePath, url);
}

export const assetUrlBySourcePath = Object.fromEntries(assetUrlBySourcePathEntries) as Record<
  string,
  string
>;

const rawCatalogAssets = Object.entries(allAssetModules)
  .map(([modulePath, url]) => {
    if (hasSourceImageForOptimizedAsset(modulePath)) return null;

    const segments = getPathSegments(modulePath);
    if (isExcludedAssetPath(segments)) return null;

    const fileName = segments[segments.length - 1] ?? "";
    const topFolder = segments[0] ?? "";
    const subFolder = segments.length > 2 ? segments[1] : null;
    const categorySlug = normalizeCategorySlug(topFolder, subFolder, fileName);
    const group = getCatalogGroupBySlug(categorySlug);
    if (!group) return null;

    return {
      url,
      image: toSourceAssetPath(modulePath),
      fileName,
      topFolder,
      subFolder,
      categorySlug,
      categoryName: group.name,
      subcategoryName: inferSubcategoryFromFolders(categorySlug, topFolder, subFolder, fileName),
    };
  })
  .filter(Boolean) as Array<{
  url: string;
  image: string;
  fileName: string;
  topFolder: string;
  subFolder: string | null;
  categorySlug: string;
  categoryName: string;
  subcategoryName: string | null;
}>;

rawCatalogAssets.sort((a, b) =>
  `${a.categorySlug} ${a.subcategoryName ?? ""} ${a.fileName}`.localeCompare(
    `${b.categorySlug} ${b.subcategoryName ?? ""} ${b.fileName}`,
  ),
);

const groupCounters = new Map<string, number>();

export const catalogAssets: CatalogAsset[] = rawCatalogAssets.map((asset) => {
  const counterKey = `${asset.categorySlug}::${asset.subcategoryName ?? "all"}`;
  const nextIndex = (groupCounters.get(counterKey) ?? 0) + 1;
  groupCounters.set(counterKey, nextIndex);

  const fallbackLabel = asset.subcategoryName
    ? `${asset.subcategoryName} Style ${String(nextIndex).padStart(2, "0")}`
    : `${asset.categoryName} Style ${String(nextIndex).padStart(2, "0")}`;
  const title = buildAssetTitle(
    asset.fileName,
    asset.topFolder,
    asset.subFolder,
    asset.categorySlug,
    fallbackLabel,
  );

  return {
    id: asset.image,
    slugKey: `${asset.categorySlug}-${asset.subcategoryName ?? "all"}-${slugify(asset.fileName)}`,
    image: asset.image,
    url: asset.url,
    fileName: asset.fileName,
    categorySlug: asset.categorySlug,
    categoryName: asset.categoryName,
    subcategoryName: asset.subcategoryName,
    title,
    topFolder: asset.topFolder,
    subFolder: asset.subFolder,
    tags: [
      asset.categorySlug,
      slugify(asset.topFolder),
      slugify(asset.subFolder ?? ""),
      slugify(title),
    ].filter(Boolean),
  };
});

export function getCatalogAssetsForCategory(categorySlug: string) {
  return catalogAssets.filter((asset) => asset.categorySlug === categorySlug);
}

export function getCatalogAssetsForExactFolder(categorySlug: string) {
  return catalogAssets.filter((asset) => slugify(asset.topFolder) === categorySlug);
}

export function getBlazerShowcaseAssets() {
  return getCatalogAssetsForCategory("jackets").filter((asset) => /blazer/i.test(asset.fileName));
}

export function getRepresentativeAssetForCategory(categorySlug: string) {
  const exactMatches =
    categorySlug === "blazers"
      ? getBlazerShowcaseAssets()
      : getCatalogAssetsForExactFolder(categorySlug);
  const matches =
    exactMatches.length > 0 ? exactMatches : getCatalogAssetsForCategory(categorySlug);
  if (matches.length === 0) return null;

  const preferredPatterns = PREFERRED_REPRESENTATIVE_FILE_PATTERNS[categorySlug] ?? [];
  for (const pattern of preferredPatterns) {
    const preferred = matches.find(
      (asset) => pattern.test(asset.fileName) || pattern.test(asset.title),
    );
    if (preferred) return preferred;
  }

  const ranked = [...matches].sort((a, b) => {
    const aScore = looksGenericFile(a.fileName) ? 2 : 0;
    const bScore = looksGenericFile(b.fileName) ? 2 : 0;
    const aHero = /hero|cat|cover/.test(a.fileName.toLowerCase()) ? -1 : 0;
    const bHero = /hero|cat|cover/.test(b.fileName.toLowerCase()) ? -1 : 0;
    return aScore + aHero - (bScore + bHero);
  });

  return ranked[0] ?? matches[0];
}

export function getRepresentativeImageForCategory(categorySlug: string) {
  return getRepresentativeAssetForCategory(categorySlug)?.image ?? null;
}

export function getRepresentativeAssetUrlForCategory(categorySlug: string) {
  return getRepresentativeAssetForCategory(categorySlug)?.url ?? null;
}
