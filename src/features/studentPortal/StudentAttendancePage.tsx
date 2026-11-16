import React, { useMemo, useState } from 'react';
import { CalendarCheck } from 'lucide-react';
import { useI18n } from '../../i18n/I18nContext';
import { useStudentPortalData } from './useStudentPortalData';
import { getMonthISO } from '../../lib/formatters';
import { EmptyState, SkeletonRows, SurfaceCard } from '../../components/ui/Primitives';

export function StudentAttendancePage() {
  const { t } = useI18n();
  const { sessions, summaries, loading } = useStudentPortalData();
  const [selectedMonth, setSelectedMonth] = useState(getMonthISO());

  const currentSummary = useMemo(
    () => summaries.find((s) => s.month === selectedMonth) || null,
    [summaries, selectedMonth]
  );

  const monthSessions = useMemo(
    () => sessions.filter((s) => s.date.startsWith(selectedMonth)),
    [sessions, selectedMonth]
  );

  const calendarDays = useMemo(() => {
    const [y, m] = selectedMonth.split('-').map(Number);
    if (!y || !m) return [];
    const totalDays = new Date(y, m, 0).getDate();
    const firstWeekday = new Date(y, m - 1, 1).getDay();
    const cells: Array<{ day: number | null; iso: string }> = [];
    for (let i = 0; i < firstWeekday; i++) cells.push({ day: null, iso: '' });
    for (let d = 1; d <= totalDays; d++) {
      cells.push({ day: d, iso: `${selectedMonth}-${String(d).padStart(2, '0')}` });
    }
    return cells;
  }, [selectedMonth]);

  const statusByDate = useMemo(() => {
    const map = new Map<string, string>();
    monthSessions.forEach((s) => map.set(s.date, s.status));
    return map;
  }, [monthSessions]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            {t.nav.attendance}
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Monthly attendance calendar and summary.
          </p>
        </div>
        <input
          type="month"
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(e.target.value)}
          className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-mono-num"
        />
      </div>

      {loading ? (
        <SkeletonRows rows={4} />
      ) : sessions.length === 0 ? (
        <EmptyState
          icon={<CalendarCheck className="w-6 h-6" />}
          title="No attendance records yet"
          description="Your daily class attendance marked by your tutor will appear here."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <SurfaceCard className="p-4">
              <p className="text-xs text-slate-500">{t.common.present}</p>
              <p className="text-2xl font-bold font-mono-num text-emerald-600 dark:text-emerald-400 mt-1">
                {currentSummary?.present || 0}
              </p>
            </SurfaceCard>
            <SurfaceCard className="p-4">
              <p className="text-xs text-slate-500">{t.common.absent}</p>
              <p className="text-2xl font-bold font-mono-num text-rose-600 dark:text-rose-400 mt-1">
                {currentSummary?.absent || 0}
              </p>
            </SurfaceCard>
            <SurfaceCard className="p-4">
              <p className="text-xs text-slate-500">{t.common.late}</p>
              <p className="text-2xl font-bold font-mono-num text-amber-600 dark:text-amber-400 mt-1">
                {currentSummary?.late || 0}
              </p>
            </SurfaceCard>
            <SurfaceCard className="p-4">
              <p className="text-xs text-slate-500">{t.common.leave}</p>
              <p className="text-2xl font-bold font-mono-num text-slate-600 dark:text-slate-300 mt-1">
                {currentSummary?.leave || 0}
              </p>
            </SurfaceCard>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <SurfaceCard className="lg:col-span-5 p-5">
              <h3 className="text-sm font-semibold mb-4 font-mono-num">{selectedMonth}</h3>
              <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-slate-400 mb-2">
                {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
                  <div key={d}>{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1.5">
                {calendarDays.map((cell, idx) => {
                  if (cell.day === null) return <div key={idx} />;
                  const st = statusByDate.get(cell.iso);
                  const cls =
                    st === 'present'
                      ? 'bg-emerald-600 text-white'
                      : st === 'absent'
                        ? 'bg-rose-600 text-white'
                        : st === 'late'
                          ? 'bg-amber-500 text-white'
                          : st === 'leave'
                            ? 'bg-slate-500 text-white'
                            : 'bg-slate-100/70 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400';

                  return (
                    <div
                      key={cell.iso}
                      title={st ? `${cell.iso}: ${st}` : cell.iso}
                      className={`h-9 rounded-lg text-xs font-mono-num flex items-center justify-center ${cls}`}
                    >
                      {cell.day}
                    </div>
                  );
                })}
              </div>
            </SurfaceCard>

            <SurfaceCard className="lg:col-span-7 p-5">
              <h3 className="text-sm font-semibold mb-3">Session Log (Newest First)</h3>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                {monthSessions.length === 0 ? (
                  <p className="text-sm text-slate-500 py-6 text-center">
                    No sessions recorded in {selectedMonth}.
                  </p>
                ) : (
                  monthSessions.map((s) => (
                    <div key={s.id} className="py-2.5 flex items-center justify-between">
                      <span className="font-mono-num text-slate-700 dark:text-slate-300">
                        {s.date}
                      </span>
                      <span className="capitalize font-medium text-slate-900 dark:text-slate-100">
                        {s.status}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </SurfaceCard>
          </div>
        </>
      )}
    </div>
  );
}
