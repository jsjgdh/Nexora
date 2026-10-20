-- The price of a seat becomes a QUOTE, and a quote is made when the licence is
-- confirmed rather than when the cohort is created.
--
-- The site stopped publishing a per-student list price for a school licence or
-- a team licence, because the price depends on the cohort, the term, the
-- courses, and whether one lecturer or a whole institution is buying. A
-- published price is a price the studio has to honour afterwards.
--
-- The platform already behaved that way: a cohort is created in `pending` and
-- the studio confirms the licence, so nothing has ever been bought at a
-- checkout. What was wrong was the record. The row used to carry a list price
-- from the moment it was created, so a licence that nobody had quoted yet was
-- already priced at $19 a student, and the number in the record was a number
-- nobody had agreed to.
--
-- So the constraint now allows zero, and zero means "not yet quoted":
--
--   pending   per_student_cents is 0. There is no price, because there has
--             been no quote.
--   active    per_student_cents is what was quoted. The operator states it at
--             confirmation, the same way they state the seat count, because the
--             operator is the one who knows what was bought.
--
-- A confirmed licence with a price of zero would be a licence nobody paid
-- for, so the route that confirms one refuses a zero. The database allows it
-- for the pending state and the route does not.
--
-- The check constraint is replaced rather than dropped, so the column still
-- cannot hold a negative price.
ALTER TABLE cohorts
  DROP CONSTRAINT IF EXISTS cohorts_per_student_cents_check;

ALTER TABLE cohorts
  ADD CONSTRAINT cohorts_per_student_cents_check CHECK (per_student_cents >= 0);

COMMENT ON COLUMN cohorts.per_student_cents IS
  'The quoted price of one seat in cents. Zero while the licence is pending: there is no price until there is a quote. Set by the operator when the licence is confirmed.';
