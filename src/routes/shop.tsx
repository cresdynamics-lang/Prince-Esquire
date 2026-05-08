import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ProductCard, type ProductCardData } from "@/components/site/ProductCard";
import { ALLOWED_CATEGORY_SLUGS, CATALOG_TAXONOMY } from "@/lib/catalogTaxonomy";
import { fetchPublishedProductsForShopCards } from "@/lib/publishedProductsQuery";
import {
  dedupeProductCardsStable,
  dedupeProductsBySlugPreferOrder,
  fashionProductsAsCards,
  mergeCatalogFallbackIntoCard,
} from "@/lib/fashionProducts";
import { EXTERNAL_PRODUCT_CARDS } from "@/lib/externalProducts";
import { getSubcategoriesForCategory, resolveSubcategory } from "@/lib/subcategories";
import { siteHeroSuitUrl } from "@/lib/assetMap";
import { fetchDeletedProductSlugs } from "@/lib/productDeletion";

export const Route = createFileRoute("/shop")({
  validateSearch: (search: Record<string, unknown>) => ({
    q: typeof search.q === "string" ? search.q : "",
  }),
  head: () => ({
    meta: [
      { title: "Shop All Menswear - Prince Esquire" },
      {
        name: "description",
        content:
          "Shop men's fashion in Kenya with Prince Esquire: suits, shirts, shoes, trousers, track suits, belts and socks with Nairobi delivery.",
      },
      {
        name: "keywords",
        content:
          "shop menswear kenya, buy suits nairobi, shirts kenya, men's shoes kenya, prince esquire shop",
      },
    ],
  }),
  component: ShopPage,
});

