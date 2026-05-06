import { getCatalogGroupBySlug } from "@/lib/catalogTaxonomy";

type ProductCopyInput = {
  title: string;
  categorySlug?: string | null;
  categoryName?: string | null;
  subcategoryName?: string | null;
};

type CopyProfile = {
  material: string;
  fit: string;
  occasion: string;
  styling: string;
  care: string;
};

function normalizeText(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function titleCase(value: string) {
  return value
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function inferCategorySlugFromText(text: string) {
  const value = normalizeText(text);
  if (/(sock)/.test(value)) return "socks";
  if (/(polo)/.test(value)) return "polo-t-shirts";
  if (/(shoe|loafer|oxford|boot|sandal)/.test(value)) return "shoes";
  if (
    /(three-piece|3 piece|3-piece|two-piece|2 piece|wedding suit|suit)/.test(value) &&
    !/(track)/.test(value)
  ) {
    return "suits";
  }
  if (/(blazer)/.test(value)) return "blazers";
  if (/(track|jogger|athleisure)/.test(value)) return "track-suits";
  if (/(jacket|coat|bomber|gilet|vest)/.test(value)) return "jackets";
  if (/(khaki|chino|jean|gurkha|trouser|pant)/.test(value)) return "trousers";
  if (/(linen)/.test(value)) return "linen";
  if (/(cap|hat)/.test(value)) return "caps-hats";
  if (/(belt|tie)/.test(value)) return "belts-ties";
  if (/(sweater|knitwear|cardigan|pullover)/.test(value)) return "sweaters";
  if (/(t-shirt|tee|sweat-shirt|sweatshirt|round-neck|round neck|v-neck|v neck)/.test(value)) {
    return "t-shirts";
  }
  if (/(shirt|presidential)/.test(value)) return "shirts";
  return "shirts";
}

function baseProfile(categorySlug: string) {
  const group = getCatalogGroupBySlug(categorySlug);
  const categoryName = group?.name ?? titleCase(categorySlug.replace(/-/g, " "));

  const profiles: Record<string, CopyProfile> = {
    suits: {
      material: "a premium suiting blend with a refined drape",
      fit: "a structured tailored fit that sharpens the shoulders and line of the leg",
      occasion: "weddings, business functions, church services, and formal evening plans",
      styling: "pairs effortlessly with polished shoes, crisp shirts, and clean accessories",
      care: "dry clean to preserve the structure, finish, and long-term shape",
    },
    shirts: {
      material: "a breathable shirting fabric chosen for comfort and a cleaner finish",
      fit: "a modern fit that stays easy through the body without looking loose",
      occasion: "office dressing, dinners, celebrations, and elevated everyday wear",
      styling:
        "works well tucked into trousers, layered under blazers, or styled open for relaxed polish",
      care: "machine wash cold and finish with a warm iron for the sharpest result",
    },
    shoes: {
      material: "a durable upper with a comfort-led interior and dependable sole grip",
      fit: "a supportive shape built for confident all-day wear",
      occasion: "workdays, events, smart travel, and dressed-up weekend outfits",
      styling: "grounds tailoring, denim, and smart-casual looks with a more finished edge",
      care: "wipe clean, air out after wear, and store with support to help maintain shape",
    },
    blazers: {
      material: "a structured tailoring fabric that keeps the silhouette looking clean",
      fit: "a sharp layer-friendly cut with room for shirts and light knitwear underneath",
      occasion: "meetings, dinners, celebrations, and refined smart-casual dressing",
      styling: "easy to pair with trousers, denim, or chinos when a full suit feels unnecessary",
      care: "spot clean where possible and dry clean when needed to protect the structure",
    },
    "track-suits": {
      material: "a lightweight performance-inspired fabric designed for comfort and movement",
      fit: "an athletic modern cut that stays neat without feeling restrictive",
      occasion: "travel, active days, casual errands, and clean off-duty styling",
      styling:
        "wear together for a matched look or break the set up with basics for daily rotation",
      care: "machine wash cold and air dry for longer-lasting colour and fabric recovery",
    },
    jackets: {
      material: "a dependable outerwear fabric chosen for texture, structure, and repeat wear",
      fit: "a versatile layer-ready shape that sits clean over tees, shirts, and knitwear",
      occasion: "cool mornings, evening outings, travel days, and transitional-weather dressing",
      styling: "adds depth quickly to simple outfits without overcomplicating the look",
      care: "follow the garment label and avoid excessive heat to protect the outer finish",
    },
    trousers: {
      material: "a woven fabric selected for comfort, shape retention, and daily reliability",
      fit: "a clean leg line that balances polish with easy movement",
      occasion: "office wear, city errands, dinners, travel, and repeat smart-casual use",
      styling: "pairs cleanly with shirts, polos, knitwear, and both formal and relaxed footwear",
      care: "gentle wash or dry clean depending on fabric weight, then press on low heat",
    },
    linen: {
      material: "a breathable linen-led fabric that keeps the look light and comfortable",
      fit: "an easy refined fit designed for movement in warmer weather",
      occasion: "sunny workdays, holidays, garden events, brunches, and warm-weather occasions",
      styling: "works best with loafers, sandals, open-collar shirts, and clean minimal layers",
      care: "gentle wash or dry clean to preserve the natural texture and relaxed drape",
    },
    "caps-hats": {
      material: "a durable headwear build designed for comfort, structure, and repeat styling",
      fit: "an easy everyday profile with a balanced crown and wearable shape",
      occasion: "travel, weekend looks, casual dressing, and adding personality to simple outfits",
      styling: "an easy finishing touch when the outfit needs texture, shade, or attitude",
      care: "spot clean and store out of direct heat to help maintain the shape",
    },
    "belts-ties": {
      material: "quality accessory construction designed to keep its finish and presentation",
      fit: "a smart, practical profile made to complete a polished outfit",
      occasion: "formalwear, office dressing, events, and sharper smart-casual styling",
      styling: "the fastest way to make suiting and dress separates look more intentional",
      care: "store neatly after wear and avoid excessive moisture or direct heat exposure",
    },
    socks: {
      material: "a comfort-focused knit built for softness, breathability, and daily wear",
      fit: "an easy flexible fit that stays comfortable through longer days",
      occasion: "office dressing, daily routines, events, and dependable everyday rotation",
      styling:
        "keeps formal shoes, loafers, and casual pairs feeling more complete and comfortable",
      care: "machine wash cold and air dry when possible to protect the stretch and feel",
    },
    sweaters: {
      material: "a soft knit fabric chosen for warmth, texture, and easy layering",
      fit: "a comfortable modern shape that layers neatly without bulk",
      occasion: "cool-weather commutes, office layering, relaxed evenings, and travel dressing",
      styling:
        "works over shirts, under jackets, or with trousers and denim for effortless balance",
      care: "hand wash or use a gentle cycle to help preserve the knit finish",
    },
    "polo-t-shirts": {
      material: "a soft polo fabric with breathable comfort and an elevated casual hand feel",
      fit: "a clean modern cut that stays flattering without feeling overfitted",
      occasion: "weekend plans, travel, office-casual days, and easy smart dressing",
      styling: "wear it with chinos, denim, shorts, or layered under light outerwear",
      care: "machine wash cold and reshape lightly after washing for the best finish",
    },
    "t-shirts": {
      material: "a comfortable jersey or knit fabric made for easy repeat wear",
      fit: "a relaxed but clean shape suited to layering or wearing solo",
      occasion: "everyday rotation, casual plans, travel, and off-duty wardrobes",
      styling: "an easy base layer for jackets, overshirts, knitwear, and relaxed trousers",
      care: "machine wash cold and avoid over-drying to keep the handle looking fresh",
    },
  };

  return {
    categoryName,
    profile: profiles[categorySlug] ?? {
      material: "quality menswear fabric with a dependable feel",
      fit: "a balanced fit designed to stay clean and wearable",
      occasion: "day-to-evening dressing, repeat wear, and versatile styling",
      styling: "pairs easily with the rest of a modern menswear wardrobe",
      care: "follow the garment label for the best long-term wear",
    },
  };
}

function overrideProfile(
  title: string,
  subcategoryName: string | null | undefined,
  profile: CopyProfile,
) {
  const text = `${normalizeText(title)} ${normalizeText(subcategoryName)}`;
  const next = { ...profile };

  if (/(linen)/.test(text)) {
    next.material = "a breathable linen-rich fabric that stays cool and light in warm weather";
  }
  if (/(formal)/.test(text)) {
    next.fit = "a sharper formal profile with clean, composed lines";
  }
  if (/(casual)/.test(text)) {
    next.fit = "a relaxed modern fit built for comfort and repeat wear";
  }
  if (/(denim)/.test(text)) {
    next.material = "a structured denim fabric with everyday durability and texture";
  }
  if (/(loafer|oxford|boot|sandal)/.test(text)) {
    next.material = "a well-finished upper with dependable sole grip and all-day wearability";
  }
  if (/(knitted|knit)/.test(text)) {
    next.material = "a textured knit fabric that adds softness and a richer surface finish";
  }
  if (/(three piece|3 piece|3-piece)/.test(text)) {
    next.styling =
      "ideal when you want a fuller formal look with stronger presence and layered elegance";
  }

  return next;
}

export function buildProductDescription({
  title,
  categorySlug,
  categoryName,
  subcategoryName,
}: ProductCopyInput) {
  const slug =
    categorySlug ||
    inferCategorySlugFromText(`${title} ${categoryName ?? ""} ${subcategoryName ?? ""}`);
  const { categoryName: resolvedCategoryName, profile } = baseProfile(slug);
  const finalCategoryName = categoryName?.trim() || resolvedCategoryName;
  const tuned = overrideProfile(title, subcategoryName, profile);
  const subcategoryLead = subcategoryName?.trim()
    ? ` within our ${subcategoryName.trim()} edit`
    : "";
  const keywordLead =
    getCatalogGroupBySlug(slug)?.description ??
    `${finalCategoryName} curated for modern menswear styling.`;

  return `${title} is a standout ${finalCategoryName.toLowerCase()} piece${subcategoryLead}, created for men who want a confident look without giving up comfort. Built from ${tuned.material}, it offers ${tuned.fit}. Ideal for ${tuned.occasion}, it ${tuned.styling}. ${keywordLead} Care: ${tuned.care}. Fast Nairobi fulfilment and nationwide delivery available.`;
}

export function buildProductFeatures({
  title,
  categorySlug,
  categoryName,
  subcategoryName,
}: ProductCopyInput) {
  const slug =
    categorySlug ||
    inferCategorySlugFromText(`${title} ${categoryName ?? ""} ${subcategoryName ?? ""}`);
  const { profile } = baseProfile(slug);
  const tuned = overrideProfile(title, subcategoryName, profile);

  return [
    `Material: ${tuned.material}.`,
    `Fit: ${tuned.fit}.`,
    `Best for: ${tuned.occasion}.`,
    `Styling: ${tuned.styling}.`,
    `Care: ${tuned.care}.`,
  ];
}
