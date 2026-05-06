import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Heart, Truck, Store, ShieldCheck, Minus, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { hasResolvableAssetSourcePath, resolveImage } from "@/lib/assetMap";
import { formatKES, STORE_INFO } from "@/lib/format";
import { useAuth } from "@/lib/auth";
import { useCart } from "@/lib/cart";
import { useWishlist } from "@/lib/wishlist";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { fetchProductDetailBySlug } from "@/lib/publishedProductsQuery";
import { deleteProductCompletely } from "@/lib/productDeletion";
import { wasProductDeletedBySlug } from "@/lib/productDeletion";
import { productsUpdateSafe } from "@/lib/productWriteFallback";
import { getSubcategoriesForCategory } from "@/lib/subcategories";
import { NotFoundPage } from "@/components/site/NotFoundPage";
import { getCatalogFallbackForProduct } from "@/lib/fashionProducts";
import { getCatalogAssetsForCategory, getCatalogAssetsForExactFolder } from "@/lib/catalogAssets";
import { buildProductFeatures } from "@/lib/productCopy";

export const Route = createFileRoute("/product/$slug")({
  component: ProductPage,
});

type Variant = { id: string; size: string | null; color: string | null; stock_quantity: number };
type ProductDetailState = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  price: number | string;
  sale_price: number | string | null;
  subcategory?: string | null;
  is_published?: boolean | null;
  is_featured?: boolean | null;
  categories?: { name: string | null; slug: string | null } | null;
  product_images?: Array<{ image_url: string | null }> | null;
  product_variants?: Variant[] | null;
};