function ShopPage() {
  const { q } = Route.useSearch();
  const PAGE_SIZE = 24;
  const [products, setProducts] = useState<ProductCardData[]>([]);
  const [productCategoryMap, setProductCategoryMap] = useState<Record<string, string | null>>({});
  const [cats, setCats] = useState<{ id: string; slug: string; name: string }[]>([]);
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [activeSubcategory, setActiveSubcategory] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setFetchError(null);
      const [{ data: cs }, shopFetch] = await Promise.all([
        supabase.from("categories").select("id,slug,name").order("display_order"),
        fetchPublishedProductsForShopCards(supabase),
      ]);
      const ps = shopFetch.data;
      if (shopFetch.error) {
        console.error("[shop] products:", shopFetch.error);
        setFetchError(shopFetch.error.message || "Could not load products.");
        setProducts([]);
        setProductCategoryMap({});
        setCats([]);
        setLoading(false);
        return;
      }
      const allRows = cs ?? [];
      const deletedResult = await fetchDeletedProductSlugs(supabase);
      const deletedSlugs = new Set(deletedResult.data);
      const excludeDeleted = (items: ProductCardData[]) =>
        items.filter((item) => !deletedSlugs.has(item.slug));
      const productSlugs = new Set(
        (ps ?? []).map((p: any) => p.categories?.slug).filter(Boolean) as string[],
      );
      const categories = allRows
        .filter((c: { slug: string }) => ALLOWED_CATEGORY_SLUGS.has(c.slug) || productSlugs.has(c.slug))
        .sort((a: { slug: string; name: string }, b: { slug: string; name: string }) => {
          const ia = CATALOG_TAXONOMY.findIndex((t) => t.slug === a.slug);
          const ib = CATALOG_TAXONOMY.findIndex((t) => t.slug === b.slug);
          const ra = ia >= 0 ? ia : 500;
          const rb = ib >= 0 ? ib : 500;
          if (ra !== rb) return ra - rb;
          return a.name.localeCompare(b.name);
        });
      setCats(categories);
      const dbCards: ProductCardData[] = dedupeProductCardsStable(
        (ps ?? [])
          .map((p: any) =>
            mergeCatalogFallbackIntoCard({
              id: p.id,
              slug: p.slug,
              title: p.title,
              price: Number(p.price),
              sale_price: p.sale_price != null ? Number(p.sale_price) : null,
              image: p.product_images?.[0]?.image_url ?? null,
              category_name: p.categories?.name,
              category_slug: p.categories?.slug,
              subcategory_name: resolveSubcategory(
                p.subcategory,
                p.categories?.slug,
                `${p.title ?? ""} ${p.slug ?? ""}`,
              ),
              stock_quantity_total: (p.product_variants ?? []).reduce(
                (sum: number, v: any) => sum + Number(v.stock_quantity ?? 0),
                0,
              ),
            }),
          )
          .filter((p) => !deletedSlugs.has(p.slug)),
      );

      const categoryMap: Record<string, string | null> = {};
      (ps ?? []).forEach((p: any) => {
        categoryMap[p.id] = p.category_id ?? null;
      });
      setProductCategoryMap(categoryMap);
      setProducts(
        dedupeProductsBySlugPreferOrder([
          ...dbCards,
          ...excludeDeleted(fashionProductsAsCards()),
          ...EXTERNAL_PRODUCT_CARDS,
        ]),
      );
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(
    () =>
      (activeCat
        ? products.filter((p) => {
            if (productCategoryMap[p.id] === activeCat) return true;
            const cat = cats.find((c) => c.id === activeCat);
            if (!cat || !p.category_slug) return false;
            return p.category_slug === cat.slug;
          })
        : products
      ).filter((p) => {
        if (activeSubcategory && p.subcategory_name !== activeSubcategory) return false;
        const term = q.trim().toLowerCase();
        if (!term) return true;
        const titleMatch = p.title.toLowerCase().includes(term);
        const slugMatch = p.slug.toLowerCase().includes(term);
        const categoryMatch = (p.category_name ?? "").toLowerCase().includes(term);
        const subMatch = (p.subcategory_name ?? "").toLowerCase().includes(term);
        return titleMatch || slugMatch || categoryMatch || subMatch;
      }),
    [activeCat, activeSubcategory, cats, productCategoryMap, products, q],
  );

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
    setActiveSubcategory(null);
  }, [activeCat]);

  const activeCategorySlug = activeCat
    ? (cats.find((c) => c.id === activeCat)?.slug ?? null)
    : null;
  const activeCategorySubcategories = activeCategorySlug
    ? getSubcategoriesForCategory(activeCategorySlug)
    : [];

  const groupShopByCategory = activeCat === null && !q.trim();

  const displayOrderedProducts = useMemo(() => {
    const rank = (slug: string | undefined) => {
      if (!slug) return 2000;
      const i = CATALOG_TAXONOMY.findIndex((t) => t.slug === slug);
      if (i >= 0) return i;
      return 1000 + (slug.charCodeAt(0) % 500);
    };
    const list = [...filtered];
    if (groupShopByCategory) {
      list.sort((a, b) => {
        const d = rank(a.category_slug) - rank(b.category_slug);
        if (d !== 0) return d;
        return a.title.localeCompare(b.title);
      });
    } else {
      list.sort((a, b) => a.title.localeCompare(b.title));
    }
    return list;
  }, [filtered, groupShopByCategory]);

  const visibleProducts = displayOrderedProducts.slice(0, visibleCount);
  const hasMore = visibleProducts.length < displayOrderedProducts.length;

  return (
    <>
      <div className="container mx-auto px-4 py-12 md:py-16">
        <section className="relative mb-10 overflow-hidden rounded-md bg-navy py-14 text-center text-navy-foreground md:py-16">
          <div
            className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-30"
            style={{ backgroundImage: `url(${siteHeroSuitUrl})` }}
          />
          <div className="relative z-10">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-gold">
              The Collection
            </p>
            <h1 className="mt-2 font-display text-4xl font-bold md:text-5xl">Shop All</h1>
            <div className="gold-divider mx-auto mt-4 w-24" />
            {q.trim() && (
              <p className="mt-3 text-sm text-navy-foreground/85">
                Search results for <span className="font-semibold text-gold">"{q}"</span>
              </p>
            )}
          </div>
        </section>

        <div className="mb-8 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-gold">
            Browse By Category
          </p>
        </div>

        <div className="mb-8 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => setActiveCat(null)}
            className={`rounded-full border px-4 py-1.5 text-xs font-medium transition-colors ${activeCat === null ? "border-gold bg-gold text-gold-foreground" : "border-border hover:border-gold"}`}
          >
            All
          </button>
          {cats.map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveCat(c.id)}
              className={`rounded-full border px-4 py-1.5 text-xs font-medium transition-colors ${activeCat === c.id ? "border-gold bg-gold text-gold-foreground" : "border-border hover:border-gold"}`}
            >
              {c.name}
            </button>
          ))}
        </div>
        {activeCategorySubcategories.length > 0 && (
          <div className="mb-8 flex flex-wrap justify-center gap-2">
            <button
              onClick={() => setActiveSubcategory(null)}
              className={`rounded-full border px-4 py-1.5 text-xs font-medium transition-colors ${activeSubcategory === null ? "border-gold bg-gold text-gold-foreground" : "border-border hover:border-gold"}`}
            >
              All {cats.find((c) => c.id === activeCat)?.name ?? ""}
            </button>
            {activeCategorySubcategories.map((subcat) => (
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

        {fetchError && (
          <div className="mb-6 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <p className="font-medium">Could not load products from the database.</p>
            <p className="mt-1 text-xs opacity-90">{fetchError}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              Check that Supabase env vars are set, RLS allows public read of published products,
              and the database is reachable. If you recently added the{" "}
              <code className="rounded bg-muted px-1">subcategory</code> column, run migrations or
              the app will retry without it automatically.
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {loading
            ? Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="aspect-[4/5] animate-pulse rounded-md bg-muted" />
              ))
            : visibleProducts.flatMap((p, index) => {
                const prev = visibleProducts[index - 1];
                const showGroupHeading =
                  groupShopByCategory &&
                  (!prev || (prev.category_slug ?? "") !== (p.category_slug ?? ""));
                const heading = showGroupHeading ? (
                  <div
                    key={`cat-h-${p.id}`}
                    className="col-span-2 border-b border-border pb-2 pt-4 md:col-span-3 lg:col-span-4"
                  >
                    <h2 className="font-display text-lg font-semibold text-foreground">
                      {p.category_name?.trim() || "Uncategorized"}
                    </h2>
                  </div>
                ) : null;
                const card = <ProductCard key={p.id} product={p} eager={index < 1} />;
                return heading ? [heading, card] : [card];
              })}
        </div>

        {!loading && hasMore && (
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

        {!loading && !fetchError && filtered.length === 0 && (
          <p className="py-16 text-center text-muted-foreground">
            {products.length === 0 ? (
              <>
                No published products yet. In the admin dashboard or product quick edit (staff),
                open a product and enable <strong>Published</strong> so it appears on the shop.
              </>
            ) : (
              <>
                No products match this filter.{" "}
                <Link to="/shop" className="text-gold hover:underline">
                  Clear filters
                </Link>
              </>
            )}
          </p>
        )}
      </div>
    </>
  );
}
