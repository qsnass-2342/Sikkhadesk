import React from 'react';
import { BookOpen, ExternalLink } from 'lucide-react';
import { useI18n } from '../../i18n/I18nContext';
import { useStudentPortalData } from './useStudentPortalData';
import { EmptyState, SkeletonRows, SurfaceCard } from '../../components/ui/Primitives';
import { formatDate } from '../../lib/formatters';

export function StudentMaterialsPage() {
  const { t, lang } = useI18n();
  const { materials, loading } = useStudentPortalData();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
          {t.nav.materials}
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          Materials assigned to you by your tutor, sorted newest first.
        </p>
      </div>

      {loading ? (
        <SkeletonRows rows={4} />
      ) : materials.length === 0 ? (
        <EmptyState
          icon={<BookOpen className="w-6 h-6" />}
          title={t.studentPortal.noMaterials}
          description="Your tutor has not assigned study materials yet."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {materials.map(({ assignment, material }) => (
            <SurfaceCard key={assignment.id} className="p-5 flex flex-col justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  {material.title}
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  <span>{material.subject}</span>
                  <span aria-hidden="true"> · </span>
                  <span className="uppercase">{material.type}</span>
                  <span aria-hidden="true"> · </span>
                  <span className="tabular-nums">{formatDate(assignment.assignedAt, lang)}</span>
                </p>
                {material.description && (
                  <p className="text-sm text-slate-600 dark:text-slate-400 mt-3">
                    {material.description}
                  </p>
                )}
              </div>

              {material.url && (
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
                  <a
                    href={material.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
                  >
                    <span>Open Resource</span>
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              )}
            </SurfaceCard>
          ))}
        </div>
      )}
    </div>
  );
}
