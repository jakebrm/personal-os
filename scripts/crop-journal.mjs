// Usage: node crop-journal.mjs IMG_9558 <leftFrac> <topFrac> <widthFrac> <heightFrac> <outName> [rotate]
// Crops a fractional region from the EXIF-oriented (portrait) original at full res.
import sharp from 'sharp';
import path from 'path';

const SRC = `${process.env.HOME}/journalimport`;
const OUT = path.join(SRC, 'prepped');

const [base, l, t, w, h, outName, rot] = process.argv.slice(2);
const img = sharp(path.join(SRC, `${base}.jpeg`)).rotate();
const { data, info } = await img.toBuffer({ resolveWithObject: true });
let oriented = sharp(data);
let { width, height } = info;
if (width > height) {
  oriented = oriented.rotate(90);
  [width, height] = [height, width];
}
const buf = await oriented.jpeg({ quality: 92 }).toBuffer();
const region = {
  left: Math.round(width * parseFloat(l)),
  top: Math.round(height * parseFloat(t)),
  width: Math.round(width * parseFloat(w)),
  height: Math.round(height * parseFloat(h)),
};
// sharp reorders rotate before extract on a single pipeline — split into two passes
const cropped = await sharp(buf).extract(region).jpeg({ quality: 92 }).toBuffer();
let out = sharp(cropped);
if (rot) out = out.rotate(parseInt(rot, 10));
await out.resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
  .toFile(path.join(OUT, `${outName}.jpg`));
console.log(`wrote ${outName}.jpg from ${base} region`, region);
