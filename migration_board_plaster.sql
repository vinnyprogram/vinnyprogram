-- Board & Plaster trade support, mirroring the existing hers_estimates
-- pattern (customer, address, line items, payment schedule) plus its own
-- measurement areas (floor, area type, board thickness, finish type).
-- Areas can be typed in from scratch OR imported from an existing
-- insulation project's areas/floors (same address/customer) - see the
-- "Import from Insulation" button on the page itself.

create table if not exists board_plaster_estimates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id),
  customer_id bigint references customers(id),
  address text,
  status text default 'Draft',
  line_items jsonb default '[]'::jsonb,
  payment_schedule jsonb default '[]'::jsonb,
  areas jsonb default '[]'::jsonb, -- [{id, floor, area_type, sqft, thickness, finish}]
  notes text,
  tax_rate numeric default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table companies add column if not exists offers_board_plaster boolean default false;