function ProductPage() {
  const { slug } = Route.useParams();
  const navigate = useNavigate();
  const { isStaff, isSuperAdmin, loading: authLoading } = useAuth();
  const cart = useCart();
  const wishlist = useWishlist();
  const [product, setProduct] = useState<ProductDetailState | null>(null);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [images, setImages] = useState<string[]>([]);
  const [activeVariant, setActiveVariant] = useState<Variant | null>(null);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [adminBusy, setAdminBusy] = useState(false);
  const [adminUploadingImage, setAdminUploadingImage] = useState(false);
  const [adminCategories, setAdminCategories] = useState<
    { id: string; name: string; slug: string }[]
  >([]);
  const [adminDraft, setAdminDraft] = useState({
    title: "",
    slug: "",
    category_id: "",
    subcategory: "",
    description: "",
    price: "",
    sale_price: "",
    image_url: "",
    is_published: true,
    is_featured: false,
  });

  useEffect(() => {
    if (authLoading) return;
    (async () => {
      setLoading(true);
      setMissing(false);
      const slugFallback = getCatalogFallbackForProduct({ slug });
      const deletedCheck = await wasProductDeletedBySlug(supabase, slug);
      const { data: p, error: fetchErr } = await fetchProductDetailBySlug(supabase, slug, {
        onlyPublished: !isStaff,
      });
      if (fetchErr) {
        console.error("[product] load failed:", fetchErr);
        if (deletedCheck.deleted) {
          setProduct(null);
          setMissing(true);
          setLoading(false);
          return;
        }
        if (slugFallback) {
          setProduct({
            id: slugFallback.id,
            slug: slugFallback.slug,
            title: slugFallback.title,
            description: slugFallback.description,
            price: slugFallback.price,
            sale_price: slugFallback.salePrice,
            subcategory: slugFallback.subcategoryName ?? null,
            is_published: true,
            is_featured: false,
            categories: { name: slugFallback.categoryName, slug: slugFallback.categorySlug },
            product_images: [{ image_url: slugFallback.image }],
            product_variants: [],
          });
          setImages([slugFallback.image]);
          setVariants([]);
          setActiveVariant(null);
          setSelectedSize(null);
          setSelectedColor(null);
          setAdminDraft({
            title: slugFallback.title,
            slug: slugFallback.slug,
            category_id: "",
            subcategory: slugFallback.subcategoryName ?? "",
            description: slugFallback.description,
            price: String(slugFallback.price),
            sale_price: "",
            image_url: slugFallback.image,
            is_published: true,
            is_featured: false,
          });
          setLoading(false);
          return;
        }
        setProduct(null);
        setMissing(true);
        setLoading(false);
        return;
      }
      if (p) {
        const assetFallback = getCatalogFallbackForProduct({
          slug,
          title: p.title,
          image: p.product_images?.[0]?.image_url ?? null,
          categorySlug: p.categories?.slug ?? null,
          categoryName: p.categories?.name ?? null,
          subcategoryName: (p as { subcategory?: string | null }).subcategory ?? null,
        });
        if (!isStaff && !p.is_published) {
          setProduct(null);
          setMissing(true);
          setLoading(false);
          return;
        }
        setProduct({
          ...p,
          title: p.title?.trim() || assetFallback?.title || p.title,
          description:
            typeof p.description === "string" && p.description.trim().length >= 80
              ? p.description
              : assetFallback?.description || p.description,
          categories:
            p.categories ??
            (assetFallback
              ? { name: assetFallback.categoryName, slug: assetFallback.categorySlug }
              : null),
          subcategory:
            (p as { subcategory?: string | null }).subcategory ||
            assetFallback?.subcategoryName ||
            null,
        });
        let categoryId = "";
        if (p.categories?.slug) {
          const { data: catRow } = await supabase
            .from("categories")
            .select("id")
            .eq("slug", p.categories.slug)
            .maybeSingle();
          categoryId = catRow?.id ?? "";
        }
        const rawImages = (p.product_images ?? []).map((image) => image.image_url).filter(Boolean);
        const fallbackImage = assetFallback?.image ?? null;
        const imgs = Array.from(
          new Set(
            (rawImages.length > 0 ? rawImages : fallbackImage ? [fallbackImage] : []).map(
              (imageUrl) => {
                if (
                  imageUrl?.startsWith("/src/assets/") &&
                  !hasResolvableAssetSourcePath(imageUrl)
                ) {
                  return fallbackImage;
                }
                return imageUrl;
              },
            ),
          ),
        ).filter(Boolean) as string[];
        setImages(imgs.length > 0 ? imgs : fallbackImage ? [fallbackImage] : []);
        const vs = (p.product_variants ?? []) as Variant[];
        setVariants(vs);
        const firstAvailable = vs.find((v) => v.stock_quantity > 0) ?? vs[0] ?? null;
        setActiveVariant(firstAvailable);
        setSelectedSize(firstAvailable?.size ?? null);
        setSelectedColor(firstAvailable?.color ?? null);
        setAdminDraft({
          title: p.title ?? "",
          slug: p.slug ?? "",
          category_id: categoryId,
          subcategory: (p as { subcategory?: string | null }).subcategory ?? "",
          description: p.description ?? "",
          price: String(p.price ?? ""),
          sale_price: p.sale_price != null ? String(p.sale_price) : "",
          image_url: p.product_images?.[0]?.image_url ?? "",
          is_published: Boolean(p.is_published ?? true),
          is_featured: Boolean(p.is_featured ?? false),
        });
        setLoading(false);
        return;
      }

      if (deletedCheck.deleted) {
        setProduct(null);
        setMissing(true);
        setLoading(false);
        return;
      }

      if (slugFallback) {
        setProduct({
          id: slugFallback.id,
          slug: slugFallback.slug,
          title: slugFallback.title,
          description: slugFallback.description,
          price: slugFallback.price,
          sale_price: slugFallback.salePrice,
          subcategory: slugFallback.subcategoryName ?? null,
          is_published: true,
          is_featured: false,
          categories: { name: slugFallback.categoryName, slug: slugFallback.categorySlug },
          product_images: [{ image_url: slugFallback.image }],
          product_variants: [],
        });
        setImages([slugFallback.image]);
        setVariants([]);
        setActiveVariant(null);
        setSelectedSize(null);
        setSelectedColor(null);
        setAdminDraft({
          title: slugFallback.title,
          slug: slugFallback.slug,
          category_id: "",
          subcategory: slugFallback.subcategoryName ?? "",
          description: slugFallback.description,
          price: String(slugFallback.price),
          sale_price: "",
          image_url: slugFallback.image,
          is_published: true,
          is_featured: false,
        });
        setLoading(false);
        return;
      }

      setProduct(null);
      setMissing(true);
      setLoading(false);
    })();
  }, [slug, authLoading, isStaff]);

  useEffect(() => {
    if (!isStaff) return;
    (async () => {
      const { data } = await supabase
        .from("categories")
        .select("id,name,slug")
        .order("display_order");
      setAdminCategories(data ?? []);
    })();
  }, [isStaff]);

  if (!loading && missing) {
    return (
      <NotFoundPage
        heading="Product not found"
        description="This product may have been removed or the link is incorrect."
      />
    );
  }
  if (loading) {
    return (
      <div className="container mx-auto grid gap-8 px-4 py-12 md:grid-cols-2">
        <div className="aspect-[4/5] animate-pulse rounded-md bg-muted" />
        <div className="space-y-3">
          <div className="h-8 w-3/4 animate-pulse rounded bg-muted" />
          <div className="h-6 w-1/3 animate-pulse rounded bg-muted" />
          <div className="h-24 animate-pulse rounded bg-muted" />
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="container mx-auto grid gap-8 px-4 py-12 md:grid-cols-2">
        <div className="aspect-[4/5] animate-pulse rounded-md bg-muted" />
        <div className="space-y-3">
          <div className="h-8 w-3/4 animate-pulse rounded bg-muted" />
          <div className="h-6 w-1/3 animate-pulse rounded bg-muted" />
          <div className="h-24 animate-pulse rounded bg-muted" />
        </div>
      </div>
    );
  }

  const onSale = product.sale_price != null && Number(product.sale_price) < Number(product.price);
  const displayPrice = onSale ? Number(product.sale_price) : Number(product.price);
  const sizes = [...new Set(variants.map((v) => v.size).filter(Boolean))] as string[];
  const colors = [
    ...new Set(
      variants
        .filter((v) => (selectedSize ? v.size === selectedSize : true))
        .map((v) => v.color)
        .filter(Boolean),
    ),
  ] as string[];
  const wished = wishlist.has(product.id);
  const isAssetOnlyProduct = String(product.id).startsWith("asset:");
  const categorySlug = product.categories?.slug ?? "";
  const relatedAngleImages = (
    getCatalogAssetsForExactFolder(categorySlug).length > 0
      ? getCatalogAssetsForExactFolder(categorySlug)
      : getCatalogAssetsForCategory(categorySlug)
  )
    .filter((asset) => {
      if (
        product.subcategory &&
        asset.subcategoryName &&
        asset.subcategoryName !== product.subcategory
      ) {
        return false;
      }
      return !images.includes(asset.image);
    })
    .slice(0, Math.max(0, 4 - images.length))
    .map((asset) => asset.image);
  const galleryImages = Array.from(new Set([...images, ...relatedAngleImages])).slice(0, 4);
  const featureList = [
    ...buildProductFeatures({
      title: product.title,
      categorySlug: product.categories?.slug,
      categoryName: product.categories?.name,
      subcategoryName: product.subcategory,
    }),
    activeVariant?.size
      ? `Selected size: ${activeVariant.size}.`
      : "Sizes: check available options before checkout.",
    activeVariant?.color
      ? `Selected colour: ${activeVariant.color}.`
      : "Colours: options vary by stock availability.",
    onSale
      ? `Current offer price: ${formatKES(displayPrice)}`
      : `Regular price: ${formatKES(displayPrice)}`,
    "Fulfilment: fast Nairobi delivery, in-store pickup, and nationwide shipping available.",
  ];

  const saveAdminChanges = async () => {
    if (!isStaff || isAssetOnlyProduct) return;
    const price = Number(adminDraft.price);
    const sale = adminDraft.sale_price.trim() === "" ? null : Number(adminDraft.sale_price);
    if (!adminDraft.title.trim() || !adminDraft.slug.trim() || Number.isNaN(price)) {
      toast.error("Fill a valid title, slug, and price.");
      return;
    }
    if (sale !== null && Number.isNaN(sale)) {
      toast.error("Sale price must be a valid number.");
      return;
    }

    setAdminBusy(true);
    const { error, omittedSubcategory } = await productsUpdateSafe(supabase, product.id, {
      title: adminDraft.title.trim(),
      slug: adminDraft.slug
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, ""),
      category_id: adminDraft.category_id || null,
      subcategory: adminDraft.subcategory.trim() || null,
      description: adminDraft.description.trim() || null,
      price,
      sale_price: sale,
      is_published: adminDraft.is_published,
      is_featured: adminDraft.is_featured,
    });
    if (error) {
      setAdminBusy(false);
      toast.error(error.message);
      return;
    }
    if (omittedSubcategory) {
      toast.message(
        "Saved without subcategory until `products.subcategory` exists in Supabase (run the migration).",
      );
    }

    const existingImage = product.product_images?.[0];
    const imageUrl = adminDraft.image_url.trim();
    if (imageUrl) {
      if (existingImage?.image_url) {
        await supabase
          .from("product_images")
          .update({ image_url: imageUrl })
          .eq("product_id", product.id)
          .eq("image_url", existingImage.image_url);
      } else {
        await supabase.from("product_images").insert({
          product_id: product.id,
          image_url: imageUrl,
          display_order: 0,
        });
      }
    }
    setAdminBusy(false);
    toast.success("Product updated.");
    window.location.reload();
  };

  const uploadAdminImage = async (file: File) => {
    try {
      setAdminUploadingImage(true);
      const fileExt = (file.name.split(".").pop() || "jpg").toLowerCase();
      const fileBase =
        file.name
          .replace(/\.[^.]+$/, "")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "")
          .slice(0, 40) || "image";
      const filePath = `admin-uploads/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${fileBase}.${fileExt}`;
      const bucket = supabase.storage.from("product-images");
      const { error: uploadError } = await bucket.upload(filePath, file, {
        upsert: true,
        cacheControl: "3600",
        contentType: file.type || undefined,
      });
      if (uploadError) throw uploadError;
      const { data } = bucket.getPublicUrl(filePath);
      setAdminDraft((d) => ({ ...d, image_url: data.publicUrl }));
      toast.success("Image uploaded.");
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to upload image.");
    } finally {
      setAdminUploadingImage(false);
    }
  };

  const deleteProductNow = async () => {
    if (!isSuperAdmin) return;
    const confirmed = window.confirm(
      `Delete "${product.title}" completely? This cannot be undone.`,
    );
    if (!confirmed) return;
    setAdminBusy(true);
    const { error } = await deleteProductCompletely(supabase, product.id);
    setAdminBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Product deleted.");
    navigate({ to: "/shop" });
  };

  const handleAdd = () => {
    if (!activeVariant) return;
    if (activeVariant.stock_quantity < qty) {
      toast.error("Not enough stock for that size.");
      return;
    }
    cart.add(
      {
        productId: product.id,
        variantId: activeVariant.id,
        title: product.title,
        image: images[0] ?? "",
        price: displayPrice,
        size: activeVariant.size,
        color: activeVariant.color,
        slug: product.slug,
      },
      qty,
    );
    toast.success("Added to cart");
  };

  return (
    <div className="container mx-auto px-4 py-10">
      <nav className="mb-6 text-xs text-muted-foreground">
        <Link to="/" className="hover:text-gold">
          Home
        </Link>{" "}
        /{" "}
        <Link to="/shop" className="hover:text-gold">
          Shop
        </Link>
        {product.categories && (
          <>
            {" "}
            /{" "}
            <Link
              to="/category/$slug"
              params={{ slug: product.categories.slug }}
              className="hover:text-gold"
            >
              {product.categories.name}
            </Link>
          </>
        )}{" "}
        / <span className="text-foreground">{product.title}</span>
      </nav>

      <div className="grid gap-10 md:grid-cols-2">
        <div className="space-y-3">
          <div className="product-gallery-hero aspect-[4/5] overflow-hidden rounded-md bg-muted">
            <img
              src={resolveImage(galleryImages[0])}
              alt={product.title}
              loading="eager"
              decoding="async"
              fetchPriority="high"
              sizes="(max-width: 768px) 100vw, 50vw"
              className="h-full w-full object-cover"
            />
          </div>
          {galleryImages.length > 1 && (
            <div className="grid grid-cols-4 gap-2">
              {galleryImages.map((src, i) => (
                <div
                  key={`${src}-${i}`}
                  className="angle-thumb aspect-square overflow-hidden rounded bg-muted"
                >
                  <img
                    src={resolveImage(src)}
                    alt={i === 0 ? `${product.title} main view` : `${product.title} angle ${i + 1}`}
                    loading="lazy"
                    decoding="async"
                    fetchPriority="low"
                    sizes="(max-width: 768px) 25vw, 12vw"
                    className="h-full w-full object-cover"
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          {product.categories && (
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold">
              {product.categories.name}
            </p>
          )}
          <h1 className="mt-2 font-display text-3xl font-bold md:text-4xl">{product.title}</h1>
          {isStaff && !product.is_published && (
            <p className="mt-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
              Draft — shoppers cannot see this until you enable Published below.
            </p>
          )}
          <div className="mt-3 flex items-baseline gap-3">
            <span className="text-2xl font-semibold text-gold">{formatKES(displayPrice)}</span>
            {onSale && (
              <span className="text-sm text-muted-foreground line-through">
                {formatKES(product.price)}
              </span>
            )}
          </div>

          {isStaff && !isAssetOnlyProduct && (
            <div className="mt-6 rounded-md border border-gold/40 bg-gold/5 p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-gold">
                Staff quick edit
              </p>
              <p className="mb-3 text-xs text-muted-foreground">
                Assign the correct category and subcategory so this item appears in the right shop
                group. Save updates the live product—no need to open the admin dashboard.
              </p>
              <div className="grid gap-2 md:grid-cols-2">
                <input
                  value={adminDraft.title}
                  onChange={(e) => setAdminDraft((d) => ({ ...d, title: e.target.value }))}
                  placeholder="Title"
                  className="rounded border border-border bg-background px-2 py-1 text-sm"
                />
                <input
                  value={adminDraft.slug}
                  onChange={(e) => setAdminDraft((d) => ({ ...d, slug: e.target.value }))}
                  placeholder="Slug"
                  className="rounded border border-border bg-background px-2 py-1 text-sm"
                />
                <select
                  value={adminDraft.category_id}
                  onChange={(e) => setAdminDraft((d) => ({ ...d, category_id: e.target.value }))}
                  className="rounded border border-border bg-background px-2 py-1 text-sm md:col-span-2"
                >
                  <option value="">No category</option>
                  {adminCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                {(() => {
                  const selectedCat = adminCategories.find((c) => c.id === adminDraft.category_id);
                  const subOpts = selectedCat?.slug
                    ? getSubcategoriesForCategory(selectedCat.slug)
                    : [];
                  return (
                    <div className="md:col-span-2">
                      <input
                        list={subOpts.length > 0 ? "staff-product-subcat" : undefined}
                        value={adminDraft.subcategory}
                        onChange={(e) =>
                          setAdminDraft((d) => ({ ...d, subcategory: e.target.value }))
                        }
                        placeholder="Subcategory (matches shop filters)"
                        className="w-full rounded border border-border bg-background px-2 py-1 text-sm"
                      />
                      {subOpts.length > 0 && (
                        <datalist id="staff-product-subcat">
                          {subOpts.map((s) => (
                            <option key={s} value={s} />
                          ))}
                        </datalist>
                      )}
                    </div>
                  );
                })()}
                <textarea
                  value={adminDraft.description}
                  onChange={(e) => setAdminDraft((d) => ({ ...d, description: e.target.value }))}
                  placeholder="Full product description (shown to customers)"
                  rows={5}
                  className="rounded border border-border bg-background px-2 py-2 text-sm md:col-span-2"
                />
                <input
                  type="number"
                  value={adminDraft.price}
                  onChange={(e) => setAdminDraft((d) => ({ ...d, price: e.target.value }))}
                  placeholder="Price"
                  className="rounded border border-border bg-background px-2 py-1 text-sm"
                />
                <input
                  type="number"
                  value={adminDraft.sale_price}
                  onChange={(e) => setAdminDraft((d) => ({ ...d, sale_price: e.target.value }))}
                  placeholder="Sale price"
                  className="rounded border border-border bg-background px-2 py-1 text-sm"
                />
                <input
                  value={adminDraft.image_url}
                  onChange={(e) => setAdminDraft((d) => ({ ...d, image_url: e.target.value }))}
                  placeholder="Image URL"
                  className="rounded border border-border bg-background px-2 py-1 text-sm md:col-span-2"
                />
                <div className="md:col-span-2">
                  <label className="mb-1 block text-xs uppercase tracking-wider text-muted-foreground">
                    Or upload image from computer
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    className="block w-full rounded border border-border bg-background px-2 py-1 text-sm"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      void uploadAdminImage(file);
                      e.currentTarget.value = "";
                    }}
                  />
                  {adminUploadingImage && (
                    <p className="mt-1 text-xs text-muted-foreground">Uploading image...</p>
                  )}
                </div>
              </div>
              <div className="mt-2 flex gap-4 text-xs">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={adminDraft.is_published}
                    onChange={(e) =>
                      setAdminDraft((d) => ({ ...d, is_published: e.target.checked }))
                    }
                  />
                  Published
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={adminDraft.is_featured}
                    onChange={(e) =>
                      setAdminDraft((d) => ({ ...d, is_featured: e.target.checked }))
                    }
                  />
                  Featured
                </label>
              </div>
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant="outline" disabled={adminBusy} onClick={saveAdminChanges}>
                  {adminBusy ? "Saving..." : "Save changes"}
                </Button>
                {isSuperAdmin && (
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={adminBusy}
                    onClick={deleteProductNow}
                  >
                    Delete product
                  </Button>
                )}
              </div>
            </div>
          )}

          {sizes.length > 0 && (
            <div className="mt-6">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider">Size</span>
                <button className="text-xs text-gold hover:underline">Size guide</button>
              </div>
              <div className="flex flex-wrap gap-2">
                {sizes.map((s) => {
                  const matching = variants.filter((x) => x.size === s);
                  const hasInStock = matching.some((x) => x.stock_quantity > 0);
                  const active = selectedSize === s;
                  const oos = matching.length === 0 || !hasInStock;
                  return (
                    <button
                      key={s}
                      onClick={() => {
                        const nextVariant =
                          variants.find((x) => x.size === s && x.stock_quantity > 0) ??
                          variants.find((x) => x.size === s) ??
                          null;
                        setSelectedSize(s);
                        setSelectedColor(nextVariant?.color ?? null);
                        setActiveVariant(nextVariant);
                      }}
                      disabled={oos}
                      className={cn(
                        "min-w-12 rounded border px-3 py-2 text-sm transition-colors",
                        active
                          ? "border-gold bg-gold text-gold-foreground"
                          : "border-border hover:border-gold",
                        oos && "cursor-not-allowed text-muted-foreground line-through opacity-50",
                      )}
                    >
                      {s}
                    </button>
                  );
                })}
              </div>
              {activeVariant && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {activeVariant.stock_quantity > 5 ? (
                    <span className="text-success">In stock</span>
                  ) : activeVariant.stock_quantity > 0 ? (
                    <span className="text-gold">Only {activeVariant.stock_quantity} left</span>
                  ) : (
                    <span className="text-destructive">Out of stock</span>
                  )}
                </p>
              )}
            </div>
          )}
          {colors.length > 0 && (
            <div className="mt-5">
              <span className="text-xs font-semibold uppercase tracking-wider">Color</span>
              <div className="mt-2 flex flex-wrap gap-2">
                {colors.map((color) => {
                  const matching = variants.filter(
                    (x) => x.color === color && (!selectedSize || x.size === selectedSize),
                  );
                  const hasInStock = matching.some((x) => x.stock_quantity > 0);
                  const active = selectedColor === color;
                  return (
                    <button
                      key={color}
                      onClick={() => {
                        const nextVariant =
                          variants.find(
                            (x) =>
                              x.color === color &&
                              (!selectedSize || x.size === selectedSize) &&
                              x.stock_quantity > 0,
                          ) ??
                          variants.find(
                            (x) => x.color === color && (!selectedSize || x.size === selectedSize),
                          ) ??
                          null;
                        setSelectedColor(color);
                        setActiveVariant(nextVariant);
                      }}
                      disabled={!hasInStock}
                      className={cn(
                        "rounded border px-3 py-2 text-sm transition-colors",
                        active
                          ? "border-gold bg-gold text-gold-foreground"
                          : "border-border hover:border-gold",
                        !hasInStock &&
                          "cursor-not-allowed text-muted-foreground line-through opacity-50",
                      )}
                    >
                      {color}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="mt-6 flex items-center gap-3">
            <div className="flex items-center rounded border border-border">
              <button onClick={() => setQty((q) => Math.max(1, q - 1))} className="px-3 py-2">
                <Minus className="h-3 w-3" />
              </button>
              <span className="w-10 text-center text-sm font-medium">{qty}</span>
              <button onClick={() => setQty((q) => q + 1)} className="px-3 py-2">
                <Plus className="h-3 w-3" />
              </button>
            </div>
            <Button
              variant="default"
              size="lg"
              onClick={handleAdd}
              disabled={!activeVariant}
              className="flex-1"
            >
              Add to cart
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => wishlist.toggle(product.id)}
              aria-label="Toggle wishlist"
              className={cn("h-11 w-11", wished && "border-gold")}
            >
              <Heart className={cn("h-5 w-5", wished && "fill-gold text-gold")} />
            </Button>
          </div>

          <div className="mt-6 rounded-md border border-border bg-card p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-gold">
              Description & Features
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-foreground/80">{product.description}</p>
            <ul className="mt-4 grid gap-2 text-sm text-foreground/85">
              {featureList.map((feature, index) => (
                <li
                  key={`${feature}-${index}`}
                  className="flex gap-2 rounded-sm bg-secondary/50 px-3 py-2"
                >
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-gold" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-8 grid grid-cols-3 gap-4 border-t border-border pt-6 text-center">
            <div className="text-xs">
              <Truck className="mx-auto mb-1 h-5 w-5 text-gold" />
              Free Nairobi delivery
            </div>
            <div className="text-xs">
              <Store className="mx-auto mb-1 h-5 w-5 text-gold" />
              In-store pickup
            </div>
            <div className="text-xs">
              <ShieldCheck className="mx-auto mb-1 h-5 w-5 text-gold" />
              14-day returns
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
