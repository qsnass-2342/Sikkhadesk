import React, { useEffect, useState } from 'react';
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { Plus, ShieldCheck } from 'lucide-react';
import { db } from '../../lib/firebase';
import { useAuth } from '../auth/AuthContext';
import { useI18n } from '../../i18n/I18nContext';
import { normalizeImageUrl, validateImageLoads } from '../../lib/driveUtils';
import {
  BrandLogo,
  Button,
  SurfaceCard,
  inputClass,
  labelClass,
} from '../../components/ui/Primitives';
import { useToast } from '../../components/ui/Toast';

const ACCENT_PRESETS = ['#4F46E5', '#7C3AED', '#0284C7', '#059669', '#B45309', '#DC2626'];

export function ProfilePage() {
  const { teacherProfile, userProfile, refreshProfile } = useAuth();
  const { t } = useI18n();
  const { showToast } = useToast();

  const [name, setName] = useState(teacherProfile?.name || '');
  const [brandName, setBrandName] = useState(teacherProfile?.brandName || '');
  const [logoUrl, setLogoUrl] = useState(teacherProfile?.logoUrl || '');
  const [themeColor, setThemeColor] = useState(teacherProfile?.themeColor || '#4F46E5');
  const [phone, setPhone] = useState(teacherProfile?.phone || '');
  const [saving, setSaving] = useState(false);

  // Whitelist management for future SaaS scaling
  const [whitelistEmails, setWhitelistEmails] = useState<string[]>([]);
  const [newEmail, setNewEmail] = useState('');

  useEffect(() => {
    if (teacherProfile) {
      setName(teacherProfile.name);
      setBrandName(teacherProfile.brandName);
      setLogoUrl(teacherProfile.logoUrl);
      setThemeColor(teacherProfile.themeColor || '#4F46E5');
      setPhone(teacherProfile.phone || '');
    }
  }, [teacherProfile]);

  useEffect(() => {
    if (!db) return;
    getDoc(doc(db, 'config', 'teacherWhitelist')).then((snap) => {
      if (snap.exists()) {
        setWhitelistEmails(snap.data()?.emails || []);
      }
    });
  }, []);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!db || !userProfile?.uid) return;
    setSaving(true);
    try {
      const normalizedLogo = logoUrl.trim() ? normalizeImageUrl(logoUrl.trim()) : '';
      if (normalizedLogo) {
        const ok = await validateImageLoads(normalizedLogo, 5000);
        if (!ok) {
          showToast('Logo URL could not load as an image, saved anyway', 'info');
        }
      }

      await setDoc(
        doc(db, 'teachers', userProfile.uid),
        {
          uid: userProfile.uid,
          name: name.trim(),
          brandName: brandName.trim(),
          logoUrl: normalizedLogo,
          themeColor,
          phone: phone.trim(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      await refreshProfile();
      showToast('Tutor branding updated', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleAddWhitelist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!db || !newEmail.trim()) return;
    const email = newEmail.trim().toLowerCase();
    if (whitelistEmails.map((x) => x.toLowerCase()).includes(email)) {
      showToast('Email is already whitelisted', 'info');
      return;
    }
    const next = [...whitelistEmails, email];
    try {
      await updateDoc(doc(db, 'config', 'teacherWhitelist'), {
        emails: next,
        updatedAt: serverTimestamp(),
      });
      setWhitelistEmails(next);
      setNewEmail('');
      showToast('Teacher email added to whitelist', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not update whitelist', 'error');
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
          {t.profile.title}
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          {t.profile.subtitle}
        </p>
      </div>

      <SurfaceCard className="p-6">
        <div className="flex items-center gap-4 pb-6 mb-6 border-b border-slate-100 dark:border-slate-800">
          <BrandLogo
            logoUrl={logoUrl}
            brandName={brandName || t.appName}
            accentColor={themeColor}
            size="lg"
          />
          <div>
            <p className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {brandName || t.appName}
            </p>
            <p className="text-xs text-slate-500">
              Student Dashboard Branding Preview · {themeColor}
            </p>
          </div>
        </div>

        <form onSubmit={handleSaveProfile} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>{t.profile.tutorName} *</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>{t.profile.brandName} *</label>
              <input
                type="text"
                required
                value={brandName}
                onChange={(e) => setBrandName(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>{t.profile.logoUrl}</label>
              <input
                type="url"
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                placeholder="https://..."
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>{t.profile.phone}</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>{t.profile.themeColor}</label>
            <div className="flex items-center gap-3 flex-wrap">
              {ACCENT_PRESETS.map((hex) => (
                <button
                  key={hex}
                  type="button"
                  onClick={() => setThemeColor(hex)}
                  className={`w-8 h-8 rounded-xl border-2 transition-transform ${
                    themeColor === hex
                      ? 'border-slate-900 dark:border-white scale-110'
                      : 'border-transparent'
                  }`}
                  style={{ backgroundColor: hex }}
                  aria-label={`Select color ${hex}`}
                />
              ))}
              <input
                type="color"
                value={themeColor}
                onChange={(e) => setThemeColor(e.target.value)}
                className="w-10 h-9 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer bg-transparent"
              />
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <Button type="submit" disabled={saving}>
              {saving ? t.common.loading : t.common.save}
            </Button>
          </div>
        </form>
      </SurfaceCard>

      {/* Teacher Whitelist Management */}
      <SurfaceCard className="p-6 space-y-4">
        <div className="flex items-center gap-2.5">
          <ShieldCheck className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Approved Teacher Whitelist
            </h3>
            <p className="text-xs text-slate-500">
              Only whitelisted Google emails can access Teacher Portal.
            </p>
          </div>
        </div>

        <ul className="divide-y divide-slate-100 dark:divide-slate-800 text-xs font-mono-num">
          {whitelistEmails.map((em) => (
            <li key={em} className="py-2 text-slate-700 dark:text-slate-300">
              {em}
            </li>
          ))}
        </ul>

        <form onSubmit={handleAddWhitelist} className="flex gap-2">
          <input
            type="email"
            required
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="colleague@gmail.com"
            className={inputClass}
          />
          <Button type="submit" variant="secondary">
            <Plus className="w-4 h-4" />
            <span>Add</span>
          </Button>
        </form>
      </SurfaceCard>
    </div>
  );
}
