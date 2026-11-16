import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ArrowRight, Award, CalendarCheck, ClipboardList, Users } from 'lucide-react';
import { db } from '../../lib/firebase';
import { useAuth } from '../auth/AuthContext';
import { useI18n } from '../../i18n/I18nContext';
import { useStudentsData } from '../students/useStudentsData';
import type { AttendanceSession, NanoAttempt, OfflineExam } from '../../types';
import { formatDate, getTodayISO } from '../../lib/formatters';
import { SkeletonRows, SurfaceCard } from '../../components/ui/Primitives';

export function TeacherOverviewPage() {
  const { teacherProfile, userProfile } = useAuth();
  const { t, lang } = useI18n();
  const teacherId = userProfile?.uid || '';
  const { items: students, loading: studentsLoading } = useStudentsData();

  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [offlineExams, setOfflineExams] = useState<OfflineExam[]>([]);
  const [attempts, setAttempts] = useState<NanoAttempt[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      if (!db || !teacherId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const [sessSnap, examSnap, attSnap] = await Promise.all([
          getDocs(
            query(
              collection(db, 'attendanceSessions'),
              where('teacherId', '==', teacherId),
              orderBy('date', 'desc'),
              orderBy('createdAt', 'desc'),
              limit(200)
            )
          ),
          getDocs(
            query(
              collection(db, 'offlineExams'),
              where('teacherId', '==', teacherId),
              orderBy('createdAt', 'desc'),
              limit(20)
            )
          ),
          getDocs(
            query(
              collection(db, 'nanoAttempts'),
              where('teacherId', '==', teacherId),
              orderBy('submittedAt', 'desc'),
              limit(10)
            )
          ),
        ]);
        setSessions(sessSnap.docs.map((d) => ({ id: d.id, ...d.data() } as AttendanceSession)));
        setOfflineExams(examSnap.docs.map((d) => ({ id: d.id, ...d.data() } as OfflineExam)));
        setAttempts(attSnap.docs.map((d) => ({ id: d.id, ...d.data() } as NanoAttempt)));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [teacherId]);

  const greeting = useMemo(() => {
    const hr = new Date().getHours();
    if (hr < 12) return t.overview.greetingMorning;
    if (hr < 17) return t.overview.greetingAfternoon;
    return t.overview.greetingEvening;
  }, [t]);

  const activeCount = students.filter((s) => s.relationship.status !== 'archived').length;
  const todayISO = getTodayISO();
  const todayPresent = sessions.filter(
    (s) => s.date === todayISO && (s.status === 'present' || s.status === 'late')
  ).length;
  const todayTotal = sessions.filter((s) => s.date === todayISO).length;
  const draftExamsCount = offlineExams.filter((e) => !e.published).length;
  const publishedExamsCount = offlineExams.filter((e) => e.published).length;

  const trendData = useMemo(() => {
    const days: Array<{ date: string; present: number; absent: number }> = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
        d.getDate()
      ).padStart(2, '0')}`;
      const daySess = sessions.filter((s) => s.date === iso);
      days.push({
        date: iso.slice(5),
        present: daySess.filter((s) => s.status === 'present' || s.status === 'late').length,
        absent: daySess.filter((s) => s.status === 'absent').length,
      });
    }
    return days;
  }, [sessions]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            {greeting}, {teacherProfile?.name || userProfile?.displayName}
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {teacherProfile?.brandName || t.appName} · {formatDate(new Date(), lang)}
          </p>
        </div>
        <Link
          to="/teacher/attendance"
          className="inline-flex items-center gap-2 text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
        >
          <span>Mark today&apos;s attendance</span>
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <SurfaceCard className="p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {t.overview.totalStudents}
            </span>
            <Users className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          </div>
          <p className="mt-3 text-3xl font-bold font-mono-num text-slate-900 dark:text-slate-100">
            {studentsLoading ? '—' : activeCount}
          </p>
        </SurfaceCard>

        <SurfaceCard className="p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {t.overview.todayAttendance}
            </span>
            <CalendarCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <p className="mt-3 text-3xl font-bold font-mono-num text-slate-900 dark:text-slate-100">
            {loading ? '—' : `${todayPresent}/${todayTotal || activeCount}`}
          </p>
        </SurfaceCard>

        <SurfaceCard className="p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {t.overview.upcomingExams}
            </span>
            <ClipboardList className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          </div>
          <p className="mt-3 text-3xl font-bold font-mono-num text-slate-900 dark:text-slate-100">
            {loading ? '—' : draftExamsCount}
          </p>
        </SurfaceCard>

        <SurfaceCard className="p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {t.overview.recentResults}
            </span>
            <Award className="w-4 h-4 text-violet-600 dark:text-violet-400" />
          </div>
          <p className="mt-3 text-3xl font-bold font-mono-num text-slate-900 dark:text-slate-100">
            {loading ? '—' : publishedExamsCount}
          </p>
        </SurfaceCard>
      </div>

      {/* Attendance Trend & Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <SurfaceCard className="lg:col-span-7 p-5">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-4">
            {t.overview.attendanceTrend}
          </h3>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="present" name="Present" fill="#4F46E5" radius={[6, 6, 0, 0]} />
                <Bar dataKey="absent" name="Absent" fill="#F43F5E" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SurfaceCard>

        <SurfaceCard className="lg:col-span-5 p-5">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-4">
            {t.overview.recentActivity}
          </h3>
          {loading ? (
            <SkeletonRows rows={4} />
          ) : attempts.length === 0 && offlineExams.length === 0 && students.length === 0 ? (
            <p className="text-sm text-slate-500 py-8 text-center">
              Activity will appear here as you enroll students, log attendance, and publish exams.
            </p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
              {attempts.slice(0, 4).map((att) => {
                const st = students.find((s) => s.student.id === att.studentId);
                return (
                  <div key={att.id} className="py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-slate-900 dark:text-slate-100 truncate">
                        {st?.student.name || 'Student'} completed {att.examTitle}
                      </p>
                      <p className="text-xs text-slate-500">
                        {formatDate(att.submittedAt, lang)}
                      </p>
                    </div>
                    <span className="font-mono-num text-xs font-semibold text-indigo-600 dark:text-indigo-400 shrink-0">
                      {att.score}/{att.total}
                    </span>
                  </div>
                );
              })}
              {offlineExams.slice(0, 3).map((ex) => (
                <div key={ex.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900 dark:text-slate-100 truncate">
                      Offline Exam: {ex.title}
                    </p>
                    <p className="text-xs text-slate-500">
                      {ex.subject} · {ex.date}
                    </p>
                  </div>
                  <span className="text-xs text-slate-500 shrink-0">
                    {ex.published ? t.common.published : t.common.draft}
                  </span>
                </div>
              ))}
            </div>
          )}
        </SurfaceCard>
      </div>
    </div>
  );
}
