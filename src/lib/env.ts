/** Centrale, gevalideerde toegang tot omgevingsvariabelen. */
export function appSecret(): string {
  const s = process.env.APP_SECRET;
  if (!s || s.length < 32) {
    throw new Error("APP_SECRET ontbreekt of is korter dan 32 tekens. Genereer er één met: openssl rand -hex 32");
  }
  return s;
}

export const isProd = () => process.env.NODE_ENV === "production";
