
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS views_count integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.increment_post_views(_post_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.posts
  SET views_count = views_count + 1
  WHERE id = _post_id AND is_public = true;
$$;

GRANT EXECUTE ON FUNCTION public.increment_post_views(uuid) TO anon, authenticated;
