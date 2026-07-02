import { PNG } from "pngjs";
import jpeg from "jpeg-js";

const TARGET_WIDTH = 1200;
const TARGET_HEIGHT = 630;
const TARGET_RATIO = TARGET_WIDTH / TARGET_HEIGHT;

type DecodedPng = {
  width: number;
  height: number;
  data: Uint8Array;
};

function cropToSocialRatio(image: DecodedPng) {
  const sourceRatio = image.width / image.height;
  if (sourceRatio > TARGET_RATIO) {
    const width = Math.round(image.height * TARGET_RATIO);
    return { x: Math.floor((image.width - width) / 2), y: 0, width, height: image.height };
  }
  const height = Math.round(image.width / TARGET_RATIO);
  return { x: 0, y: Math.floor((image.height - height) / 2), width: image.width, height };
}

export function pngBytesToSocialJpeg(bytes: ArrayBuffer | Uint8Array, quality = 82): Uint8Array {
  const input = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const png = PNG.sync.read(Buffer.from(input)) as DecodedPng;
  const crop = cropToSocialRatio(png);
  const out = new Uint8Array(TARGET_WIDTH * TARGET_HEIGHT * 4);

  for (let y = 0; y < TARGET_HEIGHT; y++) {
    const sy = crop.y + Math.min(crop.height - 1, Math.floor((y / TARGET_HEIGHT) * crop.height));
    for (let x = 0; x < TARGET_WIDTH; x++) {
      const sx = crop.x + Math.min(crop.width - 1, Math.floor((x / TARGET_WIDTH) * crop.width));
      const src = (sy * png.width + sx) * 4;
      const dst = (y * TARGET_WIDTH + x) * 4;
      out[dst] = png.data[src];
      out[dst + 1] = png.data[src + 1];
      out[dst + 2] = png.data[src + 2];
      out[dst + 3] = 255;
    }
  }

  return jpeg.encode({ data: Buffer.from(out), width: TARGET_WIDTH, height: TARGET_HEIGHT }, quality).data;
}

export const SOCIAL_IMAGE_HEADERS = {
  "Content-Type": "image/jpeg",
  "Content-Disposition": "inline",
  "X-Content-Type-Options": "nosniff",
} as const;