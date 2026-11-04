-- Built-in categories move to Apple's system colours (Max, 2026-11-01: the muted set "looks so AI").
-- Things people don't budget get neutral greys. Custom categories keep the colour they have.
update public.categories c set color = v.color
from (values
  ('RENT_AND_UTILITIES', '#5856D6'),
  ('FOOD_AND_DRINK', '#FF9500'),
  ('GROCERIES', '#34C759'),
  ('GENERAL_MERCHANDISE', '#FF2D55'),
  ('TRANSPORTATION', '#007AFF'),
  ('TRAVEL', '#32ADE6'),
  ('ENTERTAINMENT', '#AF52DE'),
  ('MEDICAL', '#FF3B30'),
  ('HOME_IMPROVEMENT', '#A2845E'),
  ('PERSONAL_CARE', '#00C7BE'),
  ('INCOME', '#34C759'),
  ('LOAN_PAYMENTS', '#5856D6'),
  ('GENERAL_SERVICES', '#8E8E93'),
  ('GOVERNMENT_AND_NON_PROFIT', '#8E8E93'),
  ('BANK_FEES', '#8E8E93'),
  ('OTHER', '#8E8E93'),
  ('CREDIT_CARD_PAYMENT', '#8E8E93'),
  ('TRANSFER_IN', '#8E8E93'),
  ('TRANSFER_OUT', '#8E8E93')
) as v(key, color)
where c.user_id is null and c.key = v.key;
