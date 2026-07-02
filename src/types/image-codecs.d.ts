declare module "pngjs" {
  export const PNG: {
    sync: {
      read(input: Buffer): { width: number; height: number; data: Buffer };
    };
  };
}

declare module "jpeg-js" {
  const jpeg: {
    encode(
      image: { data: Buffer | Uint8Array; width: number; height: number },
      quality?: number,
    ): { data: Buffer };
  };
  export default jpeg;
}

declare module "upng-js" {
  const UPNG: {
    decode(buffer: ArrayBuffer): { width: number; height: number; depth: number; ctype: number; frames: unknown[]; tabs: unknown; data: Uint8Array };
    toRGBA8(img: unknown): ArrayBuffer[];
  };
  export default UPNG;
}