/*
# Attendance Module — Phase 2: Salary Configuration & Calculation Method

1. Changes to `employees`:
- `monthly_salary`: numeric(12, 2) NULL (optional monthly salary)
- `salary_calculation_method`: text NOT NULL DEFAULT 'calendar_days'
  Options:
  - 'calendar_days' (Divisor = Total days in selected month: 28/29/30/31)
  - 'fixed_30'      (Divisor = 30)
  - 'working_days'  (Divisor = Total days excluding Sundays in selected month)

2. Safe & Non-destructive:
- ALTER TABLE ADD COLUMN IF NOT EXISTS
- Existing employee records preserved
- Default calculation method handles backward compatibility
*/

ALTER TABLE employees
ADD COLUMN IF NOT EXISTS monthly_salary numeric(12, 2) DEFAULT NULL;

ALTER TABLE employees
ADD COLUMN IF NOT EXISTS salary_calculation_method text NOT NULL DEFAULT 'calendar_days';
