import React, { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  BookOpen,
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FileSpreadsheet,
  Globe,
  LayoutDashboard,
  Library,
  LogOut,
  Menu,
  MessageSquare,
  Moon,
  Sun,
  UserCircle,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../features/auth/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import { useTheme } from '../hooks/useTheme';
import { BrandLogo } from '../components/ui/Primitives';

export function TeacherLayout() {
  const { teacherProfile, userProfile, signOut } = useAuth();
  const { t, toggleLang } = useI18n();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();

  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const navItems = [
    { to: '/teacher', end: true, label: t.nav.overview, icon: LayoutDashboard },
    { to: '/teacher/students', label: t.nav.students, icon: Users },
    { to: '/teacher/materials', label: t.nav.materials, icon: BookOpen },
    { to: '/teacher/attendance', label: t.nav.attendance, icon: CalendarCheck },
    { to: '/teacher/offline-exams', label: t.nav.offlineExams, icon: FileSpreadsheet },
    { to: '/teacher/nano-library', label: t.nav.nanoLibrary, icon: Library },
    { to: '/teacher/nano-exams', label: t.nav.nanoExams, icon: ClipboardList },
    { to: '/teacher/messages', label: t.nav.messages, icon: MessageSquare },
    { to: '/teacher/profile', label: t.nav.profile, icon: UserCircle },
  ];

  const activeItem = navItems.find((item) =>
    item.end ? location.pathname === item.to : location.pathname.startsWith(item.to)
  );

  const brandName = teacherProfile?.brandName || t.appName;
  const accent = teacherProfile?.themeColor || '#4F46E5';

  const SidebarContent = ({ isMobile = false }: { isMobile?: boolean }) => (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between gap-3 px-4 h-16 border-b border-slate-200/80 dark:border-slate-800 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <BrandLogo logoUrl={teacherProfile?.logoUrl} brandName={brandName} accentColor={accent} />
          {(!collapsed || isMobile) && (
            <span className="font-bold text-slate-900 dark:text-slate-100 truncate">
              {brandName}
            </span>
          )}
        </div>
        {!isMobile && (
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        )}
        {isMobile && (
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="p-1.5 rounded-lg text-slate-500"
            aria-label="Close navigation"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => isMobile && setMobileOpen(false)}
              title={collapsed && !isMobile ? item.label : undefined}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-xs dark:bg-indigo-500'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/80 hover:text-slate-900 dark:hover:text-slate-100'
                } ${collapsed && !isMobile ? 'justify-center px-2' : ''}`
              }
            >
              <Icon className="w-4 h-4 shrink-0" />
              {(!collapsed || isMobile) && <span className="truncate">{item.label}</span>}
            </NavLink>
          );
        })}
      </nav>

      <div className="p-3 border-t border-slate-200/80 dark:border-slate-800 shrink-0">
        {(!collapsed || isMobile) && (
          <div className="px-3 py-2 mb-1">
            <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
              {teacherProfile?.name || userProfile?.displayName}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
              {userProfile?.email}
            </p>
          </div>
        )}
        <button
          type="button"
          onClick={signOut}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors ${
            collapsed && !isMobile ? 'justify-center px-2' : ''
          }`}
        >
          <LogOut className="w-4 h-4 shrink-0" />
          {(!collapsed || isMobile) && <span>{t.common.signOut}</span>}
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F8F7F4] dark:bg-[#0B0F19] text-slate-900 dark:text-slate-100 flex">
      {/* Desktop Sidebar */}
      <aside
        className={`hidden lg:flex flex-col border-r border-slate-200/80 dark:border-slate-800 bg-white/85 dark:bg-slate-900/90 backdrop-blur-md sticky top-0 h-screen transition-all duration-200 shrink-0 ${
          collapsed ? 'w-[76px]' : 'w-[252px]'
        }`}
      >
        <SidebarContent />
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            onClick={() => setMobileOpen(false)}
            className="fixed inset-0 bg-slate-950/45 backdrop-blur-xs"
          />
          <aside className="relative z-10 w-72 max-w-[82vw] bg-white dark:bg-slate-900 h-full border-r border-slate-200 dark:border-slate-800">
            <SidebarContent isMobile />
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-30 h-16 border-b border-slate-200/80 dark:border-slate-800 glass-surface px-4 sm:px-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="lg:hidden p-2 -ml-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <h1 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-slate-100 truncate">
              {activeItem?.label || t.nav.overview}
            </h1>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={toggleLang}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
            >
              <Globe className="w-3.5 h-3.5" />
              <span>{t.common.language}</span>
            </button>
            <button
              type="button"
              onClick={toggleTheme}
              className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              aria-label={theme === 'dark' ? t.common.lightMode : t.common.darkMode}
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
