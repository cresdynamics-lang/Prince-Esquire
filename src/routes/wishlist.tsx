import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWishlist } from "@/lib/wishlist";
import { ProductCard, type ProductCardData } from "@/components/site/ProductCard";
import { dedupeProductCardsStable, mergeCatalogFallbackIntoCard } from "@/lib/fashionProducts";
import { resolveSubcategory } from "@/lib/subcategories";
import { Button } from "@/components/ui/button";
import { fetchDeletedProductSlugs } from "@/lib/productDeletion";

export const Route = createFileRoute("/wishlist")({
  head: () => ({ meta: [{ title: "Wishlist — Prince Esquire" }] }),
  component: WishlistPage,
});

function WishlistPage() {
  const { ids } = useWishlist();
  const [items, setItems] = useState<ProductCardData[]>([]);
  const [loading, setLoading] = useState(true);
  type WishlistProductRow = {
    id: string;
    slug: string;
    title: string | null;
    price: number | string;
    sale_price: number | string | null;
    subcategory?: string | null;
    product_images?: Array<{ image_url: string | null }> | null;
    product_variants?: Array<{ stock_quantity: number | string | null }> | null;
    categories?: { name: string | null; slug: string | null } | null;
  };

  useEffect(() => {
    (async () => {
      if (ids.size === 0) {
        setItems([]);
        setLoading(false);
        return;
      }
      const { data } = await supabase
        .from("products")
        .select(
          "id,slug,title,price,sale_price,product_images(image_url),product_variants(stock_quantity),categories(name,slug)",
        )
        .in("id", [...ids])
        .eq("is_published", true);
      const deletedResult = await fetchDeletedProductSlugs(supabase);
      const deletedSlugs = new Set(deletedResult.data);
      setItems(
        dedupeProductCardsStable(
          (data ?? [])
            .map((p: WishlistProductRow) =>
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
                  (sum: number, v) => sum + Number(v.stock_quantity ?? 0),
                  0,
                ),
              }),
            )
            .filter((item) => !deletedSlugs.has(item.slug)),
        ),
      );
      setLoading(false);
    })();
  }, [ids]);

  return (
    <div className="container mx-auto px-4 py-12">
      <h1 className="mb-8 font-display text-4xl font-bold">Your Wishlist</h1>
      {loading ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="aspect-[4/5] animate-pulse rounded-md bg-muted" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-muted-foreground">Your wishlist is empty.</p>
          <Link to="/shop" className="mt-4 inline-block">
            <Button variant="hero">Discover the collection</Button>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {items.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      )}
    </div>
  );
}
