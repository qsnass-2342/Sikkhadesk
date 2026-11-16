import React, { createContext, useContext, useState } from 'react';
import { translations, type Language } from './translations';

interface I18nContextValue {
  lang: Language;
  setLang: (lang: Language) => void;
  toggleLang: () => void;
  t: (typeof translations)['en'] | (typeof translations)['bn'];
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Language>(() => {
    const saved = localStorage.getItem('shikkha_lang');
    return saved === 'bn' ? 'bn' : 'en';
  });

  const setLang = (next: Language) => {
    setLangState(next);
    localStorage.setItem('shikkha_lang', next);
  };

  const toggleLang = () => setLang(lang === 'en' ? 'bn' : 'en');

  return (
    <I18nContext.Provider value={{ lang, setLang, toggleLang, t: translations[lang] }}>
      <div className={lang === 'bn' ? 'font-bangla' : ''}>{children}</div>
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
