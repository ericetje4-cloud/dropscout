// ===========================================================================
// Génère les icônes PWA (192, 512, maskable-512) à partir du SVG source.
// Usage : node scripts/generate-icons.mjs
// ===========================================================================

import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const svgPath = join(root, 'public', 'favicon.svg');
const outDir = join(root, 'public', 'icons');

const svg = await readFile(svgPath);

// Icône standard : le SVG couvre tout le canvas (fond déjà inclus).
await sharp(svg).resize(192, 192).png().toFile(join(outDir, 'icon-192.png'));
await sharp(svg).resize(512, 512).png().toFile(join(outDir, 'icon-512.png'));

// Icône maskable : ajoute une marge de sécurité (~20%) sur fond plein pour
// que les plateformes puissent rogner sans perdre le contenu.
const PAD = 0.2; // 20% de marge
const size = 512;
const contentSize = Math.round(size * (1 - 2 * PAD));
const offset = Math.round((size - contentSize) / 2);

const maskable = await sharp({
  create: {
    width: size,
    height: size,
    channels: 4,
    background: { r: 14, g: 165, b: 233, alpha: 1 }, // #0ea5e9 (brand-500)
  },
})
  .composite([
    {
      input: await sharp(svg).resize(contentSize, contentSize).png().toBuffer(),
      left: offset,
      top: offset,
    },
  ])
  .png()
  .toFile(join(outDir, 'icon-maskable-512.png'));

console.log('✓ Icônes générées : icon-192.png, icon-512.png, icon-maskable-512.png');
