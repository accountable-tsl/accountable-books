## Database Setup

Target production setup:

- Neon owner/admin role is used only for database-level setup
- `migrator` runs migrations
- `appuser` runs the application
- `readonly` is optional
- `app` is the application schema
- `public` is kept for extensions and system objects

Use these URLs:

- `DATABASE_MIGRATION_URL` -> `migrator`, direct connection
- `DATABASE_URL` -> `appuser`, runtime connection

## 1. Create the project and database in Neon

Create the Neon project first, then create the database you want the app to use.

Prefer underscores in database names.

Recommended names:

- production: `accountable_books`
- staging: `accountable_books_staging`

Example:

```sql
CREATE DATABASE <db_name>;
```

## 2. Create limited roles using SQL

Do not create app roles in the Neon Console.

Connect manually as the Neon owner/admin role and run:

- you may create roles from any database in the same Neon branch
- all later database and schema grants must be run while connected to the target application database

```sql
CREATE ROLE migrator
  WITH LOGIN
  PASSWORD '<strong-password>'
  NOCREATEDB
  NOCREATEROLE
  NOREPLICATION
  NOBYPASSRLS;

CREATE ROLE appuser
  WITH LOGIN
  PASSWORD '<strong-password>'
  NOCREATEDB
  NOCREATEROLE
  NOREPLICATION
  NOBYPASSRLS;

CREATE ROLE readonly
  WITH LOGIN
  PASSWORD '<strong-password>'
  NOCREATEDB
  NOCREATEROLE
  NOREPLICATION
  NOBYPASSRLS;
```

## 3. Connect as the Neon owner/admin role

Run the database-level setup below using the owner/admin connection.

## 4. Set the database timezone

```sql
ALTER DATABASE <db_name> SET timezone TO 'UTC';
```

## 5. Install required extensions

Install extensions using the owner/admin role:

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS pg_uuidv7;
CREATE EXTENSION IF NOT EXISTS pg_cron;
```

`pg_cron` is required for this system because database-scheduled jobs are part of the design.

Only trusted admin-controlled cron jobs should be created. Application users must not be allowed to create or modify cron jobs.

## 6. Create the application schema

```sql
CREATE SCHEMA IF NOT EXISTS app;
ALTER SCHEMA app OWNER TO migrator;
```

## 7. Lock down `public`

`public` should stay usable for extensions, but app roles should not create objects there.

```sql
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM migrator;
REVOKE CREATE ON SCHEMA public FROM appuser;

GRANT USAGE ON SCHEMA public TO migrator;
GRANT USAGE ON SCHEMA public TO appuser;
```

If `readonly` exists:

```sql
REVOKE CREATE ON SCHEMA public FROM readonly;
GRANT USAGE ON SCHEMA public TO readonly;
```

## 8. Grant database access

```sql
GRANT CONNECT ON DATABASE <db_name> TO migrator;
GRANT CONNECT ON DATABASE <db_name> TO appuser;
```

If `readonly` exists:

```sql
GRANT CONNECT ON DATABASE <db_name> TO readonly;
```

## 9. Set role defaults for this database

Make `app` the default schema while keeping `public` available for extensions.

```sql
ALTER ROLE migrator IN DATABASE <db_name> SET search_path TO app, public;
ALTER ROLE appuser IN DATABASE <db_name> SET search_path TO app, public;
```

If `readonly` exists:

```sql
ALTER ROLE readonly IN DATABASE <db_name> SET search_path TO app, public;
```

## 10. Grant schema access

```sql
GRANT USAGE, CREATE ON SCHEMA app TO migrator;
GRANT USAGE ON SCHEMA app TO appuser;
```

If `readonly` exists:

```sql
GRANT USAGE ON SCHEMA app TO readonly;
```

## 11. Reconnect as `migrator`

Reconnect using the `migrator` role before running object-level grants.

## 12. Grant access to existing objects

Run as `migrator`:

```sql
GRANT SELECT, INSERT, UPDATE, DELETE
ON ALL TABLES IN SCHEMA app
TO appuser;

GRANT USAGE, SELECT
ON ALL SEQUENCES IN SCHEMA app
TO appuser;
```

If `readonly` exists:

```sql
GRANT SELECT
ON ALL TABLES IN SCHEMA app
TO readonly;

GRANT USAGE, SELECT
ON ALL SEQUENCES IN SCHEMA app
TO readonly;
```

Do not blanket-grant function execution by default.

Only use an explicit function grant if you later create a database function that the runtime app truly needs to call:

```sql
GRANT EXECUTE ON FUNCTION app.some_safe_function(uuid) TO appuser;
```

## 13. Set default privileges for future objects

Run as `migrator`:

```sql
ALTER DEFAULT PRIVILEGES IN SCHEMA app
GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLES TO appuser;

ALTER DEFAULT PRIVILEGES IN SCHEMA app
GRANT USAGE, SELECT
ON SEQUENCES TO appuser;
```

If `readonly` exists:

```sql
ALTER DEFAULT PRIVILEGES IN SCHEMA app
GRANT SELECT
ON TABLES TO readonly;

ALTER DEFAULT PRIVILEGES IN SCHEMA app
GRANT USAGE, SELECT
ON SEQUENCES TO readonly;
```

Do not grant default `EXECUTE ON FUNCTIONS` unless all future functions are safe for that role.

## 14. Use the right role for the right job

- `DATABASE_MIGRATION_URL`: migrations, direct connection, `migrator`
- `DATABASE_URL`: application runtime, `appuser`

The owner/admin connection is for one-time manual database setup only. It is not part of normal app or CI/CD environment configuration.

## 15. Final rule

All app objects should land in `app`, not `public`.

This is enforced by:

- role-level `search_path`
- migration discipline
- explicit schema qualification where useful

Do not rely on `search_path` alone. Migrations should still intentionally create objects in `app`.

## 16. Verify permissions

Connect as `appuser` and confirm it cannot create tables:

```sql
CREATE TABLE app.permission_test (
  id uuid PRIMARY KEY
);
```

This should fail.

Connect as `migrator` and confirm it can create tables in `app`:

```sql
CREATE TABLE app.permission_test (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v7()
);

DROP TABLE app.permission_test;
```

If `readonly` exists, connect as `readonly` and confirm it cannot write:

```sql
INSERT INTO app.some_existing_table DEFAULT VALUES;
```

This should fail.

- migration discipline
- explicit schema qualification where useful
