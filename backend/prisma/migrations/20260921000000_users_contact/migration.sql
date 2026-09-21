-- A Supabase user who signed up by email has no phone, and one who signed up by
-- phone OTP has no email. Making either column NOT NULL breaks user bootstrap
-- for half our sign-in paths, with a constraint violation on the very first
-- authenticated request.
--
-- The real requirement is weaker than "phone is present": it is "we can reach
-- this person". That is what the CHECK says, so the database still refuses a
-- user row with neither.
--
-- Note the two `period` statements Prisma's diff also proposes are deliberately
-- NOT here: it reads a STORED GENERATED expression as a DEFAULT, and Postgres
-- rejects dropping it. See the header of 20260920000000_init.

ALTER TABLE "users" ALTER COLUMN "phone" DROP NOT NULL;

ALTER TABLE "users" ADD CONSTRAINT "users_contactable"
  CHECK ("phone" IS NOT NULL OR "email" IS NOT NULL);
