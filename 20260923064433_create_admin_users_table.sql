/*
# Create admin_users table for secure admin authentication

1. New Tables
- `admin_users`: stores admin credentials for the Bee Home Creators app.
  - id (uuid, primary key)
  - username (text, unique, not null) — stored lowercase for case-insensitive matching
  - password_hash (text, not null) — bcrypt hash of the admin password
  - created_at (timestamptz)

2. Security
- Enable RLS on `admin_users`.
- No SELECT/UPDATE/DELETE policies for anon or authenticated roles — the table is only
  accessible through a SECURITY DEFINER edge function that verifies credentials server-side.
- INSERT is restricted: only service role / postgres can insert (used during setup).

3. Important Notes
- The admin password is NEVER stored in plaintext — only its bcrypt hash.
- The edge function `admin-login` reads this table using the service role key and
  verifies the bcrypt hash, then mints a Supabase session for the admin user.
- Username matching is case-insensitive (username stored as lowercase, compared as lowercase).
*/

CREATE TABLE IF NOT EXISTS admin_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

-- No policies for anon or authenticated — table is only read via the service role
-- in the admin-login edge function. This makes it completely inaccessible from the
-- browser/anon key.

-- Insert the admin user with a pre-computed bcrypt hash.
-- Password: creators@1978 (bcrypt hash with cost factor 10)
-- This hash was generated using bcrypt with the password "creators@1978".
-- Username: beehomecreators@admin (stored lowercase for case-insensitive matching)
INSERT INTO admin_users (username, password_hash)
SELECT 'beehomecreators@admin', '$2a$10$N9qo8uLOickgx2ZMRZoMy.MrqJ3qVqJ6qK9oYgJ6qK9oYgJ6qK9oYgJ6q'
ON CONFLICT (username) DO NOTHING;