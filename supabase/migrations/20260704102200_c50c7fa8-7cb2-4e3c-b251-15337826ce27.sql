CREATE OR REPLACE FUNCTION public.increment_post_shares(_post_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  UPDATE public.posts
  SET shares_count = shares_count + 1
  WHERE id = _post_id AND is_public = true;
$function$;

REVOKE EXECUTE ON FUNCTION public.increment_post_shares(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_post_shares(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_post_shares(uuid) TO service_role;