-- Match the original database, which has always allowed these empty: it
-- holds a transaction with no customer and three with no linked account.
-- Found by scripts/copy-database.mjs on 2026-10-20 while copying that
-- database into staging. The initial schema had both as NOT NULL; the live
-- database had dropped that by hand at some point.
ALTER TABLE public.transactions ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.transactions ALTER COLUMN account_used DROP NOT NULL;
