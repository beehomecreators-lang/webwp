import type { SalaryCalculationMethod, AttendanceStatus, AttendanceRecord } from '@/lib/supabase';

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export const daysInMonth = (year: number, month: number): number => {
  return new Date(year, month, 0).getDate(); // month is 1-based
};

export const getWorkingDaysInMonth = (year: number, month: number): number => {
  const total = daysInMonth(year, month);
  let workingDays = 0;
  for (let day = 1; day <= total; day++) {
    const d = new Date(year, month - 1, day);
    // Sunday is 0
    if (d.getDay() !== 0) {
      workingDays++;
    }
  }
  return workingDays;
};

export const getDivisor = (
  method: SalaryCalculationMethod | undefined,
  year: number,
  month: number
): number => {
  switch (method) {
    case 'fixed_30':
      return 30;
    case 'working_days':
      return getWorkingDaysInMonth(year, month) || 1;
    case 'calendar_days':
    default:
      return daysInMonth(year, month) || 1;
  }
};

export type EmployeeSalaryCalc = {
  breakdown: { status: AttendanceStatus; count: number; effectiveDays: number }[];
  totalEffectiveDays: number;
  monthlySalary: number | null;
  divisor: number;
  methodLabel: string;
  dailySalary: number | null;
  payableSalary: number | null;
};

export const getMethodLabel = (method: SalaryCalculationMethod | undefined): string => {
  switch (method) {
    case 'fixed_30':
      return 'Fixed 30 Days';
    case 'working_days':
      return 'Working Days (Excl. Sun)';
    case 'calendar_days':
    default:
      return 'Calendar Days';
  }
};

export const computeEmployeeSalary = (
  employee: { id: string; monthly_salary?: number | null; salary_calculation_method?: SalaryCalculationMethod },
  records: Record<string, AttendanceRecord>,
  statuses: AttendanceStatus[],
  year: number,
  month: number
): EmployeeSalaryCalc => {
  const prefix = `${year}-${month.toString().padStart(2, '0')}`;
  const empRecords = Object.values(records).filter(
    (r) => r.employee_id === employee.id && r.date.startsWith(prefix)
  );

  const counts: Record<string, number> = {};
  empRecords.forEach((r) => {
    if (r.status_id) {
      counts[r.status_id] = (counts[r.status_id] || 0) + 1;
    }
  });

  const breakdown = statuses
    .map((s) => ({
      status: s,
      count: counts[s.id] || 0,
      effectiveDays: (counts[s.id] || 0) * Number(s.attendance_value),
    }))
    .filter((b) => b.count > 0);

  const totalEffectiveDays = breakdown.reduce((sum, b) => sum + b.effectiveDays, 0);

  const monthlySalary = employee.monthly_salary ? Number(employee.monthly_salary) : null;
  const divisor = getDivisor(employee.salary_calculation_method, year, month);
  const methodLabel = getMethodLabel(employee.salary_calculation_method);

  let dailySalary: number | null = null;
  let payableSalary: number | null = null;

  if (monthlySalary !== null && monthlySalary > 0) {
    dailySalary = monthlySalary / divisor;
    payableSalary = dailySalary * totalEffectiveDays;
  }

  return {
    breakdown,
    totalEffectiveDays,
    monthlySalary,
    divisor,
    methodLabel,
    dailySalary,
    payableSalary,
  };
};

export const formatINR = (val: number | null | undefined): string => {
  if (val === null || val === undefined || isNaN(val)) return '—';
  return '₹' + Number(val).toLocaleString('en-IN', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  });
};
