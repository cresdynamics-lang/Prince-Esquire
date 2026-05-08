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
  description?: string | null;
  price: number;
  sale_price: number | null;
  image: string | null;
  category_name?: string;
  /** When set, shop filters can match this to a DB category `slug` (used for bundled `fashions/` products). */
  category_slug?: string;
  /** External product link when the item points to another storefront. */
  external_url?: string | null;
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

  const content = (
    <>
      <div className="resource-card__media relative overflow-hidden bg-muted aspect-[4/5]">
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
        {(onSale || isSoldOut) && (
          <div className="absolute left-3 top-3 flex flex-col gap-2">
            {onSale && (
              <span className="rounded-full bg-gold px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.25em] text-gold-foreground">
                Sale
              </span>
            )}
            {isSoldOut && (
              <span className="rounded-full bg-destructive px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.25em] text-destructive-foreground">
                Sold out
              </span>
            )}
          </div>
        )}
      </div>

      <div className="resource-card__content p-6">
        <div className="flex flex-wrap items-center gap-2">
          {product.category_name && (
            <span className="rounded-full bg-foreground/5 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
              {product.category_name}
            </span>
          )}
          {product.subcategory_name && (
            <span className="rounded-full bg-foreground/5 px-3 py-1 text-[10px] font-medium text-muted-foreground">
              {product.subcategory_name}
            </span>
          )}
        </div>

        <h3 className="mt-4 text-lg font-semibold leading-tight text-foreground line-clamp-2">
          {product.title}
        </h3>

        <div className="mt-3 flex flex-wrap items-center gap-3 text-lg font-semibold text-foreground">
          {product.price_on_request ? (
            <span className="text-sm font-medium text-muted-foreground">Price on request</span>
          ) : onSale ? (
            <>
              <span className="text-gold">{formatKES(product.sale_price)}</span>
              <span className="text-sm text-muted-foreground line-through">
                {formatKES(product.price)}
              </span>
            </>
          ) : (
            <span>{formatKES(product.price)}</span>
          )}
        </div>

        {product.description && (
          <p className="mt-4 text-sm leading-6 text-muted-foreground line-clamp-2">
            {product.description.length > 100
              ? `${product.description.substring(0, 100)}...`
              : product.description}
          </p>
        )}

        <div className="mt-6">
          <span className="inline-flex items-center rounded-full border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-gold hover:text-gold">
            {product.external_url ? "Shop External" : "View Product"}
          </span>
        </div>
      </div>
    </>
  );

  return (
    <div className="resource-card group relative overflow-hidden rounded-[1.5rem] border border-border bg-card text-foreground shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-2xl">
      {product.external_url ? (
        <a
          href={product.external_url}
          target="_blank"
          rel="noreferrer noopener"
          className="block"
        >
          {content}
        </a>
      ) : (
        <Link to="/product/$slug" params={{ slug: product.slug }} className="block">
          {content}
        </Link>
      )}

      <button
        type="button"
        onClick={() => toggle(product.id)}
        aria-label={wished ? "Remove from wishlist" : "Add to wishlist"}
        className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full bg-background/90 text-foreground/80 shadow-sm transition-colors hover:text-gold"
      >
        <Heart className={cn("h-4 w-4", wished && "fill-gold text-gold")} />
      </button>
    </div>
  );
}
