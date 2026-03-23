alter table public.event_members
  add column if not exists can_use_rental_car boolean not null default false;
