import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext';

function FullScreenLoader() {
  return (
    <div className="min-h-screen bg-[#F8F7F4] dark:bg-[#0B0F19] flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-9 h-9 rounded-xl border-2 border-indigo-600 border-t-transparent animate-spin" />
        <p className="text-xs text-slate-500 dark:text-slate-400">Loading workspace...</p>
      </div>
    </div>
  );
}

export function RequireTeacher({ children }: { children: React.ReactNode }) {
  const { loading, firebaseUser, userProfile } = useAuth();
  if (loading) return <FullScreenLoader />;
  if (!firebaseUser || !userProfile) return <Navigate to="/login" replace />;
  if (userProfile.role !== 'teacher') return <Navigate to="/student" replace />;
  return <>{children}</>;
}

export function RequireStudent({ children }: { children: React.ReactNode }) {
  const { loading, firebaseUser, userProfile } = useAuth();
  if (loading) return <FullScreenLoader />;
  if (!firebaseUser || !userProfile) return <Navigate to="/login" replace />;
  if (userProfile.role !== 'student') return <Navigate to="/teacher" replace />;
  return <>{children}</>;
}

export function RootRedirect() {
  const { loading, firebaseUser, userProfile } = useAuth();
  if (loading) return <FullScreenLoader />;
  if (!firebaseUser || !userProfile) return <Navigate to="/login" replace />;
  return (
    <Navigate to={userProfile.role === 'teacher' ? '/teacher' : '/student'} replace />
  );
}
