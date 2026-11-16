import React, { useState } from 'react';
import { Navigate } from 'react-router-dom';
import {
  AlertCircle,
  CheckCircle2,
  Globe,
  KeyRound,
  Mail,
  Moon,
  ShieldCheck,
  Sun,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useAuth, type PortalIntent } from './AuthContext';
import { isFirebaseConfigured, missingFirebaseVars } from '../../lib/firebase';
import { useI18n } from '../../i18n/I18nContext';
import { useTheme } from '../../hooks/useTheme';
import { BrandLogo, Button, SurfaceCard, inputClass, labelClass } from '../../components/ui/Primitives';
import { useToast } from '../../components/ui/Toast';

export function LoginPage() {
  const {
    firebaseUser,
    userProfile,
    loading,
    authBlockState,
    authError,
    signInWithGoogle,
    sendStudentEmailLink,
    initializeFirstTeacher,
    refreshProfile,
    signOut,
  } = useAuth();
  const { t, toggleLang } = useI18n();
  const { theme, toggleTheme } = useTheme();
  const { showToast } = useToast();

  const [portalTab, setPortalTab] = useState<PortalIntent>('teacher');
  const [studentEmail, setStudentEmail] = useState('');
  const [emailSent, setEmailSent] = useState(false);
  const [busy, setBusy] = useState(false);

  // First-time teacher setup form
  const [setupName, setSetupName] = useState(firebaseUser?.displayName || '');
  const [setupBrand, setSetupBrand] = useState('');
  const [setupPhone, setSetupPhone] = useState('');

  if (!loading && userProfile?.role === 'teacher') {
    return <Navigate to="/teacher" replace />;
  }
  if (!loading && userProfile?.role === 'student') {
    const pendingToken = sessionStorage.getItem('pending_invite_token');
    if (pendingToken) {
      return <Navigate to={`/invite/${pendingToken}`} replace />;
    }
    return <Navigate to="/student" replace />;
  }

  const handleGoogleSignIn = async () => {
    setBusy(true);
    try {
      await signInWithGoogle(portalTab);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sign-in failed';
      showToast(msg, 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleEmailLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentEmail.trim()) return;
    setBusy(true);
    try {
      await sendStudentEmailLink(studentEmail.trim());
      setEmailSent(true);
      showToast(t.auth.emailLinkSent, 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not send email link';
      showToast(msg, 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleWhitelistSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await initializeFirstTeacher(
        setupBrand.trim() || `${setupName || 'Tutor'}'s Academy`,
        setupName.trim() || firebaseUser?.displayName || 'Tutor',
        setupPhone.trim()
      );
      showToast('Teacher workspace initialized', 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Setup failed';
      showToast(msg, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F7F4] dark:bg-[#0B0F19] text-slate-900 dark:text-slate-100 flex flex-col lg:flex-row">
      {/* Left Split Visual Column */}
      <div className="relative lg:w-1/2 min-h-[280px] lg:min-h-screen overflow-hidden bg-slate-900">
        <img
          src="/src/assets/images/login_study_desk_1794835646402.jpg"
          alt="Sunlit tutor study desk with mathematics notebook"
          referrerPolicy="no-referrer"
          className="absolute inset-0 w-full h-full object-cover opacity-85"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/45 to-slate-950/20" />

        <div className="relative z-10 h-full flex flex-col justify-between p-8 lg:p-14 text-white">
          <div className="flex items-center gap-3">
            <BrandLogo brandName={t.appName} size="md" />
            <span className="text-xl font-bold tracking-tight">{t.appName}</span>
          </div>

          <div className="max-w-lg mt-12 lg:mt-0">
            <h1 className="text-3xl lg:text-4xl font-bold tracking-tight leading-tight text-balance">
              {t.tagline}
            </h1>
            <p className="mt-4 text-sm lg:text-base text-slate-200/90 leading-relaxed">
              {t.auth.subtitle}
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-300">
              <span>Attendance Register</span>
              <span aria-hidden="true">·</span>
              <span>KaTeX Nano Exams</span>
              <span aria-hidden="true">·</span>
              <span>Offline Marks</span>
              <span aria-hidden="true">·</span>
              <span>WhatsApp Updates</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right Auth Column */}
      <div className="flex-1 flex flex-col justify-between p-6 sm:p-10 lg:p-16">
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={toggleLang}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-900 transition-colors"
          >
            <Globe className="w-3.5 h-3.5" />
            <span>{t.common.language}</span>
          </button>
          <button
            type="button"
            onClick={toggleTheme}
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-900 transition-colors"
            aria-label={theme === 'dark' ? t.common.lightMode : t.common.darkMode}
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="w-full max-w-md mx-auto my-auto py-8"
        >
          {!isFirebaseConfigured ? (
            <SurfaceCard className="p-6 sm:p-8">
              <div className="w-11 h-11 rounded-2xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center mb-4">
                <KeyRound className="w-5 h-5" />
              </div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                {t.auth.firebaseNotConfiguredTitle}
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-2 leading-relaxed">
                {t.auth.firebaseNotConfiguredDesc}
              </p>
              <div className="mt-5 rounded-xl bg-slate-900 text-slate-100 p-4 text-xs font-mono-num space-y-1.5 overflow-x-auto">
                {missingFirebaseVars.map((envKey) => (
                  <div key={envKey} className="flex items-center gap-2">
                    <span className="text-amber-400">MISSING</span>
                    <span>{envKey}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-4">
                Copy <code className="font-mono-num">.env.example</code> to{' '}
                <code className="font-mono-num">.env</code>, add your Firebase project credentials,
                and deploy <code className="font-mono-num">firestore.rules</code>.
              </p>
            </SurfaceCard>
          ) : authBlockState === 'needs-whitelist-setup' && firebaseUser ? (
            <SurfaceCard className="p-6 sm:p-8">
              <div className="w-11 h-11 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-4">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <h2 className="text-xl font-bold">{t.auth.whitelistSetupTitle}</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1.5">
                {t.auth.whitelistSetupDesc}
              </p>
              <p className="mt-3 text-xs font-mono-num text-indigo-600 dark:text-indigo-400">
                {firebaseUser.email}
              </p>

              <form onSubmit={handleWhitelistSetup} className="mt-5 space-y-4">
                <div>
                  <label className={labelClass}>{t.profile.tutorName}</label>
                  <input
                    type="text"
                    required
                    value={setupName}
                    onChange={(e) => setSetupName(e.target.value)}
                    placeholder="e.g. Tariq Rahman"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>{t.profile.brandName}</label>
                  <input
                    type="text"
                    required
                    value={setupBrand}
                    onChange={(e) => setSetupBrand(e.target.value)}
                    placeholder="e.g. Rahman Math & Physics Studio"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>{t.profile.phone}</label>
                  <input
                    type="tel"
                    value={setupPhone}
                    onChange={(e) => setSetupPhone(e.target.value)}
                    placeholder="+8801XXXXXXXXX"
                    className={inputClass}
                  />
                </div>
                <div className="flex items-center gap-3 pt-2">
                  <Button type="submit" disabled={busy} className="flex-1">
                    {busy ? t.common.loading : t.auth.seedWhitelistBtn}
                  </Button>
                  <Button type="button" variant="ghost" onClick={signOut}>
                    {t.common.signOut}
                  </Button>
                </div>
              </form>
            </SurfaceCard>
          ) : authBlockState === 'not-whitelisted' && firebaseUser ? (
            <SurfaceCard className="p-6 sm:p-8">
              <div className="w-11 h-11 rounded-2xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center mb-4">
                <AlertCircle className="w-5 h-5" />
              </div>
              <h2 className="text-xl font-bold">{t.auth.notWhitelistedTitle}</h2>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-2">
                {t.auth.notWhitelistedDesc}
              </p>
              <p className="mt-3 text-xs font-mono-num text-slate-500">
                Signed in as: {firebaseUser.email}
              </p>
              <div className="mt-6 flex gap-3">
                <Button variant="secondary" onClick={signOut} className="w-full">
                  {t.common.signOut}
                </Button>
              </div>
            </SurfaceCard>
          ) : authError && firebaseUser ? (
            <SurfaceCard className="p-6 sm:p-8">
              <div className="w-11 h-11 rounded-2xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center mb-4">
                <AlertCircle className="w-5 h-5" />
              </div>
              <h2 className="text-xl font-bold">Firestore Access Error</h2>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-2 break-words">
                {authError}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-3">
                Make sure <code className="font-mono-num">firestore.rules</code> is deployed to your Firebase project.
              </p>
              <div className="mt-6 flex gap-3">
                <Button onClick={() => refreshProfile()} className="flex-1">
                  Retry
                </Button>
                <Button variant="secondary" onClick={signOut}>
                  {t.common.signOut}
                </Button>
              </div>
            </SurfaceCard>
          ) : (
            <div>
              <h2 className="text-2xl font-bold tracking-tight">{t.auth.welcomeBack}</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1.5">
                {portalTab === 'teacher' ? t.auth.teacherNote : t.auth.studentNote}
              </p>

              {/* Segmented Portal Switch */}
              <div className="mt-6 grid grid-cols-2 p-1 rounded-xl bg-slate-200/70 dark:bg-slate-800/80">
                <button
                  type="button"
                  onClick={() => {
                    setPortalTab('teacher');
                    setEmailSent(false);
                  }}
                  className={`py-2.5 text-sm font-medium rounded-lg transition-all whitespace-nowrap ${
                    portalTab === 'teacher'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {t.auth.teacherTab}
                </button>
                <button
                  type="button"
                  onClick={() => setPortalTab('student')}
                  className={`py-2.5 text-sm font-medium rounded-lg transition-all whitespace-nowrap ${
                    portalTab === 'student'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {t.auth.studentTab}
                </button>
              </div>

              <SurfaceCard className="mt-6 p-6">
                <Button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={busy || loading}
                  size="lg"
                  className="w-full"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      fill="currentColor"
                      d="M21.35 11.1h-9.17v2.73h6.51c-.33 3.81-3.5 5.44-6.5 5.44C8.36 19.27 5 16.25 5 12c0-4.1 3.2-7.27 7.2-7.27c3.09 0 4.9 1.97 4.9 1.97L19 4.72S16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12c0 5.05 4.13 10 10.22 10c5.35 0 9.25-3.67 9.25-9.09c0-1.15-.15-1.81-.15-1.81Z"
                    />
                  </svg>
                  <span>{t.auth.continueGoogle}</span>
                </Button>

                {portalTab === 'student' && (
                  <div className="mt-6 pt-6 border-t border-slate-100 dark:border-slate-800">
                    <p className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-3">
                      {t.auth.emailLinkTitle}
                    </p>
                    {emailSent ? (
                      <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 p-4 flex items-start gap-3">
                        <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                        <p className="text-xs text-emerald-900 dark:text-emerald-200 leading-relaxed">
                          {t.auth.emailLinkSent}
                        </p>
                      </div>
                    ) : (
                      <form onSubmit={handleEmailLink} className="space-y-3">
                        <div className="relative">
                          <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                          <input
                            type="email"
                            required
                            value={studentEmail}
                            onChange={(e) => setStudentEmail(e.target.value)}
                            placeholder={t.auth.emailPlaceholder}
                            className={`${inputClass} pl-10`}
                          />
                        </div>
                        <Button type="submit" variant="secondary" disabled={busy} className="w-full">
                          {t.auth.sendEmailLink}
                        </Button>
                      </form>
                    )}
                  </div>
                )}
              </SurfaceCard>
            </div>
          )}
        </motion.div>

        <p className="text-center text-xs text-slate-400 dark:text-slate-500">
          {t.appName} · Multi-Tenant Tutor Platform
        </p>
      </div>
    </div>
  );
}
