create table if not exists public.deleted_product_slugs (
  slug text primary key,
  deleted_at timestamptz not null default now()
);

alter table public.deleted_product_slugs enable row level security;

drop policy if exists "Public read deleted product slugs" on public.deleted_product_slugs;
create policy "Public read deleted product slugs"
  on public.deleted_product_slugs
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Admin insert deleted product slugs" on public.deleted_product_slugs;
create policy "Admin insert deleted product slugs"
  on public.deleted_product_slugs
  for insert
  to authenticated
  with check (public.has_role(auth.uid(), 'admin'));

create or replace function public.delete_product_completely(p_product_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slug text;
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'not authorized';
  end if;

  select slug into v_slug
  from public.products
  where id = p_product_id;

  delete from public.product_images where product_id = p_product_id;
  delete from public.product_variants where product_id = p_product_id;
  delete from public.products where id = p_product_id;

  if v_slug is not null then
    insert into public.deleted_product_slugs (slug)
    values (v_slug)
    on conflict (slug) do update
      set deleted_at = now();
  end if;
end;
$$;

grant execute on function public.delete_product_completely(uuid) to authenticated;
