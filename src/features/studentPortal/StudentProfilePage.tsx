import React from 'react';
import { useAuth } from '../auth/AuthContext';
import { useI18n } from '../../i18n/I18nContext';
import { BrandLogo, SurfaceCard } from '../../components/ui/Primitives';

export function StudentProfilePage() {
  const { userProfile, studentProfiles, studentRelationships, linkedTeachers } = useAuth();
  const { t } = useI18n();

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
          {t.nav.myProfile}
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          Your global student account and linked tutors.
        </p>
      </div>

      <SurfaceCard className="p-6 space-y-4">
        <div className="flex items-center gap-4">
          {userProfile?.photoURL ? (
            <img
              src={userProfile.photoURL}
              alt={userProfile.displayName}
              referrerPolicy="no-referrer"
              className="w-12 h-12 rounded-2xl object-cover border border-slate-200 dark:border-slate-700"
            />
          ) : (
            <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center font-bold text-lg">
              {(userProfile?.displayName || 'S').charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {userProfile?.displayName}
            </h3>
            <p className="text-xs font-mono-num text-slate-500">{userProfile?.email}</p>
          </div>
        </div>
      </SurfaceCard>

      <SurfaceCard className="p-6 space-y-4">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          Enrolled Tutors & Subjects
        </h3>
        {studentRelationships.length === 0 ? (
          <p className="text-sm text-slate-500">No tutors linked yet.</p>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {studentRelationships.map((rel) => {
              const teacher = linkedTeachers.find((lt) => lt.uid === rel.teacherId);
              const stuProfile = studentProfiles.find((sp) => sp.id === rel.studentId);
              return (
                <div key={rel.id} className="py-4 flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <BrandLogo
                      logoUrl={teacher?.logoUrl}
                      brandName={teacher?.brandName || 'Tutor'}
                      accentColor={teacher?.themeColor || '#4F46E5'}
                    />
                    <div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {teacher?.brandName || 'Tutor'} ({teacher?.name})
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Class: {rel.class} · Subjects: {rel.subjects.join(', ')}
                      </p>
                      {stuProfile && (
                        <p className="text-xs text-slate-400 mt-1">
                          Guardian: {stuProfile.guardianName || '—'} ·{' '}
                          {stuProfile.guardianPhone || '—'}
                        </p>
                      )}
                    </div>
                  </div>
                  <span className="text-xs capitalize text-emerald-600 dark:text-emerald-400 font-medium">
                    {rel.status}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </SurfaceCard>
    </div>
  );
}
