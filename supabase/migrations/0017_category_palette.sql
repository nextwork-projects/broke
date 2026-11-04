-- Built-in category colours: one muted, distinct hue each, replacing stock Tailwind 600s.
-- The UI draws a pale disc from the colour and the glyph in the colour itself.
update public.categories c set color = v.color
from (values
  ('FOOD_AND_DRINK', '#c0662f'),            -- terracotta
  ('GROCERIES', '#b84a5e'),                 -- raspberry
  ('GENERAL_MERCHANDISE', '#a87b2a'),       -- mustard
  ('TRANSPORTATION', '#2e7a8c'),            -- petrol
  ('TRAVEL', '#3d8a6e'),                    -- sea green
  ('RENT_AND_UTILITIES', '#b08a1c'),        -- ochre
  ('ENTERTAINMENT', '#a24f7c'),             -- plum
  ('PERSONAL_CARE', '#b8708f'),             -- dusty rose
  ('MEDICAL', '#c0503f'),                   -- brick
  ('HOME_IMPROVEMENT', '#8a6a45'),          -- walnut
  ('GENERAL_SERVICES', '#5a7392'),          -- steel blue
  ('LOAN_PAYMENTS', '#6d5d8f'),             -- muted violet
  ('GOVERNMENT_AND_NON_PROFIT', '#6b7340'), -- olive
  ('BANK_FEES', '#9c4a3a'),                 -- rust
  ('INCOME', '#3f8a52'),                    -- leaf
  ('CREDIT_CARD_PAYMENT', '#6b7280'),       -- graphite
  ('TRANSFER_IN', '#7c8088'),
  ('TRANSFER_OUT', '#7c8088'),
  ('OTHER', '#8a8580')
) as v(key, color)
where c.key = v.key and c.user_id is null;
