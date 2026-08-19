# Versioned migrations

Do not create the first revision until a reviewed live Supabase schema dump has
been compared with the checked-in bootstrap DDL. The first revision is the
approved baseline, not an inferred migration from legacy SQL files.
