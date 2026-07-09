-- Used for conflict detection: if a background tab/device saved more
-- recently than what the current session knows about, the save should
-- refuse to silently overwrite it instead of blindly proceeding.

alter table projects add column if not exists updated_at timestamptz default now();
