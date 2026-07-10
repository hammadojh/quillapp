ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS style_profile jsonb,
  ADD COLUMN IF NOT EXISTS style_completed_at timestamptz;

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS depth_score int,
  ADD COLUMN IF NOT EXISTS depth_gaps jsonb;