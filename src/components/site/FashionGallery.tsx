import { Link } from "@tanstack/react-router";
import { type CSSProperties } from "react";
import { resolveImage } from "@/lib/assetMap";
import type { FashionGalleryItem } from "@/lib/fashionGallery";
import { cn } from "@/lib/utils";

type FashionGalleryProps = {
  items: FashionGalleryItem[];
  eyebrow: string;
  title: string;
  description?: string;
  id?: string;
  className?: string;
  limit?: number;
};

function normalizeGalleryKey(value: string | null | undefined) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function dedupeGalleryItems(items: FashionGalleryItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = [
      item.category,
      normalizeGalleryKey(item.subcategoryName),
      normalizeGalleryKey(item.description),
    ].join(":");

    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function galleryCardStyle(index: number): CSSProperties {
  return { "--card-index": index } as CSSProperties;
}

export function FashionGallery({
  items,
  eyebrow,
  title,
  description,
  id,
  className,
  limit,
}: FashionGalleryProps) {
  const dedupedItems = dedupeGalleryItems(items);
  const visibleItems = limit ? dedupedItems.slice(0, limit) : dedupedItems;

  if (visibleItems.length === 0) return null;

  return (
    <section id={id} className={cn("reveal-section py-16 md:py-24", className)}>
      <div className="container mx-auto px-4">
        <div className="mb-10 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-gold">{eyebrow}</p>
          <h2 className="mt-2 font-display text-3xl font-bold md:text-4xl">{title}</h2>
          {description && (
            <p className="mx-auto mt-4 max-w-2xl text-sm text-muted-foreground md:text-base">
              {description}
            </p>
          )}
        </div>

        <div className="card-stagger grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
          {visibleItems.map((item, index) => (
            <Link
              key={item.id}
              to="/category/$slug"
              params={{ slug: item.category }}
              className="gallery-card group relative overflow-hidden rounded-md bg-muted"
              style={galleryCardStyle(index)}
            >
              <div className="aspect-[4/5] overflow-hidden">
                <img
                  src={resolveImage(item.image)}
                  alt={item.description}
                  loading="lazy"
                  decoding="async"
                  fetchPriority="low"
                  width={400}
                  height={500}
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
              </div>
              <div className="absolute inset-0 bg-gradient-to-t from-navy/90 via-navy/10 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-gold">
                  {item.categoryLabel}
                </p>
                <p className="mt-2 line-clamp-2 text-sm font-medium text-navy-foreground">
                  {item.description}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
