-- Prisma needs a scratch database to diff migrations against during
-- `migrate dev`. Left to itself it creates one, which fails on any managed
-- Postgres where the app role cannot CREATE EXTENSION postgis — and then a
-- migration that is perfectly valid against the real database will not apply.
--
-- So we hand it one on this same PostGIS container, with the extensions
-- already present. Prisma resets the public schema on each run; the extensions
-- survive because they are not in it.
CREATE DATABASE rentoride_shadow;
