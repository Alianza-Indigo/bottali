import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const THEME_COLOR = "#1d4ed8";
const BACKGROUND_COLOR = "#ffffff";
const MONOGRAM = "CP";

function iconSvg({ size, padding, background, foreground }: { size: number; padding: number; background: string; foreground: string }) {
  const inner = size - padding * 2;
  const radius = inner * 0.22;
  const fontSize = inner * 0.42;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${background}" />
  <rect x="${padding}" y="${padding}" width="${inner}" height="${inner}" rx="${radius}" fill="${foreground}" />
  <text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="${fontSize}" fill="${background}">${MONOGRAM}</text>
</svg>`;
}

const TARGETS: Array<{ file: string; size: number; padding: number }> = [
  { file: "icon-192.png", size: 192, padding: 0 },
  { file: "icon-512.png", size: 512, padding: 0 },
  // Maskable icons are cropped to arbitrary shapes by the OS; keep the glyph inside the ~80% safe zone.
  { file: "icon-maskable-512.png", size: 512, padding: 64 },
  { file: "apple-touch-icon.png", size: 180, padding: 0 },
];

async function main() {
  const outDir = path.join(process.cwd(), "public", "icons");
  await mkdir(outDir, { recursive: true });

  for (const target of TARGETS) {
    const svg = iconSvg({ size: target.size, padding: target.padding, background: BACKGROUND_COLOR, foreground: THEME_COLOR });
    const outPath = path.join(outDir, target.file);
    await sharp(Buffer.from(svg)).png().toFile(outPath);
    console.log(`Generado ${target.file} (${target.size}x${target.size})`);
  }

  console.log("Íconos PWA generados en public/icons/.");
}

main().catch((error) => {
  console.error("Fallo al generar íconos PWA:", error);
  process.exit(1);
});
