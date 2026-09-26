import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import type { Employee, AttendanceStatus, AttendanceRecord } from '@/lib/supabase';
import {
  MONTH_NAMES, daysInMonth, computeEmployeeSalary, formatINR,
  type EmployeeSalaryCalc,
} from '@/lib/salaryUtils';
import {
  FileText, Download, Printer, Search, Filter, Loader2,
  Calendar, Users, IndianRupee, CheckCircle2, ChevronLeft, ChevronRight,
} from 'lucide-react';

export default function Reports() {
  const { user } = useAuth();
  const now = new Date();

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [statuses, setStatuses] = useState<AttendanceStatus[]>([]);
  const [records, setRecords] = useState<Record<string, AttendanceRecord>>({});
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedEmpId, setSelectedEmpId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  // Load all required data
  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    try {
      const [empRes, statusRes] = await Promise.all([
        supabase.from('employees').select('*').eq('user_id', user.id).order('name', { ascending: true }),
        supabase.from('attendance_statuses').select('*').eq('user_id', user.id).order('sort_order', { ascending: true }),
      ]);

      if (empRes.data) setEmployees(empRes.data as Employee[]);
      if (statusRes.data) setStatuses(statusRes.data as AttendanceStatus[]);

      // Load attendance records for current selected month
      const pad2 = (n: number) => n.toString().padStart(2, '0');
      const firstDay = `${selectedYear}-${pad2(selectedMonth)}-01`;
      const lastDay = `${selectedYear}-${pad2(selectedMonth)}-${pad2(daysInMonth(selectedYear, selectedMonth))}`;

      const recRes = await supabase
        .from('attendance_records')
        .select('*')
        .eq('user_id', user.id)
        .gte('date', firstDay)
        .lte('date', lastDay);

      if (recRes.data) {
        const map: Record<string, AttendanceRecord> = {};
        (recRes.data as AttendanceRecord[]).forEach(r => {
          map[`${r.employee_id}_${r.date}`] = r;
        });
        setRecords(map);
      }
    } finally {
      setLoading(false);
    }
  }, [user, selectedMonth, selectedYear]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Compute metrics for each employee
  const reportRows = useMemo(() => {
    return employees.map(emp => {
      const calc = computeEmployeeSalary(emp, records, statuses, selectedYear, selectedMonth);

      // Extract specific status counts
      const presentItem = calc.breakdown.find(b => b.status.label.toLowerCase() === 'present');
      const halfDayItem = calc.breakdown.find(b => b.status.label.toLowerCase() === 'half day');
      const absentItem = calc.breakdown.find(b => b.status.label.toLowerCase() === 'absent');
      const leaveItem = calc.breakdown.find(b => b.status.label.toLowerCase() === 'leave');

      return {
        employee: emp,
        calc,
        presentDays: presentItem ? presentItem.count : 0,
        halfDays: halfDayItem ? halfDayItem.count : 0,
        absentDays: absentItem ? absentItem.count : 0,
        leaveDays: leaveItem ? leaveItem.count : 0,
        otherBreakdown: calc.breakdown.filter(
          b => !['present', 'half day', 'absent', 'leave'].includes(b.status.label.toLowerCase())
        ),
      };
    });
  }, [employees, records, statuses, selectedYear, selectedMonth]);

  // Filtered rows based on search and employee selector
  const filteredRows = useMemo(() => {
    return reportRows.filter(row => {
      if (selectedEmpId !== 'all' && row.employee.id !== selectedEmpId) {
        return false;
      }
      if (searchQuery.trim() && !row.employee.name.toLowerCase().includes(searchQuery.toLowerCase().trim())) {
        return false;
      }
      return true;
    });
  }, [reportRows, selectedEmpId, searchQuery]);

  // Overall totals
  const totalEmployees = filteredRows.length;
  const totalEffectiveDays = filteredRows.reduce((sum, r) => sum + r.calc.totalEffectiveDays, 0);
  const totalPayableSalary = filteredRows.reduce((sum, r) => sum + (r.calc.payableSalary || 0), 0);
  const totalMonthlySalaries = filteredRows.reduce((sum, r) => sum + (r.calc.monthlySalary || 0), 0);

  // Export to CSV
  const exportToCSV = () => {
    const headers = [
      'Employee Name',
      'Present Days',
      'Half Days',
      'Absent Days',
      'Leave Days',
      'Effective Attendance Days',
      'Monthly Salary (INR)',
      'Divisor Method',
      'Daily Salary (INR)',
      'Payable Salary (INR)',
    ];

    const rows = filteredRows.map(r => [
      `"${r.employee.name.replace(/"/g, '""')}"`,
      r.presentDays,
      r.halfDays,
      r.absentDays,
      r.leaveDays,
      r.calc.totalEffectiveDays.toFixed(1),
      r.calc.monthlySalary ? r.calc.monthlySalary.toFixed(2) : '0.00',
      `"${r.calc.methodLabel} (${r.calc.divisor}d)"`,
      r.calc.dailySalary ? r.calc.dailySalary.toFixed(2) : '0.00',
      r.calc.payableSalary ? r.calc.payableSalary.toFixed(2) : '0.00',
    ]);

    const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Bee_Home_Attendance_Report_${MONTH_NAMES[selectedMonth - 1]}_${selectedYear}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Print view
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Header — hidden in print */}
      <div className="print:hidden flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 bg-amber-500/15 rounded-xl flex items-center justify-center">
            <FileText className="w-5 h-5 text-amber-500" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">Attendance & Payroll Reports</h1>
            <p className="text-xs text-slate-500">Generate monthly payroll statements, attendance audit, and export</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={exportToCSV}
            disabled={filteredRows.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors shadow-sm disabled:opacity-50"
          >
            <Download className="w-4 h-4 text-slate-500" /> Export CSV
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors shadow-sm"
          >
            <Printer className="w-4 h-4" /> Print / Save PDF
          </button>
        </div>
      </div>

      {/* Printable Title Block — Visible ONLY when printing */}
      <div className="hidden print:block mb-6 border-b border-slate-300 pb-4">
        <h1 className="text-2xl font-bold text-slate-900">Bee Home Creators</h1>
        <p className="text-sm font-medium text-slate-600">Monthly Attendance & Payroll Statement</p>
        <p className="text-xs text-slate-500 mt-1">
          Period: {MONTH_NAMES[selectedMonth - 1]} {selectedYear} &nbsp;·&nbsp; Generated on: {new Date().toLocaleDateString('en-IN')}
        </p>
      </div>

      {/* Filters Bar — hidden in print */}
      <div className="print:hidden bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-wrap items-center justify-between gap-4">
        {/* Month & Year Selectors */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              if (selectedMonth === 1) { setSelectedMonth(12); setSelectedYear(y => y - 1); }
              else setSelectedMonth(m => m - 1);
            }}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <select
            value={selectedMonth}
            onChange={e => setSelectedMonth(Number(e.target.value))}
            className="text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
          >
            {MONTH_NAMES.map((m, i) => (
              <option key={i + 1} value={i + 1}>{m}</option>
            ))}
          </select>

          <select
            value={selectedYear}
            onChange={e => setSelectedYear(Number(e.target.value))}
            className="text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
          >
            {Array.from({ length: 6 }, (_, i) => now.getFullYear() - 2 + i).map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>

          <button
            onClick={() => {
              if (selectedMonth === 12) { setSelectedMonth(1); setSelectedYear(y => y + 1); }
              else setSelectedMonth(m => m + 1);
            }}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Employee & Search Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search employee..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="text-sm pl-9 pr-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/30 placeholder:text-slate-400"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <Filter className="w-4 h-4 text-slate-400" />
            <select
              value={selectedEmpId}
              onChange={e => setSelectedEmpId(e.target.value)}
              className="text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
            >
              <option value="all">All Employees ({employees.length})</option>
              {employees.map(emp => (
                <option key={emp.id} value={emp.id}>{emp.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500 font-medium">Employees</span>
            <Users className="w-4 h-4 text-slate-400" />
          </div>
          <p className="text-2xl font-bold text-slate-800 mt-1">{totalEmployees}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">{MONTH_NAMES[selectedMonth - 1]} {selectedYear}</p>
        </div>

        <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500 font-medium">Effective Days</span>
            <CheckCircle2 className="w-4 h-4 text-amber-500" />
          </div>
          <p className="text-2xl font-bold text-amber-600 mt-1">{totalEffectiveDays.toFixed(1)}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">Total across staff</p>
        </div>

        <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500 font-medium">Base Payroll</span>
            <IndianRupee className="w-4 h-4 text-slate-400" />
          </div>
          <p className="text-2xl font-bold text-slate-700 mt-1">{formatINR(totalMonthlySalaries)}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">Monthly base commitment</p>
        </div>

        <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500 font-medium">Total Payable</span>
            <IndianRupee className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-bold text-emerald-600 mt-1">{formatINR(totalPayableSalary)}</p>
          <p className="text-[11px] text-emerald-600 font-medium mt-0.5">Final for this month</p>
        </div>
      </div>

      {/* Reports Table */}
      {loading ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center shadow-xs">
          <Loader2 className="w-8 h-8 text-amber-500 animate-spin mx-auto mb-2" />
          <p className="text-sm text-slate-500">Generating report statements...</p>
        </div>
      ) : filteredRows.length === 0 ? (
        <div className="bg-white border border-dashed border-slate-300 rounded-xl p-12 text-center shadow-xs">
          <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-600 font-medium">No records found</p>
          <p className="text-slate-400 text-xs mt-1">Try selecting a different month or clearing your search filter</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="bg-slate-800 text-white text-xs uppercase tracking-wider">
                  <th className="px-4 py-3.5 font-semibold">Employee</th>
                  <th className="px-2 py-3.5 font-semibold text-center">Present (1)</th>
                  <th className="px-2 py-3.5 font-semibold text-center">Half Day (0.5)</th>
                  <th className="px-2 py-3.5 font-semibold text-center">Absent (0)</th>
                  <th className="px-2 py-3.5 font-semibold text-center">Leave (0)</th>
                  <th className="px-3 py-3.5 font-semibold text-center bg-amber-950/40 text-amber-300">Effective Days</th>
                  <th className="px-3 py-3.5 font-semibold text-right">Monthly Base</th>
                  <th className="px-3 py-3.5 font-semibold text-center">Method</th>
                  <th className="px-3 py-3.5 font-semibold text-right">Daily Rate</th>
                  <th className="px-4 py-3.5 font-semibold text-right bg-emerald-950/40 text-emerald-300">Payable Salary</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {filteredRows.map((row, index) => {
                  const isEven = index % 2 === 0;
                  return (
                    <tr key={row.employee.id} className={`${isEven ? 'bg-white' : 'bg-slate-50/50'} hover:bg-amber-50/20 transition-colors`}>
                      <td className="px-4 py-3 font-semibold text-slate-800">
                        {row.employee.name}
                        {row.otherBreakdown.length > 0 && (
                          <div className="text-[10px] text-slate-400 font-normal mt-0.5">
                            Custom: {row.otherBreakdown.map(b => `${b.status.label}: ${b.count}`).join(', ')}
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-3 text-center text-slate-700">{row.presentDays}</td>
                      <td className="px-2 py-3 text-center text-slate-700">{row.halfDays}</td>
                      <td className="px-2 py-3 text-center text-slate-700">{row.absentDays}</td>
                      <td className="px-2 py-3 text-center text-slate-700">{row.leaveDays}</td>
                      <td className="px-3 py-3 text-center font-bold text-amber-700 bg-amber-50/50">
                        {row.calc.totalEffectiveDays.toFixed(1)}
                      </td>
                      <td className="px-3 py-3 text-right font-medium text-slate-700">
                        {row.calc.monthlySalary ? formatINR(row.calc.monthlySalary) : '—'}
                      </td>
                      <td className="px-3 py-3 text-center text-xs text-slate-500">
                        <span className="bg-slate-100 px-2 py-0.5 rounded text-[11px]">
                          {row.calc.divisor}d ({row.employee.salary_calculation_method === 'fixed_30' ? 'Fixed' : row.employee.salary_calculation_method === 'working_days' ? 'Work' : 'Cal'})
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right text-slate-600 font-mono text-xs">
                        {row.calc.dailySalary ? formatINR(row.calc.dailySalary) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-emerald-700 bg-emerald-50/50 text-sm">
                        {formatINR(row.calc.payableSalary)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>

              {/* Summary Footer Row */}
              <tfoot>
                <tr className="bg-slate-100 font-bold text-slate-800 border-t-2 border-slate-300">
                  <td className="px-4 py-3">Total ({filteredRows.length})</td>
                  <td className="px-2 py-3 text-center">{filteredRows.reduce((s, r) => s + r.presentDays, 0)}</td>
                  <td className="px-2 py-3 text-center">{filteredRows.reduce((s, r) => s + r.halfDays, 0)}</td>
                  <td className="px-2 py-3 text-center">{filteredRows.reduce((s, r) => s + r.absentDays, 0)}</td>
                  <td className="px-2 py-3 text-center">{filteredRows.reduce((s, r) => s + r.leaveDays, 0)}</td>
                  <td className="px-3 py-3 text-center text-amber-800 bg-amber-100/70">
                    {totalEffectiveDays.toFixed(1)}
                  </td>
                  <td className="px-3 py-3 text-right">{formatINR(totalMonthlySalaries)}</td>
                  <td className="px-3 py-3 text-center text-xs text-slate-400">—</td>
                  <td className="px-3 py-3 text-right text-xs text-slate-400">—</td>
                  <td className="px-4 py-3 text-right text-emerald-800 bg-emerald-100/70 text-base">
                    {formatINR(totalPayableSalary)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
