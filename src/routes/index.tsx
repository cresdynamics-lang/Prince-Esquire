import { createFileRoute, Link } from "@tanstack/react-router";
import { type CSSProperties, useEffect, useState } from "react";
import { ArrowRight, Truck, Store, Sparkles, ShieldCheck, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { FashionGallery } from "@/components/site/FashionGallery";
import { ProductCard, type ProductCardData } from "@/components/site/ProductCard";
import { fashionGalleryItems } from "@/lib/fashionGallery";
import {
  getCatalogAssetsForCategory,
  getCatalogAssetsForExactFolder,
  getBlazerShowcaseAssets,
  getRepresentativeImageForCategory,
} from "@/lib/catalogAssets";
import { CATALOG_TAXONOMY } from "@/lib/catalogTaxonomy";
import {
  dedupeProductCardsStable,
  dedupeProductsBySlugPreferOrder,
  fashionProductsAsCards,
  mergeCatalogFallbackIntoCard,
} from "@/lib/fashionProducts";
import { resolveImage } from "@/lib/assetMap";
import { resolveSubcategory } from "@/lib/subcategories";
import { siteHeroSuitUrl as heroImg } from "@/lib/assetMap";
import { fetchDeletedProductSlugs } from "@/lib/productDeletion";

function pickMixedCategories(products: ProductCardData[], limit: number): ProductCardData[] {
  if (products.length <= limit) return products;

  const buckets = new Map<string, ProductCardData[]>();
  for (const product of products) {
    const key = (product.category_name ?? "other").toLowerCase();
    const list = buckets.get(key) ?? [];
    list.push(product);
    buckets.set(key, list);
  }

  const keys = Array.from(buckets.keys());
  const picked: ProductCardData[] = [];
  let guard = 0;

  while (picked.length < limit && guard < 1000) {
    guard += 1;
    let tookAny = false;
    for (const key of keys) {
      if (picked.length >= limit) break;
      const list = buckets.get(key);
      if (!list || list.length === 0) continue;
      picked.push(list.shift()!);
      tookAny = true;
    }
    if (!tookAny) break;
  }

  return picked;
}

function isPresidentialShirt(product: ProductCardData) {
  const text = `${product.title} ${product.subcategory_name ?? ""}`.toLowerCase();
  return product.category_slug === "shirts" && text.includes("presidential");
}

function productImageKey(product: ProductCardData) {
  return product.image ?? `${product.category_slug ?? "uncategorized"}:${product.slug}`;
}

function productIdentityKey(product: ProductCardData) {
  return `${product.slug}:${productImageKey(product)}`;
}

function pickHomepageCategoryMix(products: ProductCardData[], limit: number): ProductCardData[] {
  const priorityBuckets: Array<(product: ProductCardData) => boolean> = [
    (product) => product.category_slug === "suits",
    isPresidentialShirt,
    (product) => product.category_slug === "shirts" && !isPresidentialShirt(product),
    (product) => product.category_slug === "shoes",
    (product) => product.category_slug === "trousers",
    (product) => product.category_slug === "blazers",
    (product) => product.category_slug === "linen",
    (product) => product.category_slug === "jackets",
  ];
  const used = new Set<string>();
  const buckets = priorityBuckets.map((matches) =>
    products.filter((product) => {
      const key = productIdentityKey(product);
      if (used.has(key) || !matches(product)) return false;
      used.add(key);
      return true;
    }),
  );
  const picked: ProductCardData[] = [];

  while (picked.length < limit && buckets.some((bucket) => bucket.length > 0)) {
    for (const bucket of buckets) {
      if (picked.length >= limit) break;
      const next = bucket.shift();
      if (next) picked.push(next);
    }
  }

  const selectedImages = new Set(picked.map(productImageKey));
  for (const product of products) {
    if (picked.length >= limit) break;
    if (selectedImages.has(productImageKey(product))) continue;
    picked.push(product);
    selectedImages.add(productImageKey(product));
  }

  return picked;
}

function excludeProductsByImages(products: ProductCardData[], excluded: ProductCardData[]) {
  const excludedImages = new Set(excluded.map(productImageKey));
  const excludedSlugs = new Set(excluded.map((product) => product.slug));
  return products.filter(
    (product) => !excludedImages.has(productImageKey(product)) && !excludedSlugs.has(product.slug),
  );
}

function cardRevealStyle(index: number): CSSProperties {
  return { "--card-index": index } as CSSProperties;
}

function categoryFeatureList(category: (typeof CATALOG_TAXONOMY)[number]) {
  const subcategoryCopy =
    category.subcategories.length > 0
      ? `Includes ${category.subcategories.slice(0, 4).join(", ")}.`
      : `Focused ${category.name.toLowerCase()} edit with clean, easy styling.`;

  return [
    subcategoryCopy,
    "Selected for sharp fit, comfort, and repeat wear.",
    "Easy to pair with the rest of the Prince Esquire wardrobe.",
  ];
}

function pickShowcaseImage(categorySlug: string) {
  const assets =
    categorySlug === "blazers"
      ? getBlazerShowcaseAssets()
      : getCatalogAssetsForExactFolder(categorySlug);
  const primaryImage = getRepresentativeImageForCategory(categorySlug) ?? heroImg;

  if (assets.length === 0) return primaryImage;

  const pickByPattern = (patterns: RegExp[]) =>
    assets.find(
      (asset) =>
        asset.image !== primaryImage && patterns.some((pattern) => pattern.test(asset.fileName)),
    )?.image;

  if (categorySlug === "blazers") {
    return (
      pickByPattern([/navy/i, /charcoal/i, /grey/i, /black/i, /outfit-blazer/i]) ??
      assets.find((asset) => asset.image !== primaryImage)?.image ??
      primaryImage
    );
  }

  if (categorySlug === "socks") {
    return (
      pickByPattern([/hippih/i, /cat-socks-2/i, /quality-materials/i, /best-socks/i]) ??
      assets.find((asset) => asset.image !== primaryImage)?.image ??
      primaryImage
    );
  }

  return primaryImage;
}

type HomepageProductRow = {
  id: string;
  slug: string;
  title: string;
  price: number | string;
  sale_price: number | string | null;
  subcategory?: string | null;
  product_images?: Array<{ image_url: string | null }> | null;
  product_variants?: Array<{ stock_quantity: number | string | null }> | null;
  categories?: { name: string | null; slug: string | null } | null;
};

function homepageRowAsCard(product: HomepageProductRow): ProductCardData {
  return mergeCatalogFallbackIntoCard({
    id: product.id,
    slug: product.slug,
    title: product.title,
    price: Number(product.price),
    sale_price: product.sale_price != null ? Number(product.sale_price) : null,
    image: product.product_images?.[0]?.image_url ?? null,
    category_name: product.categories?.name ?? undefined,
    category_slug: product.categories?.slug ?? undefined,
    subcategory_name: resolveSubcategory(
      product.subcategory,
      product.categories?.slug,
      `${product.title ?? ""} ${product.slug ?? ""}`,
    ),
    stock_quantity_total: (product.product_variants ?? []).reduce(
      (sum, variant) => sum + Number(variant.stock_quantity ?? 0),
      0,
    ),
  });
}

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Prince Esquire - Premium Menswear in Nairobi" },
      {
        name: "description",
        content:
          "Discover tailored suits, dress shirts, leather shoes and more. Premium menswear delivered free across Nairobi.",
      },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  const HOME_SECTION_SIZE = 8;
  const SOCKS_SECTION_SIZE = 4;
  const categorySections = CATALOG_TAXONOMY.map((category) => {
    const representativeImage = pickShowcaseImage(category.slug);
    const representativeAsset = getRepresentativeImageForCategory(category.slug) ?? heroImg;
    const exactFolderImages =
      category.slug === "blazers"
        ? getBlazerShowcaseAssets()
        : getCatalogAssetsForExactFolder(category.slug);

    return {
      ...category,
      image: representativeImage,
      angleImages: (exactFolderImages.length > 0
        ? exactFolderImages
        : getCatalogAssetsForCategory(category.slug)
      )
        .map((asset) => asset.image)
        .filter((image) => image !== representativeImage && image !== representativeAsset)
        .slice(0, 3),
    };
  });
  const heroSlides = CATALOG_TAXONOMY.map((category) => ({
    image: getRepresentativeImageForCategory(category.slug) ?? heroImg,
    title: category.heroTitle,
    body: category.heroBody,
    ctaTo: "/category/$slug" as const,
    ctaLabel: `Shop ${category.name}`,
    ctaParams: { slug: category.slug },
  }));
  const [curated, setCurated] = useState<ProductCardData[]>([]);
  const [featured, setFeatured] = useState<ProductCardData[]>([]);
  const [socksHighlights, setSocksHighlights] = useState<ProductCardData[]>([]);
  const [curatedVisibleCount, setCuratedVisibleCount] = useState(HOME_SECTION_SIZE);
  const [featuredVisibleCount, setFeaturedVisibleCount] = useState(HOME_SECTION_SIZE);
  const [activeSlide, setActiveSlide] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const id = window.setInterval(() => {
      setActiveSlide((s) => (s + 1) % heroSlides.length);
    }, 4500);
    return () => window.clearInterval(id);
  }, [heroSlides.length]);

  useEffect(() => {
    (async () => {
      try {
        const [{ data: featuredProds }, { data: curatedProds }] = await Promise.all([
          supabase
            .from("products")
            .select(
              "id,slug,title,price,sale_price,subcategory,is_featured,product_images(image_url),product_variants(stock_quantity),categories(name,slug)",
            )
            .eq("is_published", true)
            .eq("is_featured", true)
            .limit(16),
          supabase
            .from("products")
            .select(
              "id,slug,title,price,sale_price,subcategory,product_images(image_url),product_variants(stock_quantity),categories(name,slug)",
            )
            .eq("is_published", true)
            .order("created_at", { ascending: false })
            .limit(16),
        ]);

        let prods = featuredProds ?? [];
        if (prods.length === 0) {
          const { data: latestProducts } = await supabase
            .from("products")
            .select(
              "id,slug,title,price,sale_price,subcategory,is_featured,product_images(image_url),product_variants(stock_quantity),categories(name,slug)",
            )
            .eq("is_published", true)
            .order("created_at", { ascending: false })
            .limit(16);
          prods = latestProducts ?? [];
        }

        const mappedCurated = dedupeProductCardsStable(
          ((curatedProds ?? []) as HomepageProductRow[]).map(homepageRowAsCard),
        );
        const mappedFeatured = dedupeProductCardsStable(
          (prods as HomepageProductRow[]).map(homepageRowAsCard),
        );
        const deletedResult = await fetchDeletedProductSlugs(supabase);
        const deletedSlugs = new Set(deletedResult.data);
        const excludeDeleted = (items: ProductCardData[]) =>
          items.filter((item) => !deletedSlugs.has(item.slug));
        const fashionCards = excludeDeleted(fashionProductsAsCards());
        const curatedMerged = dedupeProductsBySlugPreferOrder([
          ...fashionCards,
          ...excludeDeleted(mappedCurated),
        ]);
        const featuredMerged = dedupeProductsBySlugPreferOrder([
          ...excludeDeleted(mappedFeatured),
          ...fashionCards,
        ]);
        const curatedList = pickHomepageCategoryMix(curatedMerged, 16);
        const featuredPool = excludeProductsByImages(featuredMerged, curatedList);
        const featuredList = pickMixedCategories(
          featuredPool.length >= HOME_SECTION_SIZE ? featuredPool : featuredMerged,
          16,
        );
        const socksList = [...featuredMerged, ...curatedMerged]
          .filter((product) => {
            const slugMatch = product.category_slug?.toLowerCase() === "socks";
            const nameMatch = product.category_name?.toLowerCase() === "socks";
            return slugMatch || nameMatch;
          })
          .slice(0, SOCKS_SECTION_SIZE);
        setCurated(curatedList);
        setFeatured(featuredList);
        setSocksHighlights(socksList);
      } catch (error) {
        console.error("Failed to load homepage products", error);
        setCurated([]);
        setFeatured([]);
        setSocksHighlights([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const visibleCurated = curated.slice(0, curatedVisibleCount);
  const visibleFeatured = featured.slice(0, featuredVisibleCount);
  const hasMoreCurated = !loading && visibleCurated.length < curated.length;
  const hasMoreFeatured = !loading && visibleFeatured.length < featured.length;

  return (
    <div className="fade-in">
      <section className="relative overflow-hidden bg-navy text-navy-foreground">
        <div className="absolute inset-0">
          {heroSlides.map((slide, idx) => (
            <img
              key={slide.title}
              src={resolveImage(slide.image)}
              alt={slide.title}
              className={`absolute inset-0 h-full w-full object-cover object-right transition-opacity duration-700 ${idx === activeSlide ? "opacity-80" : "opacity-0"}`}
              loading={idx === 0 ? "eager" : "lazy"}
              decoding="async"
              width={1920}
              height={1080}
            />
          ))}
          <div className="absolute inset-0 bg-gradient-to-r from-navy via-navy/80 to-transparent" />
        </div>
        <div className="container relative mx-auto px-4 py-24 md:py-36 lg:py-44">
          <div className="max-w-xl">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-gold">
              Autumn Collection - 2026
            </p>
            <h1 className="mt-4 font-display text-4xl font-bold leading-[1.05] md:text-6xl lg:text-7xl">
              {heroSlides[activeSlide]?.title}
            </h1>
            <p className="mt-5 max-w-md text-base text-navy-foreground/80 md:text-lg">
              {heroSlides[activeSlide]?.body}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/category/$slug"
                params={heroSlides[activeSlide]?.ctaParams ?? { slug: "suits" }}
              >
                <Button variant="hero" size="lg">
                  {heroSlides[activeSlide]?.ctaLabel} <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
              </Link>
              <Link to="/shop">
                <Button
                  variant="outline"
                  size="lg"
                  className="rounded-full border-navy-foreground/30 bg-transparent px-7 text-navy-foreground hover:bg-navy-foreground/10"
                >
                  Browse All Categories
                </Button>
              </Link>
            </div>
            <div className="mt-6 flex items-center gap-2">
              {heroSlides.map((slide, idx) => (
                <button
                  key={slide.title}
                  type="button"
                  onClick={() => setActiveSlide(idx)}
                  aria-label={`Go to slide ${idx + 1}`}
                  className={`h-2.5 rounded-full transition-all ${idx === activeSlide ? "w-8 bg-gold" : "w-2.5 bg-navy-foreground/50"}`}
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="reveal-section py-16 md:py-24">
        <div className="container mx-auto px-4">
          <div className="mb-10 max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-gold">
              Category Rooms
            </p>
            <h2 className="mt-2 font-display text-3xl font-bold md:text-4xl">
              Browse Every Menswear Category
            </h2>
            <p className="mt-4 text-sm text-muted-foreground md:text-base">
              Each collection now has its own focused section, with a dedicated image and direct
              path into that category.
            </p>
          </div>
        </div>

        <div className="space-y-10">
          {categorySections.map((category, index) => (
            <section
              key={category.slug}
              className={index % 2 === 0 ? "bg-background" : "bg-secondary/35"}
            >
              <div className="container mx-auto px-4 py-8 md:py-12">
                <div
                  className={`category-display-card grid overflow-hidden rounded-md border border-border bg-card shadow-sm md:grid-cols-[0.92fr_1.08fr] ${
                    index % 2 === 1 ? "md:[&>*:first-child]:order-2" : ""
                  }`}
                >
                  <Link
                    to="/category/$slug"
                    params={{ slug: category.slug }}
                    className="group relative block aspect-[16/11] overflow-hidden bg-muted md:aspect-auto md:min-h-[340px]"
                  >
                    <img
                      src={resolveImage(category.image)}
                      alt={category.name}
                      loading={index < 2 ? "eager" : "lazy"}
                      decoding="async"
                      fetchPriority={index < 1 ? "high" : "low"}
                      width={900}
                      height={620}
                      className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-navy/55 via-transparent to-transparent" />
                    {category.angleImages.length > 0 && (
                      <div className="absolute bottom-4 left-4 flex gap-2">
                        {category.angleImages.map((image, angleIndex) => (
                          <span
                            key={image}
                            className="angle-peek block h-14 w-14 overflow-hidden rounded-full border-2 border-background/80 bg-background shadow-lg"
                            style={cardRevealStyle(angleIndex)}
                          >
                            <img
                              src={resolveImage(image)}
                              alt={`${category.name} angle ${angleIndex + 1}`}
                              loading="lazy"
                              decoding="async"
                              width={96}
                              height={96}
                              className="h-full w-full object-cover"
                            />
                          </span>
                        ))}
                      </div>
                    )}
                  </Link>

                  <div className="flex flex-col justify-center p-6 md:p-10">
                    <p className="text-xs font-semibold uppercase tracking-[0.25em] text-gold">
                      {String(index + 1).padStart(2, "0")} / {category.name}
                    </p>
                    <h3 className="mt-3 font-display text-2xl font-bold md:text-4xl">
                      {category.heroTitle}
                    </h3>
                    <p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground md:text-base">
                      {category.description}
                    </p>
                    <ul className="mt-5 grid gap-2 text-sm text-foreground/80">
                      {categoryFeatureList(category).map((feature) => (
                        <li key={feature} className="flex items-start gap-2">
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                    {category.subcategories.length > 0 && (
                      <div className="mt-5 flex flex-wrap gap-2">
                        {category.subcategories.map((subcategory) => (
                          <span
                            key={subcategory}
                            className="rounded-sm border border-border bg-background px-3 py-1 text-xs font-medium text-foreground/75"
                          >
                            {subcategory}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="mt-7">
                      <Link to="/category/$slug" params={{ slug: category.slug }}>
                        <Button variant="default">
                          Shop {category.name} <ArrowRight className="ml-1 h-4 w-4" />
                        </Button>
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          ))}
        </div>
      </section>

      <section className="reveal-section container mx-auto px-4 py-16 md:py-24">
        <div className="mb-10 flex items-end justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-gold">
              Curated Edits
            </p>
            <h2 className="mt-2 font-display text-3xl font-bold md:text-4xl">Shop by Category</h2>
          </div>
          <Link
            to="/shop"
            className="hidden text-sm font-medium text-foreground/70 hover:text-gold md:inline-flex"
          >
            View all {"->"}
          </Link>
        </div>
        <div className="card-stagger grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {loading
            ? Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="aspect-[4/5] animate-pulse rounded-md bg-muted"
                  style={cardRevealStyle(i)}
                />
              ))
            : visibleCurated.map((p, index) => (
                <div key={p.id} style={cardRevealStyle(index)}>
                  <ProductCard product={p} eager={index < 1} />
                </div>
              ))}
        </div>
        {hasMoreCurated && (
          <div className="mt-8 text-center">
            <button
              type="button"
              onClick={() => setCuratedVisibleCount((n) => n + HOME_SECTION_SIZE)}
              className="rounded-md border border-border px-6 py-2 text-sm font-medium transition-colors hover:border-gold hover:text-gold"
            >
              Load more
            </button>
          </div>
        )}
      </section>

      <section className="reveal-section bg-secondary/40 py-16 md:py-24">
        <div className="container mx-auto px-4">
          <div className="mb-10 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-gold">
              Hand-picked
            </p>
            <h2 className="mt-2 font-display text-3xl font-bold md:text-4xl">Featured Pieces</h2>
            <div className="gold-divider mx-auto mt-4 w-24" />
          </div>
          <div className="card-stagger grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {loading
              ? Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    className="aspect-[4/5] animate-pulse rounded-md bg-muted"
                    style={cardRevealStyle(i)}
                  />
                ))
              : visibleFeatured.map((p, index) => (
                  <div key={p.id} style={cardRevealStyle(index)}>
                    <ProductCard product={p} />
                  </div>
                ))}
          </div>
          {hasMoreFeatured && (
            <div className="mt-8 text-center">
              <button
                type="button"
                onClick={() => setFeaturedVisibleCount((n) => n + HOME_SECTION_SIZE)}
                className="rounded-md border border-border px-6 py-2 text-sm font-medium transition-colors hover:border-gold hover:text-gold"
              >
                Load more
              </button>
            </div>
          )}
          <div className="mt-10 text-center">
            <Link to="/shop">
              <Button variant="default" size="lg">
                Browse All Products <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {!loading && socksHighlights.length > 0 && (
        <section className="reveal-section container mx-auto px-4 pb-6 pt-14 md:pt-16">
          <div className="mb-8 flex items-end justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-gold">
                Essentials
              </p>
              <h2 className="mt-2 font-display text-2xl font-bold md:text-3xl">Socks Highlights</h2>
            </div>
            <Link
              to="/category/$slug"
              params={{ slug: "socks" }}
              className="hidden text-sm font-medium text-foreground/70 hover:text-gold md:inline-flex"
            >
              Shop socks {"->"}
            </Link>
          </div>
          <div className="card-stagger grid grid-cols-2 gap-4 md:grid-cols-4">
            {socksHighlights.map((p, index) => (
              <div key={p.id} style={cardRevealStyle(index)}>
                <ProductCard product={p} />
              </div>
            ))}
          </div>
        </section>
      )}

      <FashionGallery
        items={fashionGalleryItems}
        limit={8}
        eyebrow="Visual Browse"
        title="Fresh From The Current Catalogue"
        description="A quick visual sweep of the latest catalogue images, grouped into the same categories and subcategories used across the storefront."
      />

      <section className="reveal-section container mx-auto px-4 py-16 md:py-24">
        <div className="mb-12 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-gold">
            The Esquire Promise
          </p>
          <h2 className="mt-2 font-display text-3xl font-bold md:text-4xl">Why Prince Esquire</h2>
        </div>
        <div className="grid gap-8 md:grid-cols-4">
          {[
            {
              icon: Sparkles,
              title: "Master Tailoring",
              body: "Considered fabrics, half-canvas construction, modern silhouettes.",
            },
            {
              icon: Truck,
              title: "Free Nairobi Delivery",
              body: "Complimentary delivery on all orders within Nairobi.",
            },
            {
              icon: Store,
              title: "In-Store Pickup",
              body: "Skip delivery - collect at our Kimathi Street store.",
            },
            {
              icon: ShieldCheck,
              title: "Quality Guarantee",
              body: "Easy 14-day returns and an honest fit promise.",
            },
          ].map((f) => (
            <div key={f.title} className="text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-gold/40 bg-gold/10 text-gold">
                <f.icon className="h-6 w-6" />
              </div>
              <h3 className="mt-4 font-display text-lg font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
