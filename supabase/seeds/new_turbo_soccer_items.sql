-- New single-appearance items from the 2026-10-28 Turbo Soccer screenshots.
-- Items with color-swatch variants are intentionally excluded. Values and
-- demand remain unset until they are known.
insert into public.items (name, value, image_path, category, rarity, description)
values
  ('Arcane', null, '/catalog/community/arcane.png', 'Wheels', 'Exclusive', null),
  ('Aura Edit', null, '/catalog/community/aura-edit.png', 'Goal Explosion', 'Exclusive', null),
  ('Chronos', null, '/catalog/community/chronos.png', 'Wheels', 'Exclusive', null),
  ('Pulsar', null, '/catalog/community/pulsar.png', 'Wheels', 'Exclusive', null),
  ('Surcharge', null, '/catalog/community/surcharge.png', 'Goal Explosion', 'Exclusive', null),
  ('Top 1', null, '/catalog/community/top-1.png', 'Title', 'Exclusive', null),
  ('Diamond Wings', null, '/catalog/community/diamond-wings.png', 'Title', 'Legendary', null),
  ('Rainbow', null, '/catalog/community/rainbow.png', 'Title', 'Legendary', null),
  ('Azure', null, '/catalog/community/azure.png', 'Plate', 'Legendary', null),
  ('Blood', null, '/catalog/community/blood.png', 'Plate', 'Legendary', null),
  ('Bolt', null, '/catalog/community/bolt.png', 'Plate', 'Legendary', null),
  ('Impossible Boss', null, '/catalog/community/impossible-boss.png', 'Title', 'Legendary', null)
on conflict do nothing;
