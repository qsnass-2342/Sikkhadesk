import { I18nProvider } from './i18n/I18nContext';
import { ToastProvider } from './components/ui/Toast';
import { AuthProvider } from './features/auth/AuthContext';
import { AppRouter } from './routes/AppRouter';

export default function App() {
  return (
    <I18nProvider>
      <ToastProvider>
        <AuthProvider>
          <AppRouter />
        </AuthProvider>
      </ToastProvider>
    </I18nProvider>
  );
}
