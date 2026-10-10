import { z } from "zod";
import { groupSchema } from "./engines/filters";

export const savedFilterInput = z.object({
  name: z.string().trim().min(1, "Geef het filter een naam").max(80),
  tree: groupSchema,
});
export type SavedFilterInput = z.infer<typeof savedFilterInput>;
