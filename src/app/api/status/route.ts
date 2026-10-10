import { route } from "@/lib/api";
import { getStatus } from "@/lib/status";

export const GET = route(async () => getStatus());
