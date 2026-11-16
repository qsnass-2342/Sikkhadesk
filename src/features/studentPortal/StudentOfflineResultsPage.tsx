import React from 'react';
import { Award } from 'lucide-react';
import { useI18n } from '../../i18n/I18nContext';
import { useStudentPortalData } from './useStudentPortalData';
import { EmptyState, SkeletonRows, SurfaceCard } from '../../components/ui/Primitives';

export function StudentOfflineResultsPage() {
  const { t } = useI18n();
  const { offlineResults, loading } = useStudentPortalData();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
          {t.nav.offlineResults}
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          Published marks and remarks from written exams, sorted newest first.
        </p>
      </div>

      {loading ? (
        <SkeletonRows rows={4} />
      ) : offlineResults.length === 0 ? (
        <EmptyState
          icon={<Award className="w-6 h-6" />}
          title={t.studentPortal.noResults}
          description="Published offline exam marks from your tutor will appear here."
        />
      ) : (
        <SurfaceCard className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500">
                <tr>
                  <th className="py-3.5 px-4 font-medium">Exam</th>
                  <th className="py-3.5 px-4 font-medium">{t.common.subject}</th>
                  <th className="py-3.5 px-4 font-medium">{t.common.date}</th>
                  <th className="py-3.5 px-4 font-medium text-right">Score</th>
                  <th className="py-3.5 px-4 font-medium">Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {offlineResults.map((r) => {
                  const pct =
                    r.totalMarks > 0 ? Math.round((r.marksObtained / r.totalMarks) * 100) : 0;
                  return (
                    <tr key={r.id}>
                      <td className="py-3.5 px-4 font-medium text-slate-900 dark:text-slate-100">
                        {r.examTitle}
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 dark:text-slate-400">
                        {r.subject}
                      </td>
                      <td className="py-3.5 px-4 font-mono-num text-xs text-slate-500">
                        {r.examDate}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono-num font-semibold text-indigo-600 dark:text-indigo-400">
                        {r.marksObtained}/{r.totalMarks} ({pct}%)
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 dark:text-slate-400">
                        {r.remarks || '—'}
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
