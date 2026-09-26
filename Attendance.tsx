import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import type { Employee, AttendanceStatus, AttendanceRecord, SalaryCalculationMethod } from '@/lib/supabase';
import {
  MONTH_NAMES, daysInMonth, computeEmployeeSalary, formatINR,
  type EmployeeSalaryCalc,
} from '@/lib/salaryUtils';
import {
  CalendarCheck, Users, Settings2, Calculator, Plus, Pencil, Trash2,
  X, Loader2, ChevronLeft, ChevronRight, CheckCircle2, AlertCircle,
  BarChart3, Save, IndianRupee,
} from 'lucide-react';

type ActiveCell = { empId: string; day: number };

const pad2 = (n: number) => n.toString().padStart(2, '0');
const toDateStr = (year: number, month: number, day: number) =>
  `${year}-${pad2(month)}-${pad2(day)}`;
const recordKey = (empId: string, dateStr: string) => `${empId}_${dateStr}`;

const DEFAULT_STATUSES = [
  { label: 'Present',  short_code: 'P', attendance_value: 1.0,  color: '#22c55e', sort_order: 0 },
  { label: 'Half Day', short_code: 'H', attendance_value: 0.5,  color: '#f59e0b', sort_order: 1 },
  { label: 'Absent',   short_code: 'A', attendance_value: 0.0,  color: '#ef4444', sort_order: 2 },
  { label: 'Leave',    short_code: 'L', attendance_value: 0.0,  color: '#3b82f6', sort_order: 3 },
];

