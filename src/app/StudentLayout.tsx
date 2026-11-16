import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import {
  Award,
  BookOpen,
  CalendarCheck,
  ClipboardList,
  Globe,
  Home,
  LogOut,
  Moon,
  Sun,
  TrendingUp,
  UserCircle,
} from 'lucide-react';
import { useAuth } from '../features/auth/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import { useTheme } from '../hooks/useTheme';
import { BrandLogo } from '../components/ui/Primitives';

export function StudentLayout() {
  const {
    linkedTeachers,
    activeTeacherId,
    setActiveTeacherId,
    signOut,
  } = useAuth();
  const { t, toggleLang } = useI18n();
  const { theme, toggleTheme } = useTheme();

  const activeTeacher =
    linkedTeachers.find((lt) => lt.uid === activeTeacherId) || linkedTeachers[0] || null;
  const brandName = activeTeacher?.brandName || t.appName;
  const accentColor = activeTeacher?.themeColor || '#4F46E5';

  const navItems = [
    { to: '/student', end: true, label: t.nav.home, icon: Home },
    { to: '/student/materials', label: t.nav.materials, icon: BookOpen },
    { to: '/student/attendance', label: t.nav.attendance, icon: CalendarCheck },
    { to: '/student/nano-exams', label: t.nav.nanoExams, icon: ClipboardList },
    { to: '/student/offline-results', label: t.nav.offlineResults, icon: Award },
    { to: '/student/progress', label: t.nav.progress, icon: TrendingUp },
    { to: '/student/profile', label: t.nav.myProfile, icon: UserCircle },
  ];

  // Mobile bottom nav prioritizes 5 primary tabs; Profile & Results remain accessible
  const mobileBottomItems = [
    { to: '/student', end: true, label: t.nav.home, icon: Home },
    { to: '/student/materials', label: t.nav.materials, icon: BookOpen },
    { to: '/student/nano-exams', label: t.nav.nanoExams, icon: ClipboardList },
    { to: '/student/progress', label: t.nav.progress, icon: TrendingUp },
    { to: '/student/profile', label: t.nav.myProfile, icon: UserCircle },
  ];

  return (
    <div className="min-h-screen bg-[#F8F7F4] dark:bg-[#0B0F19] text-slate-900 dark:text-slate-100 pb-20 lg:pb-0">
      {/* Top Header with Teacher Branding */}
      <header className="sticky top-0 z-30 h-16 border-b border-slate-200/80 dark:border-slate-800 glass-surface px-4 sm:px-8 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <BrandLogo
            logoUrl={activeTeacher?.logoUrl}
            brandName={brandName}
            accentColor={accentColor}
          />
          <span className="font-bold text-slate-900 dark:text-slate-100 truncate">
            {brandName}
          </span>
        </div>

        {/* Desktop Nav Links */}
        <nav className="hidden lg:flex items-center gap-1 overflow-x-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `px-3 py-2 rounded-xl text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
                  isActive
                    ? 'text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800/70'
                }`
              }
              style={({ isActive }) => (isActive ? { backgroundColor: accentColor } : undefined)}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-2 shrink-0">
          {linkedTeachers.length > 1 && (
            <select
              value={activeTeacher?.uid || ''}
              onChange={(e) => setActiveTeacherId(e.target.value)}
              aria-label="Select tutor"
              className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-slate-800 dark:text-slate-200 max-w-[140px]"
            >
              {linkedTeachers.map((lt) => (
                <option key={lt.uid} value={lt.uid}>
                  {lt.brandName}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={toggleLang}
            className="inline-flex items-center gap-1.5 px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-300"
          >
            <Globe className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t.common.language}</span>
          </button>
          <button
            type="button"
            onClick={toggleTheme}
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300"
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={signOut}
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-rose-600 dark:text-rose-400"
            aria-label={t.common.signOut}
            title={t.common.signOut}
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Secondary quick strip on tablet/mobile for Attendance & Offline Results */}
      <div className="lg:hidden border-b border-slate-200/70 dark:border-slate-800 bg-white/60 dark:bg-slate-900/60 px-4 py-2 flex items-center gap-2 overflow-x-auto">
        <NavLink
          to="/student/attendance"
          className={({ isActive }) =>
            `px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap ${
              isActive
                ? 'bg-indigo-600 text-white'
                : 'text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800'
            }`
          }
        >
          {t.nav.attendance}
        </NavLink>
        <NavLink
          to="/student/offline-results"
          className={({ isActive }) =>
            `px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap ${
              isActive
                ? 'bg-indigo-600 text-white'
                : 'text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800'
            }`
          }
        >
          {t.nav.offlineResults}
        </NavLink>
      </div>

      <main className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
        <Outlet />
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 h-16 border-t border-slate-200 dark:border-slate-800 glass-surface grid grid-cols-5 items-center px-1">
        {mobileBottomItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center gap-1 py-1.5 rounded-xl text-[11px] font-medium transition-colors min-h-[44px] ${
                  isActive
                    ? 'text-indigo-600 dark:text-indigo-400'
                    : 'text-slate-500 dark:text-slate-400'
                }`
              }
            >
              <Icon className="w-4 h-4" />
              <span className="truncate max-w-[64px]">{item.label}</span>
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}
