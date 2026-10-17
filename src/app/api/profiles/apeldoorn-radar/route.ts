import { route } from "@/lib/api";
import { installApeldoornRadar } from "@/lib/radar/provision";

/** Eenmalige, expliciete vervanging; back-up gebeurt vóór verwijderen. */
export const POST = route(
  async (_req, { user }) => await installApeldoornRadar(user.id),
  { admin: true },
);
