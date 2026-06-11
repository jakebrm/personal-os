import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const SRC = `${process.env.HOME}/journalimport`;
const OUT = path.join(SRC, 'prepped');
fs.mkdirSync(OUT, { recursive: true });

const files = fs.readdirSync(SRC).filter(f => /^IMG_\d+\.jpeg$/i.test(f)).sort();

for (const f of files) {
  const base = path.basename(f, path.extname(f));
  const img = sharp(path.join(SRC, f)).rotate(); // EXIF auto-orient
  const { data, info } = await img.toBuffer({ resolveWithObject: true });
  let oriented = sharp(data);
  let { width, height } = info;
  // notebook pages are portrait; if landscape after EXIF, rotate 90 more
  if (width > height) {
    oriented = oriented.rotate(90);
    [width, height] = [height, width];
  }
  const buf = await oriented.jpeg({ quality: 92 }).toBuffer();
  const full = sharp(buf);
  // full page (capped) + top/bottom halves at high res for readability
  await full.clone().resize({ width: 1500, withoutEnlargement: true }).toFile(path.join(OUT, `${base}_full.jpg`));
  const meta = await full.metadata();
  const W = meta.width, H = meta.height;
  const halfH = Math.ceil(H / 2);
  await full.clone().extract({ left: 0, top: 0, width: W, height: halfH })
    .resize({ width: 2000, withoutEnlargement: true }).toFile(path.join(OUT, `${base}_top.jpg`));
  await full.clone().extract({ left: 0, top: H - halfH, width: W, height: halfH })
    .resize({ width: 2000, withoutEnlargement: true }).toFile(path.join(OUT, `${base}_bot.jpg`));
  console.log(`${f}: ${W}x${H} -> full/top/bot`);
}
