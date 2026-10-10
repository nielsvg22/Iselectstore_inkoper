import { route } from "@/lib/api";
import { APPLE_MODELS } from "@/lib/catalog/apple";
import { getAppleCategories } from "@/lib/sources/category-discovery";

/** Productcatalogus (modellen) + Apple-categorieën op Marktplaats, voor de keuzelijsten. */
export const GET = route(async () => ({ models: APPLE_MODELS, categories: await getAppleCategories() }));
