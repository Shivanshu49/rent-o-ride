-- Runs once, on an empty data directory, before any migration.
--
-- app_role is the identity every USER REQUEST connects as. It is deliberately
-- NOT a superuser and deliberately NOT granted BYPASSRLS: the Phase 1 policies
-- only mean something if the connecting role is subject to them.
--
-- Table grants belong to the migration that creates the tables, not here.
CREATE ROLE app_role WITH LOGIN PASSWORD 'app_role' NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE;

GRANT CONNECT ON DATABASE rentoride TO app_role;
GRANT USAGE ON SCHEMA public TO app_role;
