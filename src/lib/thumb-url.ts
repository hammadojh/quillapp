export function thumbUrl(postId: string, stamp?: string | null): string {
  const v = stamp ? `?v=${encodeURIComponent(stamp)}` : "";
  return `/api/public/thumb/${postId}.png${v}`;
}