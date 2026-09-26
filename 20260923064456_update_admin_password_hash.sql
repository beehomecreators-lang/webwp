/*
# Update admin password hash

1. Changes
- Update the password_hash for the admin user 'beehomecreators@admin' to a valid bcrypt hash.
- The previous migration inserted a placeholder hash; this replaces it with the correct one.

2. Security
- No RLS policy changes. The table remains accessible only via the service role in the edge function.

3. Important Notes
- Password: creators@1978 (bcrypt hash, cost factor 10)
- The hash is computed server-side using bcryptjs. The plaintext password is never stored.
*/

UPDATE admin_users
SET password_hash = '$2b$10$zRwpBIUC2DhmU7qAz8J7qOr8gxIZINaKo4vLWZVVjm34f7Ztvp7NK'
WHERE username = 'beehomecreators@admin';