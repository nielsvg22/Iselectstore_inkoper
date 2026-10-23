export const MAX_PHOTOS = 6;

export const PHOTO_LABELS = ["krasvrij", "krassen", "scherm_gebarsten", "achterkant_beschadigd", "deuk_frame", "camera_beschadigd", "batterij_zichtbaar", "doos_accessoires", "stockfoto", "hoesje_glas"] as const;
export type PhotoLabel = (typeof PHOTO_LABELS)[number];

export const LABEL_INFO: Record<PhotoLabel, { emoji: string; text: string; tone: "good" | "bad" | "info" }> = {
  krasvrij: { emoji: "✨", text: "Geen krassen zichtbaar", tone: "good" },
  krassen: { emoji: "⚠️", text: "Krassen zichtbaar", tone: "bad" },
  scherm_gebarsten: { emoji: "💥", text: "Gebarsten scherm", tone: "bad" },
  achterkant_beschadigd: { emoji: "🔨", text: "Achterkant beschadigd", tone: "bad" },
  deuk_frame: { emoji: "🪨", text: "Deuk in frame", tone: "bad" },
  camera_beschadigd: { emoji: "📷", text: "Camera beschadigd", tone: "bad" },
  batterij_zichtbaar: { emoji: "🔋", text: "Batterijscherm zichtbaar", tone: "info" },
  doos_accessoires: { emoji: "📦", text: "Doos/accessoires", tone: "info" },
  stockfoto: { emoji: "🚩", text: "Lijkt een stockfoto", tone: "bad" },
  hoesje_glas: { emoji: "🛡️", text: "Hoesje/screenprotector", tone: "info" },
};

