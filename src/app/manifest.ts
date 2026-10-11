import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "iSelectStore — Apple Deal Hunter",
    short_name: "iSelectStore",
    description: "Vind, beoordeel en koop de beste tweedehands Apple-deals.",
    lang: "nl",
    start_url: "/?source=pwa",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#1F3049",
    theme_color: "#1F3049",
    categories: ["business", "shopping"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Deals", url: "/deals", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Meldingen", url: "/notifications", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
