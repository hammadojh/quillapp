ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS shares_count integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.increment_post_shares(_post_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.posts SET shares_count = shares_count + 1 WHERE id = _post_id;
END;
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.posts TO authenticated;
GRANT ALL ON public.posts TO service_role;
GRANT EXECUTE ON FUNCTION public.increment_post_shares(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_post_shares(uuid) TO service_role;