export default function Attendance() {
  const { user } = useAuth();
  const now = new Date();

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [statuses, setStatuses] = useState<AttendanceStatus[]>([]);
  const [records, setRecords] = useState<Record<string, AttendanceRecord>>({});
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1); // 1-12
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [loading, setLoading] = useState(true);
  const [savingCells, setSavingCells] = useState<Set<string>>(new Set());

  // UI state
  const [activeCell, setActiveCell] = useState<ActiveCell | null>(null);
  const [showEmpModal, setShowEmpModal] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [calcResults, setCalcResults] = useState<Record<string, EmployeeSalaryCalc>>({});
  const [visibleCalc, setVisibleCalc] = useState<Set<string>>(new Set());
  const [showOverallCalc, setShowOverallCalc] = useState(false);

  const [error, setError] = useState<string | null>(null);

  // Close dropdown on outside click
  const gridRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (gridRef.current && !gridRef.current.contains(e.target as Node)) {
        setActiveCell(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const ensureDefaultStatuses = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from('attendance_statuses')
      .select('id')
      .eq('user_id', userId)
      .limit(1);
    if (!data || data.length > 0) return;
    await supabase.from('attendance_statuses').insert(
      DEFAULT_STATUSES.map(s => ({ ...s, user_id: userId }))
    );
  }, []);

  const loadEmployees = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('employees')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });
    if (!error && data) setEmployees(data as Employee[]);
  }, [user]);

  const loadStatuses = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('attendance_statuses')
      .select('*')
      .eq('user_id', user.id)
      .order('sort_order', { ascending: true });
    if (!error && data) setStatuses(data as AttendanceStatus[]);
  }, [user]);

  const loadRecords = useCallback(async (year: number, month: number) => {
    if (!user) return;
    const firstDay = toDateStr(year, month, 1);
    const lastDay  = toDateStr(year, month, daysInMonth(year, month));
    const { data, error } = await supabase
      .from('attendance_records')
      .select('*')
      .eq('user_id', user.id)
      .gte('date', firstDay)
      .lte('date', lastDay);
    if (!error && data) {
      const map: Record<string, AttendanceRecord> = {};
      (data as AttendanceRecord[]).forEach(r => {
        map[recordKey(r.employee_id, r.date)] = r;
      });
      setRecords(map);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    ensureDefaultStatuses(user.id)
      .then(() => Promise.all([loadEmployees(), loadStatuses()]))
      .then(() => loadRecords(selectedYear, selectedMonth))
      .finally(() => setLoading(false));
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!user || loading) return;
    setRecords({});
    setVisibleCalc(new Set());
    setCalcResults({});
    loadRecords(selectedYear, selectedMonth);
  }, [selectedMonth, selectedYear]); // eslint-disable-line react-hooks/exhaustive-deps

  const prevMonth = () => {
    if (selectedMonth === 1) { setSelectedMonth(12); setSelectedYear(y => y - 1); }
    else setSelectedMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (selectedMonth === 12) { setSelectedMonth(1); setSelectedYear(y => y + 1); }
    else setSelectedMonth(m => m + 1);
  };

  const saveCell = useCallback(async (empId: string, day: number, statusId: string | null) => {
    if (!user) return;
    const dateStr = toDateStr(selectedYear, selectedMonth, day);
    const key = recordKey(empId, dateStr);
    const existing = records[key];

    setSavingCells(prev => new Set([...prev, key]));

    try {
      let updatedRecords = { ...records };
      if (statusId === null) {
        if (existing) {
          await supabase.from('attendance_records').delete().eq('id', existing.id);
          delete updatedRecords[key];
        }
      } else if (existing) {
        const { data } = await supabase
          .from('attendance_records')
          .update({ status_id: statusId })
          .eq('id', existing.id)
          .select()
          .single();
        if (data) updatedRecords[key] = data as AttendanceRecord;
      } else {
        const { data } = await supabase
          .from('attendance_records')
          .insert({ user_id: user.id, employee_id: empId, date: dateStr, status_id: statusId })
          .select()
          .single();
        if (data) updatedRecords[key] = data as AttendanceRecord;
      }

      setRecords(updatedRecords);

      // Instantly recalculate if employee calculation is visible
      const emp = employees.find(e => e.id === empId);
      if (emp) {
        const newCalc = computeEmployeeSalary(emp, updatedRecords, statuses, selectedYear, selectedMonth);
        setCalcResults(prev => ({ ...prev, [empId]: newCalc }));
      }
    } catch {
      setError('Failed to save attendance. Please try again.');
    } finally {
      setSavingCells(prev => { const n = new Set(prev); n.delete(key); return n; });
    }
  }, [user, selectedYear, selectedMonth, records, employees, statuses]);

  const handleCalcEmployee = (empId: string) => {
    const emp = employees.find(e => e.id === empId);
    if (!emp) return;
    const result = computeEmployeeSalary(emp, records, statuses, selectedYear, selectedMonth);
    setCalcResults(prev => ({ ...prev, [empId]: result }));
    setVisibleCalc(prev => { const n = new Set(prev); n.add(empId); return n; });
  };

  const handleOverallCalc = () => {
    const results: Record<string, EmployeeSalaryCalc> = {};
    employees.forEach(emp => {
      results[emp.id] = computeEmployeeSalary(emp, records, statuses, selectedYear, selectedMonth);
    });
    setCalcResults(results);
    setVisibleCalc(new Set(employees.map(e => e.id)));
    setShowOverallCalc(true);
  };

  const totalDays = daysInMonth(selectedYear, selectedMonth);
  const days = Array.from({ length: totalDays }, (_, i) => i + 1);
  const years = Array.from({ length: 6 }, (_, i) => now.getFullYear() - 2 + i);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-amber-500/15 rounded-xl flex items-center justify-center">
              <CalendarCheck className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-800">Attendance & Salary</h1>
              <p className="text-xs text-slate-500">Day-wise attendance tracking & instant salary calculation</p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setShowStatusModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors shadow-sm"
          >
            <Settings2 className="w-4 h-4" /> Statuses
          </button>
          <button
            onClick={() => setShowEmpModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors shadow-sm"
          >
            <Users className="w-4 h-4" /> Staff & Salary
          </button>
          <button
            onClick={handleOverallCalc}
            disabled={employees.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors shadow-sm disabled:opacity-50"
          >
            <BarChart3 className="w-4 h-4" /> Overall Calculate
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Month / Year Controls */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center gap-4 shadow-sm">
        <button onClick={prevMonth} className="p-2 rounded-lg hover:bg-slate-100 text-slate-600 transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="font-semibold text-slate-800 text-base min-w-[140px] text-center">
          {MONTH_NAMES[selectedMonth - 1]} {selectedYear}
        </div>
        <button onClick={nextMonth} className="p-2 rounded-lg hover:bg-slate-100 text-slate-600 transition-colors">
          <ChevronRight className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2 ml-2">
          <select
            value={selectedMonth}
            onChange={e => setSelectedMonth(Number(e.target.value))}
            className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
          >
            {MONTH_NAMES.map((m, i) => (
              <option key={i + 1} value={i + 1}>{m}</option>
            ))}
          </select>
          <select
            value={selectedYear}
            onChange={e => setSelectedYear(Number(e.target.value))}
            className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
          >
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div className="ml-auto text-xs text-slate-400 hidden sm:block">
          {totalDays} calendar days &nbsp;·&nbsp; {employees.length} employee{employees.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Status Legend */}
      {statuses.length > 0 && (
        <div className="flex flex-wrap gap-2 items-center text-xs text-slate-500">
          <span className="font-medium text-slate-400">Legend:</span>
          {statuses.map(s => (
            <span key={s.id} className="flex items-center gap-1">
              <span
                className="inline-flex w-5 h-5 rounded items-center justify-center text-white text-[10px] font-bold"
                style={{ backgroundColor: s.color }}
              >{s.short_code}</span>
              {s.label} ({Number(s.attendance_value)})
            </span>
          ))}
          <span className="flex items-center gap-1">
            <span className="inline-flex w-5 h-5 rounded items-center justify-center bg-slate-100 text-slate-400 text-[10px]">·</span>
            Not Marked
          </span>
        </div>
      )}

      {/* Empty State */}
      {employees.length === 0 ? (
        <div className="bg-white border border-dashed border-slate-300 rounded-xl p-12 text-center shadow-sm">
          <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium mb-1">No employees added yet</p>
          <p className="text-slate-400 text-sm mb-4">Add employees with optional monthly salary to start</p>
          <button
            onClick={() => setShowEmpModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" /> Add First Employee
          </button>
        </div>
      ) : (
        /* Attendance Spreadsheet Grid */
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div ref={gridRef} className="overflow-x-auto">
            <table className="w-max min-w-full text-sm border-collapse">
              <thead>
                <tr className="bg-slate-800 text-white">
                  <th className="sticky left-0 z-20 bg-slate-800 text-left px-4 py-3 font-semibold text-slate-200 min-w-[180px] border-r border-slate-700">
                    Employee & Salary
                  </th>
                  {days.map(d => (
                    <th key={d} className="px-1 py-3 font-semibold text-slate-300 text-center min-w-[36px] w-9 border-r border-slate-700/50 text-xs">
                      {d}
                    </th>
                  ))}
                  <th className="px-4 py-3 font-semibold text-amber-400 text-center whitespace-nowrap border-l border-slate-700">
                    Calculate
                  </th>
                </tr>
              </thead>

              <tbody>
                {employees.map((emp, empIdx) => {
                  const result = calcResults[emp.id];
                  const showCalc = visibleCalc.has(emp.id);
                  const rowBg = empIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/60';

                  return (
                    <tr key={emp.id} className="contents">
                      <tr className={`${rowBg} hover:bg-amber-50/30 transition-colors`}>
                        {/* Sticky Name + Salary Cell */}
                        <td className={`sticky left-0 z-10 ${rowBg} px-4 py-2.5 border-r border-slate-200 max-w-[180px]`}>
                          <p className="font-semibold text-slate-800 truncate">{emp.name}</p>
                          <p className="text-[11px] text-slate-500 truncate flex items-center gap-1 mt-0.5">
                            <span className="font-medium text-amber-600">
                              {emp.monthly_salary ? formatINR(Number(emp.monthly_salary)) : 'No salary'}
                            </span>
                            {emp.monthly_salary && (
                              <span className="text-[9px] text-slate-400">
                                ({emp.salary_calculation_method === 'fixed_30' ? '30d' : emp.salary_calculation_method === 'working_days' ? 'wrk' : 'cal'})
                              </span>
                            )}
                          </p>
                        </td>

                        {/* Day Cells */}
                        {days.map(day => {
                          const dateStr = toDateStr(selectedYear, selectedMonth, day);
                          const key = recordKey(emp.id, dateStr);
                          const record = records[key];
                          const status = record?.status_id
                            ? statuses.find(s => s.id === record.status_id) ?? null
                            : null;
                          const isSaving = savingCells.has(key);
                          const isActive = activeCell?.empId === emp.id && activeCell?.day === day;

                          return (
                            <td key={day} className="px-0.5 py-1.5 border-r border-slate-100 text-center">
                              <div className="relative inline-block" onMouseDown={e => e.stopPropagation()}>
                                <button
                                  onClick={() => setActiveCell(isActive ? null : { empId: emp.id, day })}
                                  className={`w-8 h-7 rounded text-[11px] font-bold transition-all focus:outline-none focus:ring-2 focus:ring-amber-400/50 ${
                                    status
                                      ? 'text-white shadow-sm hover:opacity-90'
                                      : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                                  } ${isActive ? 'ring-2 ring-amber-400' : ''}`}
                                  style={status ? { backgroundColor: status.color } : {}}
                                  title={status ? `${status.label} (${status.attendance_value})` : 'Mark attendance'}
                                >
                                  {isSaving ? (
                                    <Loader2 className="w-3 h-3 animate-spin mx-auto" />
                                  ) : (
                                    status?.short_code || '·'
                                  )}
                                </button>

                                {isActive && (
                                  <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 z-50 bg-white border border-slate-200 rounded-xl shadow-xl p-1.5 min-w-[160px]">
                                    <p className="text-[10px] font-semibold text-slate-400 uppercase px-2 pb-1 pt-0.5">
                                      Day {day} Status
                                    </p>
                                    {statuses.map(s => (
                                      <button
                                        key={s.id}
                                        onClick={() => { saveCell(emp.id, day, s.id); setActiveCell(null); }}
                                        className={`flex items-center gap-2 w-full px-2 py-1.5 rounded-lg hover:bg-slate-50 text-left transition-colors ${
                                          record?.status_id === s.id ? 'bg-amber-50' : ''
                                        }`}
                                      >
                                        <span
                                          className="inline-flex w-5 h-5 rounded items-center justify-center text-white text-[10px] font-bold shrink-0"
                                          style={{ backgroundColor: s.color }}
                                        >{s.short_code}</span>
                                        <span className="text-xs text-slate-700 font-medium">{s.label}</span>
                                        <span className="text-[10px] text-slate-400 ml-auto">×{Number(s.attendance_value)}</span>
                                      </button>
                                    ))}
                                    {record && (
                                      <button
                                        onClick={() => { saveCell(emp.id, day, null); setActiveCell(null); }}
                                        className="flex items-center gap-2 w-full px-2 py-1.5 rounded-lg hover:bg-red-50 text-red-500 transition-colors mt-0.5 border-t border-slate-100"
                                      >
                                        <X className="w-3.5 h-3.5" />
                                        <span className="text-xs font-medium">Clear</span>
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            </td>
                          );
                        })}

                        {/* Calculate button */}
                        <td className="px-3 py-1.5 border-l border-slate-200 text-center">
                          <button
                            onClick={() => handleCalcEmployee(emp.id)}
                            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-amber-500/10 text-amber-700 rounded-lg hover:bg-amber-500/20 transition-colors whitespace-nowrap mx-auto"
                          >
                            <Calculator className="w-3.5 h-3.5" />
                            Calculate
                          </button>
                        </td>
                      </tr>

                      {/* Inline calculation result row */}
                      {showCalc && result && (
                        <tr className="bg-amber-50/70 border-t border-b border-amber-200/60">
                          <td className="sticky left-0 bg-amber-50 px-4 py-3 border-r border-amber-200">
                            <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-800">
                              <CheckCircle2 className="w-4 h-4 text-amber-600" />
                              Payroll & Attendance
                            </div>
                            <p className="text-[10px] text-slate-500 mt-0.5">{result.methodLabel} ({result.divisor}d)</p>
                          </td>
                          <td colSpan={totalDays + 1} className="px-4 py-3">
                            <div className="flex flex-wrap items-center gap-4">
                              {/* Status counts */}
                              <div className="flex flex-wrap gap-2.5 items-center">
                                {result.breakdown.map(b => (
                                  <span key={b.status.id} className="flex items-center gap-1.5 text-xs bg-white/80 border border-slate-200/80 px-2 py-1 rounded-md">
                                    <span
                                      className="inline-flex w-4 h-4 rounded items-center justify-center text-white text-[9px] font-bold"
                                      style={{ backgroundColor: b.status.color }}
                                    >{b.status.short_code}</span>
                                    <span className="text-slate-700 font-medium">{b.status.label}: <strong>{b.count}</strong></span>
                                  </span>
                                ))}
                                {result.breakdown.length === 0 && (
                                  <span className="text-xs text-slate-400">No attendance marked this month</span>
                                )}
                              </div>

                              {/* Effective Days */}
                              <div className="bg-white border border-amber-200 px-3 py-1 rounded-lg text-xs font-medium text-amber-900 shadow-xs">
                                Effective Days: <strong className="text-sm font-bold text-amber-700">{result.totalEffectiveDays.toFixed(1)}</strong>
                              </div>

                              {/* Salary calculation details */}
                              {result.monthlySalary ? (
                                <div className="flex flex-wrap items-center gap-3 text-xs bg-white border border-amber-200 px-3 py-1 rounded-lg shadow-xs">
                                  <div>
                                    <span className="text-slate-500">Monthly:</span> <span className="font-semibold text-slate-700">{formatINR(result.monthlySalary)}</span>
                                  </div>
                                  <span className="text-slate-300">|</span>
                                  <div>
                                    <span className="text-slate-500">Daily ({result.divisor}d):</span> <span className="font-semibold text-slate-700">{formatINR(result.dailySalary)}</span>
                                  </div>
                                  <span className="text-slate-300">|</span>
                                  <div className="bg-emerald-50 text-emerald-800 font-bold px-2 py-0.5 rounded border border-emerald-200">
                                    Payable: {formatINR(result.payableSalary)}
                                  </div>
                                </div>
                              ) : (
                                <span className="text-xs text-slate-400 italic">No salary configured for this employee</span>
                              )}

                              <button
                                onClick={() => setVisibleCalc(prev => { const n = new Set(prev); n.delete(emp.id); return n; })}
                                className="ml-auto p-1 text-slate-400 hover:text-slate-600 rounded-md hover:bg-amber-100 transition-colors"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modals */}
      {showEmpModal && (
        <EmployeeManagerModal
          user={user!}
          employees={employees}
          onClose={() => setShowEmpModal(false)}
          onRefresh={loadEmployees}
        />
      )}
      {showStatusModal && (
        <StatusManagerModal
          user={user!}
          statuses={statuses}
          onClose={() => setShowStatusModal(false)}
          onRefresh={loadStatuses}
        />
      )}
      {showOverallCalc && (
        <OverallCalcModal
          employees={employees}
          calcResults={calcResults}
          month={selectedMonth}
          year={selectedYear}
          onClose={() => setShowOverallCalc(false)}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Employee Manager Modal (With Monthly Salary & Calculation Method)
// ─────────────────────────────────────────────────────────────────────────────
function EmployeeManagerModal({
  user, employees, onClose, onRefresh,
}: {
  user: { id: string };
  employees: Employee[];
  onClose: () => void;
  onRefresh: () => void;
}) {
  const [newName, setNewName] = useState('');
  const [newSalary, setNewSalary] = useState('');
  const [newMethod, setNewMethod] = useState<SalaryCalculationMethod>('calendar_days');

  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editSalary, setEditSalary] = useState('');
  const [editMethod, setEditMethod] = useState<SalaryCalculationMethod>('calendar_days');

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name) return;
    setSaving(true);
    setError(null);

    const salaryVal = newSalary.trim() ? parseFloat(newSalary) : null;

    const { error } = await supabase
      .from('employees')
      .insert({
        user_id: user.id,
        name,
        monthly_salary: salaryVal,
        salary_calculation_method: newMethod,
      });

    if (error) setError(error.message);
    else {
      setNewName('');
      setNewSalary('');
      setNewMethod('calendar_days');
      await onRefresh();
    }
    setSaving(false);
  };

  const handleSaveEdit = async () => {
    if (!editId) return;
    const name = editName.trim();
    if (!name) return;
    setSaving(true);
    setError(null);

    const salaryVal = editSalary.trim() ? parseFloat(editSalary) : null;

    const { error } = await supabase
      .from('employees')
      .update({
        name,
        monthly_salary: salaryVal,
        salary_calculation_method: editMethod,
      })
      .eq('id', editId);

    if (error) setError(error.message);
    else {
      setEditId(null);
      await onRefresh();
    }
    setSaving(false);
  };

  const startEdit = (emp: Employee) => {
    setEditId(emp.id);
    setEditName(emp.name);
    setEditSalary(emp.monthly_salary ? String(emp.monthly_salary) : '');
    setEditMethod(emp.salary_calculation_method || 'calendar_days');
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this employee? Their attendance records will also be deleted.')) return;
    setDeleting(id);
    setError(null);
    const { error } = await supabase.from('employees').delete().eq('id', id);
    if (error) setError(error.message);
    else await onRefresh();
    setDeleting(null);
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-amber-500" />
            <h2 className="font-bold text-slate-800">Manage Staff & Salaries</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-3">
          {error && (
            <div className="flex items-center gap-2 p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />{error}
            </div>
          )}

          {employees.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-4">No employees yet. Add one below.</p>
          )}

          {employees.map(emp => (
            <div key={emp.id} className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
              {editId === emp.id ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      className="text-sm border border-amber-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-400/30 bg-white"
                      placeholder="Employee Name"
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      autoFocus
                    />
                    <div className="relative">
                      <span className="absolute left-2.5 top-2 text-xs text-slate-400">₹</span>
                      <input
                        type="number"
                        min="0"
                        step="100"
                        className="w-full text-sm border border-amber-300 rounded-lg pl-6 pr-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-400/30 bg-white"
                        placeholder="Monthly Salary (Optional)"
                        value={editSalary}
                        onChange={e => setEditSalary(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <label className="text-xs text-slate-500 font-medium">Calc Method:</label>
                    <select
                      value={editMethod}
                      onChange={e => setEditMethod(e.target.value as SalaryCalculationMethod)}
                      className="text-xs border border-amber-300 rounded-lg px-2 py-1.5 bg-white text-slate-700"
                    >
                      <option value="calendar_days">Calendar Days (28-31)</option>
                      <option value="fixed_30">Fixed 30 Days</option>
                      <option value="working_days">Working Days (Excl. Sun)</option>
                    </select>

                    <div className="ml-auto flex gap-1">
                      <button
                        onClick={handleSaveEdit}
                        disabled={saving}
                        className="flex items-center gap-1 px-3 py-1.5 bg-amber-500 text-white rounded-lg text-xs font-medium hover:bg-amber-600 disabled:opacity-50"
                      >
                        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                        Save
                      </button>
                      <button
                        onClick={() => setEditId(null)}
                        className="px-2.5 py-1.5 border border-slate-200 text-slate-600 rounded-lg text-xs hover:bg-slate-100"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{emp.name}</p>
                    <p className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                      <span className="font-medium text-amber-600">
                        {emp.monthly_salary ? formatINR(Number(emp.monthly_salary)) + '/mo' : 'No salary'}
                      </span>
                      {emp.monthly_salary && (
                        <span className="text-slate-400">
                          · {emp.salary_calculation_method === 'fixed_30' ? 'Fixed 30d' : emp.salary_calculation_method === 'working_days' ? 'Working Days' : 'Calendar Days'}
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => startEdit(emp)}
                      className="p-1.5 hover:bg-slate-200 rounded-lg text-slate-500 transition-colors"
                      title="Edit employee & salary"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(emp.id)}
                      disabled={deleting === emp.id}
                      className="p-1.5 hover:bg-red-100 rounded-lg text-slate-400 hover:text-red-500 transition-colors disabled:opacity-50"
                      title="Remove employee"
                    >
                      {deleting === emp.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Add new employee section */}
        <div className="p-5 border-t border-slate-100 bg-slate-50/50 rounded-b-2xl">
          <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Add New Worker / Employee</p>
          <div className="space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                className="text-sm border border-slate-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400/40 placeholder:text-slate-400"
                placeholder="Employee Name *"
                value={newName}
                onChange={e => setNewName(e.target.value)}
              />
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-xs text-slate-400">₹</span>
                <input
                  type="number"
                  min="0"
                  step="100"
                  className="w-full text-sm border border-slate-200 rounded-xl pl-7 pr-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400/40 placeholder:text-slate-400"
                  placeholder="Monthly Salary (Optional)"
                  value={newSalary}
                  onChange={e => setNewSalary(e.target.value)}
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <div className="flex items-center gap-1.5 flex-1">
                <span className="text-xs text-slate-500 whitespace-nowrap">Divisor Method:</span>
                <select
                  value={newMethod}
                  onChange={e => setNewMethod(e.target.value as SalaryCalculationMethod)}
                  className="w-full text-xs border border-slate-200 rounded-xl px-2.5 py-2 bg-white text-slate-700"
                >
                  <option value="calendar_days">Calendar Days (28, 29, 30, or 31)</option>
                  <option value="fixed_30">Fixed 30 Days</option>
                  <option value="working_days">Working Days (Excludes Sundays)</option>
                </select>
              </div>

              <button
                onClick={handleAdd}
                disabled={!newName.trim() || saving}
                className="flex items-center justify-center gap-1.5 px-5 py-2 bg-amber-500 text-white rounded-xl text-sm font-medium hover:bg-amber-600 transition-colors disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Add Employee
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Status Manager Modal
// ─────────────────────────────────────────────────────────────────────────────
function StatusManagerModal({
  user, statuses, onClose, onRefresh,
}: {
  user: { id: string };
  statuses: AttendanceStatus[];
  onClose: () => void;
  onRefresh: () => void;
}) {
  const blank = () => ({ label: '', short_code: '', attendance_value: '1', color: '#22c55e' });
  const [form, setForm] = useState(blank());
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState(blank());
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAdd = async () => {
    if (!form.label.trim() || !form.short_code.trim()) { setError('Label and short code are required'); return; }
    setSaving(true); setError(null);
    const { error } = await supabase.from('attendance_statuses').insert({
      user_id: user.id,
      label: form.label.trim(),
      short_code: form.short_code.trim().toUpperCase().slice(0, 2),
      attendance_value: parseFloat(form.attendance_value) || 0,
      color: form.color,
      sort_order: statuses.length,
    });
    if (error) setError(error.message);
    else { setForm(blank()); await onRefresh(); }
    setSaving(false);
  };

  const handleSaveEdit = async () => {
    if (!editId) return;
    if (!editForm.label.trim() || !editForm.short_code.trim()) { setError('Label and short code are required'); return; }
    setSaving(true); setError(null);
    const { error } = await supabase.from('attendance_statuses').update({
      label: editForm.label.trim(),
      short_code: editForm.short_code.trim().toUpperCase().slice(0, 2),
      attendance_value: parseFloat(editForm.attendance_value) || 0,
      color: editForm.color,
    }).eq('id', editId);
    if (error) setError(error.message);
    else { setEditId(null); await onRefresh(); }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this status? Existing records with this status will become unmarked.')) return;
    setDeleting(id); setError(null);
    const { error } = await supabase.from('attendance_statuses').delete().eq('id', id);
    if (error) setError(error.message);
    else await onRefresh();
    setDeleting(null);
  };

  const startEdit = (s: AttendanceStatus) => {
    setEditId(s.id);
    setEditForm({ label: s.label, short_code: s.short_code, attendance_value: String(s.attendance_value), color: s.color });
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-amber-500" />
            <h2 className="font-bold text-slate-800">Configure Attendance Statuses</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"><X className="w-5 h-5" /></button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-2">
          {error && (
            <div className="flex items-center gap-2 p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />{error}
              <button onClick={() => setError(null)} className="ml-auto"><X className="w-3.5 h-3.5" /></button>
            </div>
          )}

          <div className="grid grid-cols-[1fr_56px_72px_36px_auto] gap-2 px-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
            <span>Label</span><span>Code</span><span>Value</span><span>Color</span><span></span>
          </div>

          {statuses.map(s => (
            <div key={s.id} className="grid grid-cols-[1fr_56px_72px_36px_auto] gap-2 items-center p-2.5 rounded-xl bg-slate-50 border border-slate-100">
              {editId === s.id ? (
                <>
                  <input className="text-sm border border-amber-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-400/30"
                    value={editForm.label} onChange={e => setEditForm(f => ({...f, label: e.target.value}))} placeholder="Label" />
                  <input className="text-sm border border-amber-300 rounded-lg px-2 py-1.5 focus:outline-none text-center font-bold uppercase"
                    value={editForm.short_code} onChange={e => setEditForm(f => ({...f, short_code: e.target.value}))} maxLength={2} placeholder="P" />
                  <input type="number" step="0.5" min="0" max="1" className="text-sm border border-amber-300 rounded-lg px-2 py-1.5 focus:outline-none"
                    value={editForm.attendance_value} onChange={e => setEditForm(f => ({...f, attendance_value: e.target.value}))} />
                  <input type="color" className="w-8 h-8 rounded-lg border border-amber-300 cursor-pointer"
                    value={editForm.color} onChange={e => setEditForm(f => ({...f, color: e.target.value}))} />
                  <div className="flex gap-1">
                    <button onClick={handleSaveEdit} disabled={saving} className="p-1.5 bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50">
                      {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    </button>
                    <button onClick={() => setEditId(null)} className="p-1.5 hover:bg-slate-200 rounded-lg text-slate-500"><X className="w-3.5 h-3.5" /></button>
                  </div>
                </>
              ) : (
                <>
                  <span className="text-sm font-medium text-slate-700 truncate">{s.label}</span>
                  <span className="inline-flex w-8 h-6 rounded items-center justify-center text-white text-[10px] font-bold" style={{ backgroundColor: s.color }}>{s.short_code}</span>
                  <span className="text-xs text-slate-500 font-mono">{Number(s.attendance_value)}</span>
                  <span className="w-6 h-6 rounded-full border-2 border-white shadow" style={{ backgroundColor: s.color }} />
                  <div className="flex gap-1">
                    <button onClick={() => startEdit(s)} className="p-1.5 hover:bg-slate-200 rounded-lg text-slate-500 transition-colors"><Pencil className="w-3.5 h-3.5" /></button>
                    <button onClick={() => handleDelete(s.id)} disabled={deleting === s.id} className="p-1.5 hover:bg-red-100 rounded-lg text-slate-400 hover:text-red-500 transition-colors disabled:opacity-50">
                      {deleting === s.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>

        <div className="p-5 border-t border-slate-100">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Add New Status</p>
          <div className="grid grid-cols-[1fr_56px_80px_36px] gap-2 mb-2">
            <input className="text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400/40 placeholder:text-slate-400"
              placeholder="Status name" value={form.label} onChange={e => setForm(f => ({...f, label: e.target.value}))} />
            <input className="text-sm border border-slate-200 rounded-xl px-2 py-2 focus:outline-none text-center font-bold uppercase placeholder:text-slate-400"
              placeholder="P" maxLength={2} value={form.short_code} onChange={e => setForm(f => ({...f, short_code: e.target.value}))} />
            <input type="number" step="0.5" min="0" max="10" className="text-sm border border-slate-200 rounded-xl px-2 py-2 focus:outline-none placeholder:text-slate-400"
              placeholder="1.0" value={form.attendance_value} onChange={e => setForm(f => ({...f, attendance_value: e.target.value}))} />
            <input type="color" className="w-10 h-10 rounded-xl border border-slate-200 cursor-pointer"
              value={form.color} onChange={e => setForm(f => ({...f, color: e.target.value}))} />
          </div>
          <button
            onClick={handleAdd}
            disabled={!form.label.trim() || !form.short_code.trim() || saving}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-500 text-white rounded-xl text-sm font-medium hover:bg-amber-600 transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Add Status
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Overall Calculate Modal (Attendance & Payroll Summary)
// ─────────────────────────────────────────────────────────────────────────────
function OverallCalcModal({
  employees, calcResults, month, year, onClose,
}: {
  employees: Employee[];
  calcResults: Record<string, EmployeeSalaryCalc>;
  month: number;
  year: number;
  onClose: () => void;
}) {
  const totalEffective = employees.reduce((sum, emp) => sum + (calcResults[emp.id]?.totalEffectiveDays ?? 0), 0);
  const totalPayroll = employees.reduce((sum, emp) => sum + (calcResults[emp.id]?.payableSalary ?? 0), 0);

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-amber-500" />
            <div>
              <h2 className="font-bold text-slate-800">Overall Attendance & Payroll Summary</h2>
              <p className="text-xs text-slate-500">{MONTH_NAMES[month - 1]} {year} — {employees.length} Employee{employees.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"><X className="w-5 h-5" /></button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-3">
          {employees.map(emp => {
            const result = calcResults[emp.id];
            return (
              <div key={emp.id} className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                  <div>
                    <p className="font-semibold text-slate-800">{emp.name}</p>
                    <p className="text-xs text-slate-500">
                      Method: {result?.methodLabel} ({result?.divisor}d divisor)
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-amber-700 bg-amber-100 px-2.5 py-0.5 rounded-full text-xs">
                      {result?.totalEffectiveDays.toFixed(1) ?? '0.0'} Effective Days
                    </span>
                    <span className="font-bold text-emerald-700 bg-emerald-100 px-3 py-0.5 rounded-full text-sm">
                      {formatINR(result?.payableSalary)}
                    </span>
                  </div>
                </div>

                {result && result.breakdown.length > 0 ? (
                  <div className="flex flex-wrap gap-2 text-xs">
                    {result.breakdown.map(b => (
                      <span key={b.status.id} className="flex items-center gap-1.5 bg-white border border-slate-200 px-2 py-0.5 rounded text-slate-600">
                        <span className="inline-flex w-4 h-4 rounded items-center justify-center text-white text-[9px] font-bold"
                          style={{ backgroundColor: b.status.color }}>{b.status.short_code}</span>
                        {b.status.label}: <strong>{b.count}</strong>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">No attendance marked</p>
                )}
              </div>
            );
          })}
        </div>

        {/* Aggregate Footer */}
        <div className="p-5 border-t border-slate-100 bg-amber-50/60 rounded-b-2xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-slate-500 font-medium">Employees</p>
                <p className="font-bold text-slate-800 text-lg">{employees.length}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 font-medium">Total Days</p>
                <p className="font-bold text-amber-700 text-lg">{totalEffective.toFixed(1)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 font-medium">Total Payroll</p>
                <p className="font-bold text-emerald-700 text-lg">{formatINR(totalPayroll)}</p>
              </div>
            </div>
            <button onClick={onClose} className="px-5 py-2.5 bg-amber-500 text-white rounded-xl text-sm font-medium hover:bg-amber-600 transition-colors shadow-sm self-end sm:self-auto">
              Close Summary
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
