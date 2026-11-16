import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Award, BookOpen, ClipboardList, Link2 } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { useI18n } from '../../i18n/I18nContext';
import { useStudentPortalData } from './useStudentPortalData';
import { BrandLogo, EmptyState, SkeletonRows, SurfaceCard } from '../../components/ui/Primitives';
import { formatDate } from '../../lib/formatters';

export function StudentHomePage() {
  const { userProfile, linkedTeachers } = useAuth();
  const { t, lang } = useI18n();
  const {
    activeTeacher,
    activeRelationship,
    nanoExams,
    nanoAttempts,
    offlineResults,
    materials,
    loading,
  } = useStudentPortalData();

  const accent = activeTeacher?.themeColor || '#4F46E5';

  const overallPercent = useMemo(() => {
    const scores: number[] = [];
    nanoAttempts.forEach((a) => scores.push(a.percentage));
    offlineResults.forEach((r) => {
      if (r.totalMarks > 0) scores.push(Math.round((r.marksObtained / r.totalMarks) * 100));
    });
    if (scores.length === 0) return 0;
    return Math.round(scores.reduce((acc, s) => acc + s, 0) / scores.length);
  }, [nanoAttempts, offlineResults]);

  if (linkedTeachers.length === 0) {
    return (
      <EmptyState
        icon={<Link2 className="w-6 h-6" />}
        title="No Tutor Linked Yet"
        description="Ask your tutor to send you a single-use invitation link. Open that link while signed in to unlock your materials, attendance, and exams."
      />
    );
  }

  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (overallPercent / 100) * circumference;

  return (
    <div className="space-y-6">
      {/* Teacher-branded Welcome Banner */}
      <SurfaceCard className="p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div className="flex items-start gap-4">
          <BrandLogo
            logoUrl={activeTeacher?.logoUrl}
            brandName={activeTeacher?.brandName || t.appName}
            accentColor={accent}
            size="lg"
          />
          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {activeTeacher?.brandName} · {activeRelationship?.class}
            </p>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-0.5">
              {t.studentPortal.welcome}, {userProfile?.displayName}
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Subjects: {activeRelationship?.subjects?.join(', ') || 'General'}
            </p>
          </div>
        </div>

        {/* Progress Ring */}
        <div className="flex items-center gap-4 shrink-0">
          <div className="relative w-24 h-24 flex items-center justify-center">
            <svg className="w-24 h-24 -rotate-90" viewBox="0 0 96 96">
              <circle
                cx="48"
                cy="48"
                r={radius}
                fill="none"
                stroke="currentColor"
                strokeWidth="7"
                className="text-slate-200 dark:text-slate-800"
              />
              <circle
                cx="48"
                cy="48"
                r={radius}
                fill="none"
                stroke={accent}
                strokeWidth="7"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={dashOffset}
              />
            </svg>
            <span className="absolute text-lg font-bold font-mono-num text-slate-900 dark:text-slate-100">
              {overallPercent}%
            </span>
          </div>
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t.studentPortal.overallProgress}
            </p>
            <p className="text-xs font-mono-num text-slate-700 dark:text-slate-300 mt-1">
              {nanoAttempts.length + offlineResults.length} assessments
            </p>
          </div>
        </div>
      </SurfaceCard>

      {loading ? (
        <SkeletonRows rows={4} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Available Nano Exams */}
          <SurfaceCard className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <ClipboardList className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {t.studentPortal.upcomingNano}
                </h3>
              </div>
              <Link
                to="/student/nano-exams"
                className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-1"
              >
                <span>View all</span>
                <ArrowRight className="w-3 h-3" />
              </Link>
            </div>

            {nanoExams.length === 0 ? (
              <p className="text-sm text-slate-500 py-6 text-center">{t.studentPortal.noExams}</p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {nanoExams.slice(0, 4).map((ex) => (
                  <div key={ex.id} className="py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                        {ex.title}
                      </p>
                      <p className="text-xs text-slate-500">
                        {ex.subject} · {ex.questionIds.length} Qs · {ex.durationMinutes}m
                      </p>
                    </div>
                    <Link
                      to={`/student/nano-exams?start=${ex.id}`}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium text-white shrink-0"
                      style={{ backgroundColor: accent }}
                    >
                      {t.studentPortal.startExam}
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </SurfaceCard>

          {/* Latest Results */}
          <SurfaceCard className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Award className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {t.studentPortal.latestResults}
                </h3>
              </div>
              <Link
                to="/student/progress"
                className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-1"
              >
                <span>{t.nav.progress}</span>
                <ArrowRight className="w-3 h-3" />
              </Link>
            </div>

            {offlineResults.length === 0 && nanoAttempts.length === 0 ? (
              <p className="text-sm text-slate-500 py-6 text-center">{t.studentPortal.noResults}</p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {nanoAttempts.slice(0, 3).map((a) => (
                  <div key={a.id} className="py-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                        {a.examTitle} (Nano)
                      </p>
                      <p className="text-xs text-slate-500">
                        {a.subject} · {formatDate(a.submittedAt, lang)}
                      </p>
                    </div>
                    <span className="font-mono-num text-sm font-semibold text-indigo-600 dark:text-indigo-400">
                      {a.score}/{a.total} ({a.percentage}%)
                    </span>
                  </div>
                ))}
                {offlineResults.slice(0, 3).map((r) => (
                  <div key={r.id} className="py-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                        {r.examTitle} (Offline)
                      </p>
                      <p className="text-xs text-slate-500">
                        {r.subject} · {r.examDate}
                      </p>
                    </div>
                    <span className="font-mono-num text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                      {r.marksObtained}/{r.totalMarks}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </SurfaceCard>

          {/* Recent Study Materials */}
          <SurfaceCard className="p-5 lg:col-span-2">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {t.nav.materials}
                </h3>
              </div>
              <Link
                to="/student/materials"
                className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-1"
              >
                <span>All materials</span>
                <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            {materials.length === 0 ? (
              <p className="text-sm text-slate-500 py-4 text-center">
                {t.studentPortal.noMaterials}
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {materials.slice(0, 3).map(({ material }) => (
                  <div
                    key={material.id}
                    className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800"
                  >
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                      {material.title}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      {material.subject} · {material.type.toUpperCase()}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </SurfaceCard>
        </div>
      )}
    </div>
  );
}
