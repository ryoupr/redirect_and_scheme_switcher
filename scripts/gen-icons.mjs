import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve(process.cwd());
const svgPath = path.join(root, 'icons', 'icon.svg');
const outDir = path.join(root, 'icons');
const sizes = [16, 32, 48, 128];

async function main() {
  const svg = await fs.readFile(svgPath);
  await Promise.all(
    sizes.map(async (size) => {
      const out = path.join(outDir, `icon${size}.png`);
      await sharp(svg).resize(size, size, { fit: 'cover' }).png().toFile(out);
      console.log('Generated', out);
    })
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
