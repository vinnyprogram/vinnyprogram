-- Lets each unit have a custom display name (e.g. "1A", "2C") without
-- changing the internal identifier ("Unit 1", "Unit 2"...) that's already
-- used to store/query measurements, link Measure/Report/Duplicate, etc.
-- Keeping the internal id stable avoids having to rename any existing
-- hers_field_measurements rows when a display name changes.

alter table hers_estimates add column if not exists unit_names jsonb default '{}'::jsonb;
-- Shape: { "Unit 1": "1A", "Unit 3": "3A" } - only units with a custom
-- name get an entry; anything missing just displays as "Unit N".
