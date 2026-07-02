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