ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS in_feed boolean NOT NULL DEFAULT false;
-- Backfill: existing public posts stay in the feed to preserve current behavior.
UPDATE public.posts SET in_feed = true WHERE is_public = true;