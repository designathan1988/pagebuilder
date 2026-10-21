#!/usr/bin/env sh
# Applies the migrations to a clean local Postgres and runs the RLS tests.
# Usage: PGHOST=... PGPORT=... PGUSER=postgres sh saas/supabase/tests/run.sh
set -e
here=$(dirname "$0")
dropdb --if-exists webconstructor_test
createdb webconstructor_test
psql -q -v ON_ERROR_STOP=1 -d webconstructor_test -f "$here/stub-auth.sql"
for file in "$here"/../migrations/*.sql; do
  psql -q -v ON_ERROR_STOP=1 -d webconstructor_test -f "$file"
done
psql -q -v ON_ERROR_STOP=1 -d webconstructor_test -o /dev/null -f "$here/rls.test.sql"
psql -q -v ON_ERROR_STOP=1 -d webconstructor_test -o /dev/null -f "$here/site_overlays.test.sql"
psql -q -v ON_ERROR_STOP=1 -d webconstructor_test -o /dev/null -f "$here/site_data.test.sql"
