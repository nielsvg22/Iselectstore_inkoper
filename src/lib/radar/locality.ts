import type { Prisma } from "@prisma/client";

/** Exact source city, not a radius or a substring such as "omgeving Apeldoorn". */
export function inCityScope(location: string | null | undefined, cityOnly: string): boolean {
  return !cityOnly || (!!location && location.trim().toLocaleLowerCase("nl-NL") === cityOnly.toLocaleLowerCase("nl-NL"));
}

/** Vinted geeft geen locatie: daar geldt heel Nederland, dus het stads-, rijtijd- en afstandsbeleid van Marktplaats is niet van toepassing. */
export function marktplaatsScope(clauses: Prisma.AdvertisementWhereInput[]): Prisma.AdvertisementWhereInput {
  const real = clauses.filter((c) => Object.keys(c).length > 0);
  return real.length ? { OR: [{ source: "vinted" }, { AND: real }] } : {};
}

export function cityScopeWhere(cityOnly: string): Prisma.AdvertisementWhereInput {
  return cityOnly ? { location: { equals: cityOnly, mode: "insensitive" } } : {};
}
