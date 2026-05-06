import { Link } from "@tanstack/react-router";
import { Heart } from "lucide-react";
import { hasResolvableAssetSourcePath, resolveImage } from "@/lib/assetMap";
import { getRepresentativeImageForCategory } from "@/lib/catalogAssets";
import { formatKES } from "@/lib/format";
import { useWishlist } from "@/lib/wishlist";
import { cn } from "@/lib/utils";

export type ProductCardData = {
  id: string;
  slug: string;
  title: string;
  price: number;
  sale_price: number | null;
  image: string | null;
  category_name?: string;
  /** When set, shop filters can match this to a DB category `slug` (used for bundled `fashions/` products). */
  category_slug?: string;
  /** Show “Price on request” instead of a numeric price (studio / enquiry-only items). */
  price_on_request?: boolean;
  /** Total stock across variants (optional analytics / future use). */
  stock_quantity_total?: number;
  /** Optional inferred subcategory label for the card. */
  subcategory_name?: string | null;
};

export function ProductCard({
  product,
  eager = false,
}: {
  product: ProductCardData;
  eager?: boolean;
}) {
  const { has, toggle } = useWishlist();
  const wished = has(product.id);
  const onSale =
    !product.price_on_request &&
    product.sale_price != null &&
    Number(product.sale_price) < Number(product.price);
  const isSoldOut = (product.stock_quantity_total ?? 1) <= 0;
  const categoryFallbackImage = product.category_slug
    ? getRepresentativeImageForCategory(product.category_slug)
    : null;
  const displayImage = !product.image
    ? categoryFallbackImage
    : product.image.startsWith("/src/assets/") && !hasResolvableAssetSourcePath(product.image)
      ? (categoryFallbackImage ?? product.image)
      : product.image;

  return (
    <div className="product-card group relative overflow-hidden rounded-md border border-border bg-card">
      <Link to="/product/$slug" params={{ slug: product.slug }} className="block">
        <div className="relative aspect-[4/5] overflow-hidden bg-muted">
          <img
            src={resolveImage(displayImage)}
            alt={product.title}
            loading={eager ? "eager" : "lazy"}
            decoding="async"
            fetchPriority={eager ? "high" : "low"}
            sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 25vw"
            width={400}
            height={500}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
          {onSale && (
            <span className="absolute left-3 top-3 rounded-sm bg-gold px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gold-foreground">
              Sale
            </span>
          )}
        </div>
      </Link>
      <button
        type="button"
        onClick={() => toggle(product.id)}
        aria-label={wished ? "Remove from wishlist" : "Add to wishlist"}
        className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-background/90 text-foreground/70 backdrop-blur transition-colors hover:text-gold"
      >
        <Heart className={cn("h-4 w-4", wished && "fill-gold text-gold")} />
      </button>

      <Link to="/product/$slug" params={{ slug: product.slug }} className="block p-4">
        {product.category_name && (
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {product.category_name}
          </div>
        )}
        {product.subcategory_name && (
          <div className="mt-0.5 text-[10px] font-medium text-muted-foreground">
            {product.subcategory_name}
          </div>
        )}
        <h3 className="mt-1 line-clamp-2 text-sm font-semibold leading-snug text-foreground">
          {product.title}
        </h3>
        <div className="mt-2 flex items-baseline gap-2">
          {product.price_on_request ? (
            <span className="text-sm font-medium text-muted-foreground">Price on request</span>
          ) : onSale ? (
            <>
              <span className="font-semibold text-gold">{formatKES(product.sale_price)}</span>
              <span className="text-xs text-muted-foreground line-through">
                {formatKES(product.price)}
              </span>
            </>
          ) : (
            <span className="font-semibold text-foreground">{formatKES(product.price)}</span>
          )}
        </div>
      </Link>
    </div>
  );
}
