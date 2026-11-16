import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { CalendarCheck, Check, Clock, FileWarning, X } from 'lucide-react';
import { db } from '../../lib/firebase';
import { sortNewestFirst } from '../../lib/firestoreSort';
import { useAuth } from '../auth/AuthContext';
import { useI18n } from '../../i18n/I18nContext';
import { useStudentsData } from '../students/useStudentsData';
import type { AttendanceSession, AttendanceStatus, AttendanceSummary } from '../../types';
import { getMonthISO, getTodayISO } from '../../lib/formatters';
import {
  EmptyState,
  SkeletonRows,
  SurfaceCard,
  inputClass,
} from '../../components/ui/Primitives';
import { useToast } from '../../components/ui/Toast';

export function AttendancePage() {
  const { userProfile } = useAuth();
  const { t } = useI18n();
  const { showToast } = useToast();
  const teacherId = userProfile?.uid || '';
  const { items: students, loading: studentsLoading } = useStudentsData();

  const [selectedDate, setSelectedDate] = useState(getTodayISO());
  const selectedMonth = selectedDate.slice(0, 7) || getMonthISO();

  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [summaries, setSummaries] = useState<AttendanceSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  const activeStudents = useMemo(
    () => students.filter((s) => s.relationship.status !== 'archived'),
    [students]
  );

  const loadAttendance = useCallback(
    async (silent = false) => {
      if (!db || !teacherId) {
        setLoading(false);
        return;
      }
      if (!silent) setLoading(true);
      try {
        const [sessSnap, sumSnap] = await Promise.all([
          getDocs(
            query(collection(db, 'attendanceSessions'), where('teacherId', '==', teacherId))
          ),
          getDocs(
            query(collection(db, 'attendanceSummaries'), where('teacherId', '==', teacherId))
          ),
        ]);

        setSessions(
          sortNewestFirst(
            sessSnap.docs.map((d) => ({ id: d.id, ...d.data() } as AttendanceSession)),
            (s) => s.date || s.createdAt
          )
        );
        setSummaries(sumSnap.docs.map((d) => ({ id: d.id, ...d.data() } as AttendanceSummary)));
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Failed to load attendance', 'error');
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [teacherId, showToast]
  );

  useEffect(() => {
    loadAttendance();
  }, [loadAttendance]);

  const sessionMapForDate = useMemo(() => {
    const map = new Map<string, AttendanceSession>();
    sessions
      .filter((s) => s.date === selectedDate)
      .forEach((s) => map.set(s.studentId, s));
    return map;
  }, [sessions, selectedDate]);

  const handleMarkStatus = async (
    studentId: string,
    relationshipId: string,
    status: AttendanceStatus
  ) => {
    if (!db || !teacherId) return;
    setSavingId(studentId);
    const sessionDocId = `${teacherId}_${studentId}_${selectedDate}`;
    const summaryDocId = `${teacherId}_${studentId}_${selectedMonth}`;
    const existingSession = sessionMapForDate.get(studentId);

    try {
      await setDoc(
        doc(db, 'attendanceSessions', sessionDocId),
        {
          teacherId,
          studentId,
          relationshipId,
          date: selectedDate,
          status,
          note: existingSession?.note ?? '',
          ...(existingSession ? {} : { createdAt: serverTimestamp() }),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      // Recompute monthly summary from sessions state + this update
      const monthSessions = sessions.filter(
        (s) =>
          s.studentId === studentId &&
          s.date.startsWith(selectedMonth) &&
          s.date !== selectedDate
      );
      const counts = { present: 0, absent: 0, late: 0, leave: 0 };
      monthSessions.forEach((s) => {
        counts[s.status] = (counts[s.status] || 0) + 1;
      });
      counts[status] += 1;
      const total = counts.present + counts.absent + counts.late + counts.leave;

      await setDoc(
        doc(db, 'attendanceSummaries', summaryDocId),
        {
          teacherId,
          studentId,
          month: selectedMonth,
          ...counts,
          total,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      await loadAttendance(true);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not update attendance', 'error');
    } finally {
      setSavingId(null);
    }
  };

  // Calendar grid days for selectedMonth
  const calendarDays = useMemo(() => {
    const [y, m] = selectedMonth.split('-').map(Number);
    if (!y || !m) return [];
    const totalDays = new Date(y, m, 0).getDate();
    const firstWeekday = new Date(y, m - 1, 1).getDay();
    const cells: Array<{ day: number | null; iso: string }> = [];
    for (let i = 0; i < firstWeekday; i++) cells.push({ day: null, iso: '' });
    for (let d = 1; d <= totalDays; d++) {
      const iso = `${selectedMonth}-${String(d).padStart(2, '0')}`;
      cells.push({ day: d, iso });
    }
    return cells;
  }, [selectedMonth]);

  const datesWithRecords = useMemo(() => {
    const set = new Set<string>();
    sessions.forEach((s) => {
      if (s.date.startsWith(selectedMonth)) set.add(s.date);
    });
    return set;
  }, [sessions, selectedMonth]);

  const statusButtons: Array<{
    key: AttendanceStatus;
    label: string;
    icon: React.ReactNode;
    activeCls: string;
  }> = [
    {
      key: 'present',
      label: t.common.present,
      icon: <Check className="w-3.5 h-3.5" />,
      activeCls: 'bg-emerald-600 text-white border-emerald-600',
    },
    {
      key: 'absent',
      label: t.common.absent,
      icon: <X className="w-3.5 h-3.5" />,
      activeCls: 'bg-rose-600 text-white border-rose-600',
    },
    {
      key: 'late',
      label: t.common.late,
      icon: <Clock className="w-3.5 h-3.5" />,
      activeCls: 'bg-amber-500 text-white border-amber-500',
    },
    {
      key: 'leave',
      label: t.common.leave,
      icon: <FileWarning className="w-3.5 h-3.5" />,
      activeCls: 'bg-slate-600 text-white border-slate-600',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            {t.attendance.title}
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {t.attendance.subtitle}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className={`${inputClass} w-auto font-mono-num`}
          />
        </div>
      </div>

      {studentsLoading || loading ? (
        <SkeletonRows rows={5} />
      ) : activeStudents.length === 0 ? (
        <EmptyState
          icon={<CalendarCheck className="w-6 h-6" />}
          title={t.attendance.emptyTitle}
          description={t.attendance.emptyDesc}
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Monthly Calendar Picker */}
          <SurfaceCard className="lg:col-span-4 p-5 h-fit">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 font-mono-num">
                {selectedMonth}
              </h3>
              <span className="text-xs text-slate-500">Tap a date</span>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-slate-400 mb-2">
              {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
                <div key={d} className="py-1 font-medium">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {calendarDays.map((cell, idx) =>
                cell.day === null ? (
                  <div key={idx} />
                ) : (
                  <button
                    key={cell.iso}
                    type="button"
                    onClick={() => setSelectedDate(cell.iso)}
                    className={`h-9 rounded-lg text-xs font-mono-num transition-colors flex flex-col items-center justify-center ${
                      selectedDate === cell.iso
                        ? 'bg-indigo-600 text-white font-semibold'
                        : datesWithRecords.has(cell.iso)
                          ? 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 font-medium'
                          : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <span>{cell.day}</span>
                  </button>
                )
              )}
            </div>
          </SurfaceCard>

          {/* Daily Roll Call */}
          <SurfaceCard className="lg:col-span-8 p-5">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Daily Roll Call · <span className="font-mono-num">{selectedDate}</span>
              </h3>
              <span className="text-xs text-slate-500 tabular-nums">
                {activeStudents.length} students
              </span>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {activeStudents.map((item) => {
                const current = sessionMapForDate.get(item.student.id)?.status;
                const isBusy = savingId === item.student.id;
                return (
                  <div
                    key={item.student.id}
                    className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                        {item.student.name}
                      </p>
                      <p className="text-xs text-slate-500">
                        {item.relationship.class} · {item.relationship.subjects.join(', ')}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {statusButtons.map((btn) => {
                        const isActive = current === btn.key;
                        return (
                          <button
                            key={btn.key}
                            type="button"
                            disabled={isBusy}
                            onClick={() =>
                              handleMarkStatus(item.student.id, item.relationship.id, btn.key)
                            }
                            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                              isActive
                                ? btn.activeCls
                                : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                            }`}
                          >
                            {btn.icon}
                            <span>{btn.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </SurfaceCard>
        </div>
      )}

      {/* Monthly Summary Table */}
      {activeStudents.length > 0 && (
        <SurfaceCard className="overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {t.attendance.monthlySummary} ({selectedMonth})
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500">
                <tr>
                  <th className="py-3 px-4 font-medium">Student</th>
                  <th className="py-3 px-4 font-medium text-right">{t.common.present}</th>
                  <th className="py-3 px-4 font-medium text-right">{t.common.absent}</th>
                  <th className="py-3 px-4 font-medium text-right">{t.common.late}</th>
                  <th className="py-3 px-4 font-medium text-right">{t.common.leave}</th>
                  <th className="py-3 px-4 font-medium text-right">Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {activeStudents.map((item) => {
                  const sum = summaries.find(
                    (s) => s.studentId === item.student.id && s.month === selectedMonth
                  );
                  const present = sum?.present || 0;
                  const absent = sum?.absent || 0;
                  const late = sum?.late || 0;
                  const leave = sum?.leave || 0;
                  const total = sum?.total || 0;
                  const rate = total > 0 ? Math.round(((present + late) / total) * 100) : 0;

                  return (
                    <tr key={item.student.id}>
                      <td className="py-3 px-4 font-medium">{item.student.name}</td>
                      <td className="py-3 px-4 text-right font-mono-num text-emerald-600 dark:text-emerald-400">
                        {present}
                      </td>
                      <td className="py-3 px-4 text-right font-mono-num text-rose-600 dark:text-rose-400">
                        {absent}
                      </td>
                      <td className="py-3 px-4 text-right font-mono-num text-amber-600 dark:text-amber-400">
                        {late}
                      </td>
                      <td className="py-3 px-4 text-right font-mono-num text-slate-500">
                        {leave}
                      </td>
                      <td className="py-3 px-4 text-right font-mono-num font-semibold">
                        {total > 0 ? `${rate}%` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </SurfaceCard>
      )}
    </div>
  );
}
