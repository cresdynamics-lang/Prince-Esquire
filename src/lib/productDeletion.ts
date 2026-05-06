import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const PRODUCT_IMAGES_BUCKET = "product-images";
const DELETED_PRODUCT_SLUGS_TABLE = "deleted_product_slugs" as never;

type ProductImageRow = { image_url: string | null };
type DeletedSlugRow = { slug: string | null };

function storagePathFromPublicUrl(imageUrl: string): string | null {
  if (!imageUrl) return null;
  const marker = `/storage/v1/object/public/${PRODUCT_IMAGES_BUCKET}/`;
  const markerIndex = imageUrl.indexOf(marker);
  if (markerIndex === -1) return null;
  const rawPath = imageUrl.slice(markerIndex + marker.length).split("?")[0];
  try {
    return decodeURIComponent(rawPath);
  } catch {
    return rawPath;
  }
}

function isMissingDeleteRpc(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const err = error as { code?: string; message?: string };
  return err.code === "42883" || String(err.message ?? "").includes("delete_product_completely");
}

async function insertDeletedSlugTombstone(supabase: SupabaseClient<Database>, slug: string) {
  const { error } = await supabase.from("deleted_product_slugs" as never).insert({ slug });
  return error ?? null;
}

async function deleteProductRowsDirectly(supabase: SupabaseClient<Database>, productId: string) {
  const { data: productRow, error: productReadError } = await supabase
    .from("products")
    .select("slug")
    .eq("id", productId)
    .maybeSingle();

  if (productReadError) return productReadError;

  const [{ error: imagesError }, { error: variantsError }, { error: productsError }] =
    await Promise.all([
      supabase.from("product_images").delete().eq("product_id", productId),
      supabase.from("product_variants").delete().eq("product_id", productId),
      supabase.from("products").delete().eq("id", productId),
    ]);

  const directError = imagesError ?? variantsError ?? productsError ?? null;
  if (directError) return directError;

  if (productRow?.slug) {
    const tombstoneError = await insertDeletedSlugTombstone(supabase, productRow.slug);
    if (tombstoneError) return tombstoneError;
  }

  return null;
}

export async function deleteProductCompletely(
  supabase: SupabaseClient<Database>,
  productId: string,
) {
  const { data: imageRows, error: imageReadError } = await supabase
    .from("product_images")
    .select("image_url")
    .eq("product_id", productId);

  if (imageReadError) return { error: imageReadError };

  const storagePaths = Array.from(
    new Set(
      (imageRows ?? [])
        .map((row: ProductImageRow) => storagePathFromPublicUrl(String(row.image_url ?? "")))
        .filter((path): path is string => Boolean(path)),
    ),
  );

  if (storagePaths.length > 0) {
    const { error: storageError } = await supabase.storage
      .from(PRODUCT_IMAGES_BUCKET)
      .remove(storagePaths);
    if (storageError) return { error: storageError };
  }

  const { error } = await supabase.rpc("delete_product_completely", {
    p_product_id: productId,
  });
  if (!error) return { error: null };

  if (!isMissingDeleteRpc(error)) {
    return { error };
  }

  const directError = await deleteProductRowsDirectly(supabase, productId);
  return { error: directError };
}

export async function fetchDeletedProductSlugs(supabase: SupabaseClient<Database>) {
  const { data, error } = await supabase.from(DELETED_PRODUCT_SLUGS_TABLE).select("slug");
  if (error) return { data: [] as string[], error };
  return {
    data: (data ?? []).map((row: DeletedSlugRow) => String(row.slug ?? "").trim()).filter(Boolean),
    error: null,
  };
}

export async function wasProductDeletedBySlug(supabase: SupabaseClient<Database>, slug: string) {
  const { data, error } = await supabase
    .from(DELETED_PRODUCT_SLUGS_TABLE)
    .select("slug")
    .eq("slug", slug)
    .maybeSingle();
  return { deleted: Boolean(data), error };
}
