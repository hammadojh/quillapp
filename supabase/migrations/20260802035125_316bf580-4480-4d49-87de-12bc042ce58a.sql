-- 1. Private style table
CREATE TABLE public.user_styles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  style_profile jsonb,
  style_completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_styles TO authenticated;
GRANT ALL ON public.user_styles TO service_role;

ALTER TABLE public.user_styles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own style" ON public.user_styles
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER user_styles_set_updated_at
  BEFORE UPDATE ON public.user_styles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.user_styles (user_id, style_profile, style_completed_at)
SELECT user_id, style_profile, style_completed_at
FROM public.profiles
WHERE style_profile IS NOT NULL OR style_completed_at IS NOT NULL;

ALTER TABLE public.profiles DROP COLUMN style_profile;
ALTER TABLE public.profiles DROP COLUMN style_completed_at;

-- 2. Column-limited public read of profiles
REVOKE SELECT ON public.profiles FROM anon, authenticated;
GRANT SELECT (user_id, username, display_name, bio, avatar_url, created_at) ON public.profiles TO anon, authenticated;

-- 3. Comments / likes only visible for public posts or to the post owner
DROP POLICY "Comments readable by everyone" ON public.post_comments;
CREATE POLICY "Comments readable for visible posts" ON public.post_comments
  FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.posts p
    WHERE p.id = post_comments.post_id
      AND (p.is_public = true OR p.user_id = auth.uid())
  ));

DROP POLICY "Likes readable by everyone" ON public.post_likes;
CREATE POLICY "Likes readable for visible posts" ON public.post_likes
  FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.posts p
    WHERE p.id = post_likes.post_id
      AND (p.is_public = true OR p.user_id = auth.uid())
  ));

-- 4. Storage: owner-scoped access to post thumbnails (server uses service role)
CREATE POLICY "Owners read own post thumbnails" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'post-thumbnails'
    AND EXISTS (
      SELECT 1 FROM public.posts p
      WHERE p.user_id = auth.uid()
        AND storage.objects.name = p.id::text || '.png'
    )
  );

CREATE POLICY "Owners write own post thumbnails" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'post-thumbnails'
    AND EXISTS (
      SELECT 1 FROM public.posts p
      WHERE p.user_id = auth.uid()
        AND storage.objects.name = p.id::text || '.png'
    )
  );

CREATE POLICY "Owners update own post thumbnails" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'post-thumbnails'
    AND EXISTS (
      SELECT 1 FROM public.posts p
      WHERE p.user_id = auth.uid()
        AND storage.objects.name = p.id::text || '.png'
    )
  )
  WITH CHECK (
    bucket_id = 'post-thumbnails'
    AND EXISTS (
      SELECT 1 FROM public.posts p
      WHERE p.user_id = auth.uid()
        AND storage.objects.name = p.id::text || '.png'
    )
  );

CREATE POLICY "Owners delete own post thumbnails" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'post-thumbnails'
    AND EXISTS (
      SELECT 1 FROM public.posts p
      WHERE p.user_id = auth.uid()
        AND storage.objects.name = p.id::text || '.png'
    )
  );

-- 5. SECURITY DEFINER counters are server-only
REVOKE EXECUTE ON FUNCTION public.increment_post_views(uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.increment_post_shares(uuid) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.increment_post_views(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.increment_post_shares(uuid) TO service_role;