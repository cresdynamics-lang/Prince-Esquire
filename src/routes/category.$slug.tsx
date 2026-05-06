import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ProductCard, type ProductCardData } from "@/components/site/ProductCard";
import { resolveImage } from "@/lib/assetMap";
import {
  defaultCarouselDescription,
  defaultCarouselTitle,
  getCategorySubcategoryLinks,
} from "@/lib/categoryCarousels";
import {
  dedupeProductCardsStable,
  dedupeProductsBySlugPreferOrder,
  fashionProductsForCategorySlug,
  mergeCatalogFallbackIntoCard,
} from "@/lib/fashionProducts";
import { getFashionCategoryFallback } from "@/lib/fashionGallery";
import { fetchPublishedProductsForCategoryPage } from "@/lib/publishedProductsQuery";
import { fetchDeletedProductSlugs } from "@/lib/productDeletion";
import { getSubcategoriesForCategory, resolveSubcategory } from "@/lib/subcategories";

export const Route = createFileRoute("/category/$slug")({
  validateSearch: (search: Record<string, unknown>) => ({
    sub: typeof search.sub === "string" ? search.sub : "",
  }),
  component: CategoryPage,
});

function CategoryPage() {
  const PAGE_SIZE = 24;
  const { slug } = Route.useParams();
  const { sub } = Route.useSearch();
  const [cat, setCat] = useState<{
    id: string;
    name: string;
    description: string | null;
    image_url: string | null;
  } | null>(null);
  const [carousel, setCarousel] = useState<{
    title: string | null;
    description: string | null;
    image_url: string | null;
    is_active: boolean;
  } | null>(null);
  const [products, setProducts] = useState<ProductCardData[]>([]);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [activeSubcategory, setActiveSubcategory] = useState<string | null>(null);
  const [activeSlide, setActiveSlide] = useState(0);
  type CategoryProductRow = {
    id: string;
    slug: string;
    title: string | null;
    price: number | string;
    sale_price: number | string | null;
    subcategory?: string | null;
    product_images?: Array<{ image_url: string | null }> | null;
    product_variants?: Array<{ stock_quantity: number | string | null }> | null;
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      setMissing(false);
      const fallbackCategory = getFashionCategoryFallback(slug);
      const fallbackProducts = fashionProductsForCategorySlug(slug);
      const deletedResult = await fetchDeletedProductSlugs(supabase);
      const deletedSlugs = new Set(deletedResult.data);
      const excludeDeleted = (items: ProductCardData[]) =>
        items.filter((item) => !deletedSlugs.has(item.slug));

      const { data: c } = await supabase
        .from("categories")
        .select("id,name,description,image_url")
        .eq("slug", slug)
        .maybeSingle();

      if (!c) {
        if (!fallbackCategory) {
          setMissing(true);
          setLoading(false);
          return;
        }
        setCat({
          id: "",
          name: fallbackCategory.name,
          description: fallbackCategory.description,
          image_url: fallbackCategory.image_url,
        });
        setCarousel(null);
        setProducts(excludeDeleted(fallbackProducts));
        setLoading(false);
        return;
      }

      setCat({
        ...c,
        description: c.description || fallbackCategory?.description || null,
        image_url: c.image_url || fallbackCategory?.image_url || null,
      });
      const { data: carouselRow } = await supabase
        .from("category_carousels")
        .select("title,description,image_url,is_active")
        .eq("category_id", c.id)
        .maybeSingle();
      setCarousel(carouselRow ?? null);

      const { data: ps, error: prodErr } = await fetchPublishedProductsForCategoryPage(
        supabase,
        c.id,
      );
      if (prodErr) {
        console.error("[category] products:", prodErr);
        setProducts(excludeDeleted(fallbackProducts));
        setLoading(false);
        return;
      }

      const dbCards = dedupeProductCardsStable(
        (ps ?? []).map((p: CategoryProductRow) =>
          mergeCatalogFallbackIntoCard({
            id: p.id,
            slug: p.slug,
            title: p.title,
            price: Number(p.price),
            sale_price: p.sale_price != null ? Number(p.sale_price) : null,
            image: p.product_images?.[0]?.image_url ?? null,
            category_name: c.name,
            category_slug: slug,
            subcategory_name: resolveSubcategory(
              p.subcategory,
              slug,
              `${p.title ?? ""} ${p.slug ?? ""}`,
            ),
            stock_quantity_total: (p.product_variants ?? []).reduce(
              (sum: number, v) => sum + Number(v.stock_quantity ?? 0),
              0,
            ),
          }),
        ),
      );
      setProducts(
        dedupeProductsBySlugPreferOrder([
          ...excludeDeleted(dbCards),
          ...excludeDeleted(fallbackProducts),
        ]),
      );
      setLoading(false);
    })();
  }, [slug]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
    setActiveSubcategory(sub || null);
    setActiveSlide(0);
  }, [slug, sub]);

  const subcategories = getSubcategoriesForCategory(slug);
  const carouselSubcategoryLinks = getCategorySubcategoryLinks(slug);
  const carouselSlides = useMemo(() => {
    const carouselEnabled = carousel?.is_active !== false;
    const heading = carouselEnabled
      ? carousel?.title?.trim() || defaultCarouselTitle(cat?.name ?? "Category")
      : (cat?.name ?? "Category");
    const body = carouselEnabled
      ? carousel?.description?.trim() || defaultCarouselDescription(cat?.name ?? "menswear")
      : cat?.description || "";
    const image = carouselEnabled
      ? carousel?.image_url || cat?.image_url || null
      : cat?.image_url || null;
    if (carouselSubcategoryLinks.length === 0) {
      return [{ key: "all", heading, body, image, subcategory: null as string | null }];
    }
    return carouselSubcategoryLinks.map((subcat) => ({
      key: subcat,
      heading: `${heading} - ${subcat}`,
      body: `${body} Browse ${subcat.toLowerCase()} options within this collection.`,
      image,
      subcategory: subcat,
    }));
  }, [carousel, carouselSubcategoryLinks, cat]);

  useEffect(() => {
    if (carouselSlides.length <= 1) return;
    const id = window.setInterval(() => {
      setActiveSlide((prev) => (prev + 1) % carouselSlides.length);
    }, 5000);
    return () => window.clearInterval(id);
  }, [carouselSlides.length]);
  const filteredProducts = activeSubcategory
    ? products.filter((p) => p.subcategory_name === activeSubcategory)
    : products;
  const visibleProducts = filteredProducts.slice(0, visibleCount);
  const hasMore = !loading && visibleProducts.length < filteredProducts.length;

  if (missing) {
    return (
      <div className="container mx-auto px-4 py-24 text-center">
        <h1 className="font-display text-4xl font-bold">Category not found</h1>
        <Link to="/shop" className="mt-6 inline-block text-gold hover:underline">
          Browse all {"->"}
        </Link>
      </div>
    );
  }

  return (
    <div>
      <section className="relative overflow-hidden bg-navy text-navy-foreground">
        {carouselSlides.map((slide, idx) => (
          <div
            key={slide.key}
            className={`absolute inset-0 transition-opacity duration-700 ${idx === activeSlide ? "opacity-100" : "opacity-0"}`}
          >
            {slide.image && (
              <img
                src={resolveImage(slide.image)}
                alt={slide.heading}
                className="h-full w-full object-cover"
              />
            )}
            <div className="absolute inset-0 bg-navy/65" />
          </div>
        ))}
        <div className="container relative mx-auto px-4 py-16 text-center md:py-24">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-gold">Collection</p>
          <h1 className="mt-3 font-display text-4xl font-bold md:text-6xl">
            {carouselSlides[activeSlide]?.heading ?? cat?.name ?? "Loading..."}
          </h1>
          {(carouselSlides[activeSlide]?.body || cat?.description) && (
            <p className="mx-auto mt-4 max-w-xl text-sm text-navy-foreground/70 md:text-base">
              {carouselSlides[activeSlide]?.body || cat?.description}
            </p>
          )}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            <Link
              to="/category/$slug"
              params={{ slug }}
              search={{ sub: "" }}
              className="rounded-full border border-gold bg-gold px-4 py-2 text-xs font-semibold text-gold-foreground transition hover:brightness-110"
            >
              All {cat?.name ?? "items"}
            </Link>
            {carouselSubcategoryLinks.map((subcat) => (
              <Link
                key={subcat}
                to="/category/$slug"
                params={{ slug }}
                search={{ sub: subcat }}
                className="rounded-full border border-navy-foreground/40 px-4 py-2 text-xs font-semibold text-navy-foreground transition hover:border-gold hover:text-gold"
              >
                {subcat}
              </Link>
            ))}
          </div>
          {carouselSlides.length > 1 && (
            <div className="mt-5 flex items-center justify-center gap-2">
              {carouselSlides.map((slide, idx) => (
                <button
                  key={slide.key}
                  type="button"
                  onClick={() => setActiveSlide(idx)}
                  aria-label={`Open ${slide.subcategory ?? "all"} slide`}
                  className={`h-2.5 rounded-full transition-all ${idx === activeSlide ? "w-8 bg-gold" : "w-2.5 bg-navy-foreground/50"}`}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      <div className="container mx-auto px-4 py-12">
        {subcategories.length > 0 && (
          <div className="mb-8 flex flex-wrap justify-center gap-2">
            <button
              onClick={() => setActiveSubcategory(null)}
              className={`rounded-full border px-4 py-1.5 text-xs font-medium transition-colors ${activeSubcategory === null ? "border-gold bg-gold text-gold-foreground" : "border-border hover:border-gold"}`}
            >
              All {cat?.name ?? ""}
            </button>
            {subcategories.map((subcat) => (
              <button
                key={subcat}
                onClick={() => setActiveSubcategory(subcat)}
                className={`rounded-full border px-4 py-1.5 text-xs font-medium transition-colors ${activeSubcategory === subcat ? "border-gold bg-gold text-gold-foreground" : "border-border hover:border-gold"}`}
              >
                {subcat}
              </button>
            ))}
          </div>
        )}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {loading
            ? Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="aspect-[4/5] animate-pulse rounded-md bg-muted" />
              ))
            : visibleProducts.map((p, index) => (
                <ProductCard key={p.id} product={p} eager={index < 1} />
              ))}
        </div>
        {hasMore && (
          <div className="mt-8 text-center">
            <button
              type="button"
              onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
              className="rounded-md border border-border px-6 py-2 text-sm font-medium transition-colors hover:border-gold hover:text-gold"
            >
              Load more products
            </button>
          </div>
        )}

        {!loading && filteredProducts.length === 0 && (
          <p className="py-16 text-center text-muted-foreground">
            No products in this category yet.
          </p>
        )}
      </div>
    </div>
  );
}
