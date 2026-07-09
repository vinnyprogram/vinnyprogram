-- A plain-text snapshot of the current measurements, stored directly on
-- the project row itself - completely independent of the areas/floors
-- tables. Written BEFORE any delete/insert touches those tables, so even
-- a total failure or wipe of areas/floors can never take this down with
-- it. This is the "memo" backup: not queried live, just a durable copy
-- of what was last known to be correct.

alter table projects add column if not exists measurement_snapshot text;
