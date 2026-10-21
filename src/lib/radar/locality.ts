import type { Prisma } from "@prisma/client";

/** Exact source city, not a radius or a substring such as "omgeving Apeldoorn". */
export function inCityScope(location: string | null | undefined, cityOnly: string): boolean {
  return !cityOnly || (!!location && location.trim().toLocaleLowerCase("nl-NL") === cityOnly.toLocaleLowerCase("nl-NL"));
}

export function cityScopeWhere(cityOnly: string): Prisma.AdvertisementWhereInput {
  return cityOnly ? { location: { equals: cityOnly, mode: "insensitive" } } : {};
}
