-- Simplifies unit identity down to ONE field instead of two.
-- Before: hers_field_measurements.unit_label was a stable internal id
-- ("Unit 1", "Unit 2"...) and hers_estimates.unit_names was a separate
-- cosmetic display-name overlay ("Unit 1" -> "1A").
-- After: hers_estimates.unit_labels is an ordered array that IS the real
-- list of unit identifiers (e.g. ["1A","1B","Unit 3"]), and
-- hers_field_measurements.unit_label stores that same real identifier
-- directly - renaming a unit really renames its data, in one place.

alter table hers_estimates add column if not exists unit_labels jsonb;

-- Populate unit_labels for every existing multifamily estimate, using
-- whatever custom name was already set in unit_names, defaulting to
-- "Unit N" for anything that was never renamed.
update hers_estimates
set unit_labels = (
  select jsonb_agg(coalesce(unit_names->>('Unit '||n), 'Unit '||n) order by n)
  from generate_series(1, greatest(unit_count,1)) as n
)
where unit_labels is null;

-- Rename the actual measurement rows to match: wherever a unit had a
-- custom display name, move its data from the old internal id
-- ("Unit 1") to the new real identifier ("1A").
update hers_field_measurements fm
set unit_label = e.unit_names->>fm.unit_label
from hers_estimates e
where fm.hers_estimate_id = e.id
  and e.unit_names ? fm.unit_label
  and e.unit_names->>fm.unit_label is not null
  and e.unit_names->>fm.unit_label <> '';

-- unit_names is no longer needed - unit_labels holds the real names now.
alter table hers_estimates drop column if exists unit_names;
