import React, { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { TrendingUp } from 'lucide-react';
import { useI18n } from '../../i18n/I18nContext';
import { useStudentPortalData } from '../studentPortal/useStudentPortalData';
import { EmptyState, SkeletonRows, SurfaceCard } from '../../components/ui/Primitives';
import { formatDate } from '../../lib/formatters';

export function StudentProgressPage() {
  const { t, lang } = useI18n();
  const { nanoAttempts, offlineResults, loading } = useStudentPortalData();

  const timeline = useMemo(() => {
    const entries: Array<{
      id: string;
      title: string;
      subject: string;
      kind: 'Nano' | 'Offline';
      pct: number;
      scoreLabel: string;
      timeMs: number;
      dateLabel: string;
    }> = [];

    nanoAttempts.forEach((a) => {
      const ms = a.submittedAt?.toMillis?.() ?? 0;
      entries.push({
        id: a.id,
        title: a.examTitle,
        subject: a.subject,
        kind: 'Nano',
        pct: a.percentage,
        scoreLabel: `${a.score}/${a.total}`,
        timeMs: ms,
        dateLabel: formatDate(a.submittedAt, lang),
      });
    });

    offlineResults.forEach((r) => {
      const ms = r.publishedAt?.toMillis?.() ?? (r.examDate ? new Date(r.examDate).getTime() : 0);
      const pct = r.totalMarks > 0 ? Math.round((r.marksObtained / r.totalMarks) * 100) : 0;
      entries.push({
        id: r.id,
        title: r.examTitle,
        subject: r.subject,
        kind: 'Offline',
        pct,
        scoreLabel: `${r.marksObtained}/${r.totalMarks}`,
        timeMs: ms,
        dateLabel: r.examDate || formatDate(r.publishedAt, lang),
      });
    });

    return entries.sort((a, b) => b.timeMs - a.timeMs);
  }, [nanoAttempts, offlineResults, lang]);

  const chartOverTime = useMemo(() => [...timeline].reverse(), [timeline]);

  const subjectBreakdown = useMemo(() => {
    const map = new Map<string, { total: number; count: number }>();
    timeline.forEach((item) => {
      const subj = item.subject || 'General';
      const cur = map.get(subj) || { total: 0, count: 0 };
      cur.total += item.pct;
      cur.count += 1;
      map.set(subj, cur);
    });
    return Array.from(map.entries()).map(([subject, val]) => ({
      subject,
      average: Math.round(val.total / val.count),
    }));
  }, [timeline]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
          {t.nav.progress}
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          Performance trends across Nano Exams and Offline Exams.
        </p>
      </div>

      {loading ? (
        <SkeletonRows rows={4} />
      ) : timeline.length === 0 ? (
        <EmptyState
          icon={<TrendingUp className="w-6 h-6" />}
          title="No graded assessments yet"
          description="Complete a Nano Exam or wait for published offline exam marks to track your progress."
        />
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <SurfaceCard className="p-5">
              <h3 className="text-sm font-semibold mb-4">Score Trend (%)</h3>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartOverTime}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" />
                    <XAxis dataKey="title" tick={{ fontSize: 11 }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Line
                      type="monotone"
                      dataKey="pct"
                      name="Score %"
                      stroke="#4F46E5"
                      strokeWidth={2.5}
                      dot={{ r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </SurfaceCard>

            <SurfaceCard className="p-5">
              <h3 className="text-sm font-semibold mb-4">Subject-Wise Average (%)</h3>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={subjectBreakdown}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" />
                    <XAxis dataKey="subject" tick={{ fontSize: 11 }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="average" name="Avg %" fill="#7C3AED" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </SurfaceCard>
          </div>

          <SurfaceCard className="overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-sm font-semibold">Complete Assessment History (Newest First)</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500">
                  <tr>
                    <th className="py-3 px-4 font-medium">Assessment</th>
                    <th className="py-3 px-4 font-medium">Type</th>
                    <th className="py-3 px-4 font-medium">{t.common.subject}</th>
                    <th className="py-3 px-4 font-medium">{t.common.date}</th>
                    <th className="py-3 px-4 font-medium text-right">Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {timeline.map((item) => (
                    <tr key={item.id}>
                      <td className="py-3 px-4 font-medium">{item.title}</td>
                      <td className="py-3 px-4 text-xs text-slate-500">{item.kind}</td>
                      <td className="py-3 px-4 text-slate-600 dark:text-slate-400">
                        {item.subject}
                      </td>
                      <td className="py-3 px-4 text-xs font-mono-num text-slate-500">
                        {item.dateLabel}
                      </td>
                      <td className="py-3 px-4 text-right font-mono-num font-semibold text-indigo-600 dark:text-indigo-400">
                        {item.scoreLabel} ({item.pct}%)
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SurfaceCard>
        </>
      )}
    </div>
  );
}
