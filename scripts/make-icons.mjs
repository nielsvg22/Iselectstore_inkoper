// Genereert PWA-iconen en iOS-splashschermen in de iSelectStore-huisstijl (navy #1F3049, coral #F9858B).
import sharp from "sharp";
import { writeFileSync } from "node:fs";

const NAVY = "#1F3049";
const CORAL = "#F9858B";
const mark = (cx, cy, s) => {
  const k = s / 64;
  const p = (x, y) => `${cx + (x - 33) * k},${cy + (y - 33) * k}`;
  const lines = [[36, 9], [55, 22], [47, 54], [18, 52], [9, 36]].map(([x, y]) => `<path d="M${p(33, 33)} L${p(x, y)}"/>`).join("");
  return `<g fill="none" stroke="${CORAL}" stroke-width="${9 * k}" stroke-linecap="round">${lines}</g>`;
};
const icon = (size, { maskable = false, rounded = true } = {}) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" rx="${maskable || !rounded ? 0 : size * 0.22}" fill="${NAVY}"/>${mark(size / 2, size / 2, size * (maskable ? 0.5 : 0.62))}</svg>`;
const out = async (svg, file) => sharp(Buffer.from(svg)).png().toFile(file);

await out(icon(192), "public/icons/icon-192.png");
await out(icon(512), "public/icons/icon-512.png");
await out(icon(512, { maskable: true }), "public/icons/maskable-512.png");
await out(icon(180, { rounded: false }), "public/icons/apple-touch-icon.png"); // iOS maskeert zelf
await out(icon(96), "public/icons/badge-96.png");
writeFileSync("public/icons/icon.svg", icon(512));

const splash = (w, h) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="${NAVY}"/>${mark(w / 2, h / 2 - h * 0.03, Math.min(w, h) * 0.26)}<text x="${w / 2}" y="${h / 2 + Math.min(w, h) * 0.27}" font-family="Poppins, Helvetica, Arial, sans-serif" font-size="${Math.min(w, h) * 0.065}" font-weight="600" fill="#fff" text-anchor="middle">iSelectStore</text></svg>`;
// breedte x hoogte in pixels (portret) voor gangbare iPhones/iPads
const sizes = [[1290, 2796], [1179, 2556], [1284, 2778], [1170, 2532], [1125, 2436], [828, 1792], [750, 1334], [1668, 2388], [2048, 2732]];
for (const [w, h] of sizes) await out(splash(w, h), `public/splash/${w}x${h}.png`);
console.log("klaar");
