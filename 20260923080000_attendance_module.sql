/*
# Attendance Management Module — Phase 1 (Day-wise only)

Tables created:
1. `employees` – employee/worker roster (stored in Supabase, admin-managed)
2. `attendance_statuses` – configurable attendance status types
   (default: Present=1, Half Day=0.5, Absent=0, Leave=0)
3. `attendance_records` – day-wise attendance per employee
   (date column is DATE — no hours, no clock-in, no clock-out)

Security:
- RLS enabled on all three tables
- Owner-scoped (auth.uid() = user_id) policies
- user_id defaults to auth.uid() so inserts work without specifying user_id

Constraints:
- UNIQUE(employee_id, date) prevents duplicate records for the same employee on the same day
- attendance_records.status_id SET NULL on status delete (records are preserved)
- attendance_records and attendance_statuses CASCADE on employee delete

IMPORTANT: No hourly tracking, no clock-in/out, no time calculations.
*/

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. EMPLOYEES
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS employees (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL DEFAULT auth.uid()
                          REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS employees_user_id_idx ON employees (user_id);
CREATE INDEX IF NOT EXISTS employees_name_idx    ON employees (user_id, name);

ALTER TABLE employees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_employees" ON employees;
CREATE POLICY "select_own_employees" ON employees FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_employees" ON employees;
CREATE POLICY "insert_own_employees" ON employees FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_employees" ON employees;
CREATE POLICY "update_own_employees" ON employees FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_employees" ON employees;
CREATE POLICY "delete_own_employees" ON employees FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS employees_updated_at ON employees;
CREATE TRIGGER employees_updated_at
  BEFORE UPDATE ON employees
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. ATTENDANCE STATUSES (configurable — not hardcoded)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS attendance_statuses (
  id                uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid           NOT NULL DEFAULT auth.uid()
                                   REFERENCES auth.users(id) ON DELETE CASCADE,
  label             text           NOT NULL,
  short_code        text           NOT NULL DEFAULT '',   -- e.g. "P", "H", "A", "L"
  attendance_value  decimal(5,2)   NOT NULL DEFAULT 1.00, -- 1 = full day, 0.5 = half day, 0 = absent
  color             text           NOT NULL DEFAULT '#22c55e',
  sort_order        integer        NOT NULL DEFAULT 0,
  created_at        timestamptz    NOT NULL DEFAULT now(),
  updated_at        timestamptz    NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS attendance_statuses_user_id_idx ON attendance_statuses (user_id, sort_order);

ALTER TABLE attendance_statuses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_attendance_statuses" ON attendance_statuses;
CREATE POLICY "select_own_attendance_statuses" ON attendance_statuses FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_attendance_statuses" ON attendance_statuses;
CREATE POLICY "insert_own_attendance_statuses" ON attendance_statuses FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_attendance_statuses" ON attendance_statuses;
CREATE POLICY "update_own_attendance_statuses" ON attendance_statuses FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_attendance_statuses" ON attendance_statuses;
CREATE POLICY "delete_own_attendance_statuses" ON attendance_statuses FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS attendance_statuses_updated_at ON attendance_statuses;
CREATE TRIGGER attendance_statuses_updated_at
  BEFORE UPDATE ON attendance_statuses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. ATTENDANCE RECORDS (day-wise — date column is DATE, never datetime/time)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS attendance_records (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL DEFAULT auth.uid()
                           REFERENCES auth.users(id) ON DELETE CASCADE,
  employee_id  uuid        NOT NULL
                           REFERENCES employees(id) ON DELETE CASCADE,
  -- DATE only — no time component. One record per employee per calendar day.
  date         date        NOT NULL,
  status_id    uuid        REFERENCES attendance_statuses(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  -- Prevent duplicate records for the same employee on the same day
  UNIQUE (employee_id, date)
);

CREATE INDEX IF NOT EXISTS attendance_records_user_id_idx      ON attendance_records (user_id);
CREATE INDEX IF NOT EXISTS attendance_records_employee_date_idx ON attendance_records (employee_id, date);
CREATE INDEX IF NOT EXISTS attendance_records_date_month_idx   ON attendance_records (user_id, date);

ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_attendance_records" ON attendance_records;
CREATE POLICY "select_own_attendance_records" ON attendance_records FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_attendance_records" ON attendance_records;
CREATE POLICY "insert_own_attendance_records" ON attendance_records FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_attendance_records" ON attendance_records;
CREATE POLICY "update_own_attendance_records" ON attendance_records FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_attendance_records" ON attendance_records;
CREATE POLICY "delete_own_attendance_records" ON attendance_records FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS attendance_records_updated_at ON attendance_records;
CREATE TRIGGER attendance_records_updated_at
  BEFORE UPDATE ON attendance_records
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
