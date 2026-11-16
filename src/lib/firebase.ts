import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getFunctions, type Functions } from 'firebase/functions';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY?.trim() || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN?.trim() || '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID?.trim() || '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET?.trim() || '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID?.trim() || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID?.trim() || '',
};

const REQUIRED_KEYS: Array<keyof typeof firebaseConfig> = [
  'apiKey',
  'authDomain',
  'projectId',
  'appId',
];

export const missingFirebaseVars: string[] = [
  ...(!firebaseConfig.apiKey ? ['VITE_FIREBASE_API_KEY'] : []),
  ...(!firebaseConfig.authDomain ? ['VITE_FIREBASE_AUTH_DOMAIN'] : []),
  ...(!firebaseConfig.projectId ? ['VITE_FIREBASE_PROJECT_ID'] : []),
  ...(!firebaseConfig.storageBucket ? ['VITE_FIREBASE_STORAGE_BUCKET'] : []),
  ...(!firebaseConfig.messagingSenderId ? ['VITE_FIREBASE_MESSAGING_SENDER_ID'] : []),
  ...(!firebaseConfig.appId ? ['VITE_FIREBASE_APP_ID'] : []),
];

export const isFirebaseConfigured: boolean = REQUIRED_KEYS.every(
  (key) => Boolean(firebaseConfig[key]) && !firebaseConfig[key].startsWith('YOUR_')
);

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let functions: Functions | null = null;

if (isFirebaseConfigured) {
  app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  const region = import.meta.env.VITE_FIREBASE_FUNCTIONS_REGION?.trim() || 'us-central1';
  functions = getFunctions(app, region);
}

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export { app, auth, db, functions };

export function isFunctionsUnavailableError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const code = (err as { code?: string }).code || '';
  const message = (err as { message?: string }).message || '';
  return (
    code.includes('not-found') ||
    code.includes('unavailable') ||
    code.includes('internal') ||
    message.toLowerCase().includes('failed to fetch') ||
    message.toLowerCase().includes('cors') ||
    message.toLowerCase().includes('not found')
  );
}
