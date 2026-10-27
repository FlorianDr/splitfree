-- How a person can be paid back, entered by them in settings. It belongs to the person like their
-- display name, which doubles as the account holder name: name, IBAN and Wero link are saved
-- together, and only that contact's own user ever writes them.
-- iban: normalized (uppercase, no spaces; checked in lib/iban.ts).
-- wero_link: their Wero share link, rebuilt from its allowed parts (lib/wero.ts), never as typed.

ALTER TABLE contacts ADD COLUMN iban TEXT;
ALTER TABLE contacts ADD COLUMN wero_link TEXT;
