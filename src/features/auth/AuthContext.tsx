import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  isSignInWithEmailLink,
  onAuthStateChanged,
  sendSignInLinkToEmail,
  signInWithEmailLink,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import {
  auth,
  db,
  functions,
  googleProvider,
  isFirebaseConfigured,
} from '../../lib/firebase';
import type { Relationship, StudentProfile, TeacherProfile, UserProfile } from '../../types';

export type PortalIntent = 'teacher' | 'student';

interface AuthContextValue {
  firebaseUser: User | null;
  userProfile: UserProfile | null;
  teacherProfile: TeacherProfile | null;
  studentProfiles: StudentProfile[];
  studentRelationships: Relationship[];
  linkedTeachers: TeacherProfile[];
  activeTeacherId: string | null;
  setActiveTeacherId: (id: string) => void;
  loading: boolean;
  whitelistExists: boolean;
  isWhitelistedTeacherEmail: boolean;
  authBlockState: 'none' | 'needs-whitelist-setup' | 'not-whitelisted';
  signInWithGoogle: (intent: PortalIntent) => Promise<void>;
  sendStudentEmailLink: (email: string) => Promise<void>;
  initializeFirstTeacher: (brandName: string, name: string, phone: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const INTENT_KEY = 'shikkha_auth_intent';
const EMAIL_LINK_KEY = 'shikkha_email_for_signin';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [teacherProfile, setTeacherProfile] = useState<TeacherProfile | null>(null);
  const [studentProfiles, setStudentProfiles] = useState<StudentProfile[]>([]);
  const [studentRelationships, setStudentRelationships] = useState<Relationship[]>([]);
  const [linkedTeachers, setLinkedTeachers] = useState<TeacherProfile[]>([]);
  const [activeTeacherId, setActiveTeacherId] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(isFirebaseConfigured);
  const [whitelistExists, setWhitelistExists] = useState<boolean>(false);
  const [isWhitelistedTeacherEmail, setIsWhitelistedTeacherEmail] = useState<boolean>(false);
  const [authBlockState, setAuthBlockState] = useState<
    'none' | 'needs-whitelist-setup' | 'not-whitelisted'
  >('none');

  const loadUserAndRoleData = useCallback(async (user: User) => {
    if (!db) return;
    setLoading(true);
    try {
      const userRef = doc(db, 'users', user.uid);
      const whitelistRef = doc(db, 'config', 'teacherWhitelist');

      const [userSnap, whitelistSnap] = await Promise.all([
        getDoc(userRef),
        getDoc(whitelistRef),
      ]);

      const wlExists = whitelistSnap.exists();
      const wlEmails: string[] = wlExists ? whitelistSnap.data()?.emails || [] : [];
      const email = user.email || '';
      const isWhitelisted = wlEmails.map((e) => e.toLowerCase()).includes(email.toLowerCase());

      setWhitelistExists(wlExists);
      setIsWhitelistedTeacherEmail(isWhitelisted);

      if (userSnap.exists()) {
        const profile = { uid: user.uid, ...userSnap.data() } as UserProfile;
        setUserProfile(profile);
        setAuthBlockState('none');

        if (profile.role === 'teacher') {
          const tRef = doc(db, 'teachers', user.uid);
          const tSnap = await getDoc(tRef);
          if (tSnap.exists()) {
            setTeacherProfile({ uid: user.uid, ...tSnap.data() } as TeacherProfile);
          } else {
            const defaultTeacher: TeacherProfile = {
              uid: user.uid,
              name: profile.displayName || 'Tutor',
              brandName: `${profile.displayName || 'Tutor'}'s Academy`,
              logoUrl: '',
              themeColor: '#4F46E5',
              phone: '',
            };
            await setDoc(tRef, {
              ...defaultTeacher,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
            setTeacherProfile(defaultTeacher);
          }
        } else if (profile.role === 'student') {
          const studentIds = profile.studentIds || [];
          const teacherIds = profile.teacherIds || [];

          if (studentIds.length > 0) {
            const sSnaps = await Promise.all(
              studentIds.map((sid) => getDoc(doc(db!, 'students', sid)))
            );
            setStudentProfiles(
              sSnaps.filter((s) => s.exists()).map((s) => ({ id: s.id, ...s.data() } as StudentProfile))
            );

            const rels: Relationship[] = [];
            for (const sid of studentIds) {
              const rSnap = await getDocs(
                query(collection(db, 'relationships'), where('studentId', '==', sid))
              );
              rSnap.docs.forEach((d) => rels.push({ id: d.id, ...d.data() } as Relationship));
            }
            setStudentRelationships(rels);
          } else {
            setStudentProfiles([]);
            setStudentRelationships([]);
          }

          if (teacherIds.length > 0) {
            const tSnaps = await Promise.all(
              teacherIds.map((tid) => getDoc(doc(db!, 'teachers', tid)))
            );
            const teachers = tSnaps
              .filter((t) => t.exists())
              .map((t) => ({ uid: t.id, ...t.data() } as TeacherProfile));
            setLinkedTeachers(teachers);
            if (teachers.length > 0) {
              setActiveTeacherId((prev) =>
                prev && teachers.some((t) => t.uid === prev) ? prev : teachers[0].uid
              );
            }
          } else {
            setLinkedTeachers([]);
            setActiveTeacherId(null);
          }
        }
        return;
      }

      // First-time user without users/{uid} doc
      const intent = (sessionStorage.getItem(INTENT_KEY) as PortalIntent) || 'student';

      if (intent === 'teacher') {
        if (!wlExists) {
          setUserProfile(null);
          setAuthBlockState('needs-whitelist-setup');
          return;
        }
        if (!isWhitelisted) {
          setUserProfile(null);
          setAuthBlockState('not-whitelisted');
          return;
        }

        // Whitelisted teacher logging in for the first time
        const newProfile: UserProfile = {
          uid: user.uid,
          role: 'teacher',
          displayName: user.displayName || 'Tutor',
          email: user.email || '',
          photoURL: user.photoURL || '',
        };
        await setDoc(userRef, {
          ...newProfile,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        const newTeacher: TeacherProfile = {
          uid: user.uid,
          name: user.displayName || 'Tutor',
          brandName: `${user.displayName || 'Tutor'}'s Academy`,
          logoUrl: '',
          themeColor: '#4F46E5',
          phone: '',
        };
        await setDoc(doc(db, 'teachers', user.uid), {
          ...newTeacher,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        setUserProfile(newProfile);
        setTeacherProfile(newTeacher);
        setAuthBlockState('none');
      } else {
        // Student first login -> create global student user doc
        const newStudentUser: UserProfile = {
          uid: user.uid,
          role: 'student',
          displayName: user.displayName || 'Student',
          email: user.email || '',
          photoURL: user.photoURL || '',
          studentIds: [],
          teacherIds: [],
        };
        await setDoc(userRef, {
          ...newStudentUser,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        setUserProfile(newStudentUser);
        setAuthBlockState('none');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isFirebaseConfigured || !auth) {
      setLoading(false);
      return;
    }

    // Complete passwordless email link sign-in if returning from email link
    if (isSignInWithEmailLink(auth, window.location.href)) {
      let email = window.localStorage.getItem(EMAIL_LINK_KEY);
      if (!email) {
        email = window.prompt('Confirm your email address to complete sign-in:') || '';
      }
      if (email) {
        sessionStorage.setItem(INTENT_KEY, 'student');
        signInWithEmailLink(auth, email, window.location.href)
          .then(() => {
            window.localStorage.removeItem(EMAIL_LINK_KEY);
            // Clean URL query params
            const cleanUrl = window.location.origin + window.location.pathname;
            window.history.replaceState({}, document.title, cleanUrl);
          })
          .catch((err) => {
            console.error('Email link sign-in error:', err);
          });
      }
    }

    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (user) {
        await loadUserAndRoleData(user);
      } else {
        setUserProfile(null);
        setTeacherProfile(null);
        setStudentProfiles([]);
        setStudentRelationships([]);
        setLinkedTeachers([]);
        setActiveTeacherId(null);
        setAuthBlockState('none');
        setLoading(false);
      }
    });

    return () => unsub();
  }, [loadUserAndRoleData]);

  const signInWithGoogle = async (intent: PortalIntent) => {
    if (!auth) throw new Error('Firebase is not configured');
    sessionStorage.setItem(INTENT_KEY, intent);
    const cred = await signInWithPopup(auth, googleProvider);
    await loadUserAndRoleData(cred.user);
  };

  const sendStudentEmailLink = async (email: string) => {
    if (!auth) throw new Error('Firebase is not configured');
    sessionStorage.setItem(INTENT_KEY, 'student');
    const pendingToken = sessionStorage.getItem('pending_invite_token');
    const redirectUrl = pendingToken
      ? `${window.location.origin}/invite/${pendingToken}`
      : `${window.location.origin}/login`;

    await sendSignInLinkToEmail(auth, email, {
      url: redirectUrl,
      handleCodeInApp: true,
    });
    window.localStorage.setItem(EMAIL_LINK_KEY, email);
  };

  const initializeFirstTeacher = async (brandName: string, name: string, phone: string) => {
    if (!db || !firebaseUser || !firebaseUser.email) return;
    setLoading(true);
    try {
      await setDoc(doc(db, 'config', 'teacherWhitelist'), {
        emails: [firebaseUser.email],
        updatedAt: serverTimestamp(),
      });

      const userRef = doc(db, 'users', firebaseUser.uid);
      await setDoc(userRef, {
        role: 'teacher',
        displayName: name || firebaseUser.displayName || 'Tutor',
        email: firebaseUser.email,
        photoURL: firebaseUser.photoURL || '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await setDoc(doc(db, 'teachers', firebaseUser.uid), {
        uid: firebaseUser.uid,
        name: name || firebaseUser.displayName || 'Tutor',
        brandName: brandName || `${name || 'Tutor'}'s Academy`,
        logoUrl: '',
        themeColor: '#4F46E5',
        phone: phone || '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await loadUserAndRoleData(firebaseUser);
    } finally {
      setLoading(false);
    }
  };

  const refreshProfile = async () => {
    if (firebaseUser) {
      await loadUserAndRoleData(firebaseUser);
    }
  };

  const signOut = async () => {
    if (!auth) return;
    await firebaseSignOut(auth);
    sessionStorage.removeItem(INTENT_KEY);
  };

  // Expose helper if needed for invite linking
  void httpsCallable;
  void functions;

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        userProfile,
        teacherProfile,
        studentProfiles,
        studentRelationships,
        linkedTeachers,
        activeTeacherId,
        setActiveTeacherId,
        loading,
        whitelistExists,
        isWhitelistedTeacherEmail,
        authBlockState,
        signInWithGoogle,
        sendStudentEmailLink,
        initializeFirstTeacher,
        refreshProfile,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
