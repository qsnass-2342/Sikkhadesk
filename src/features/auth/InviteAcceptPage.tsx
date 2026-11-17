import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { doc, runTransaction, serverTimestamp, type Timestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { CheckCircle2, Link2, Mail } from 'lucide-react';
import { useAuth } from './AuthContext';
import { db, functions, isFirebaseConfigured, isFunctionsUnavailableError } from '../../lib/firebase';
import {
  BrandLogo,
  Button,
  SurfaceCard,
  inputClass,
} from '../../components/ui/Primitives';
import { useToast } from '../../components/ui/Toast';

export function InviteAcceptPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const {
    firebaseUser,
    userProfile,
    loading,
    signInWithGoogle,
    sendStudentEmailLink,
    refreshProfile,
  } = useAuth();
  const { showToast } = useToast();

  const [email, setEmail] = useState('');
  const [emailSent, setEmailSent] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (token) {
      sessionStorage.setItem('pending_invite_token', token);
    }
  }, [token]);

  useEffect(() => {
    const runAccept = async () => {
      if (!token || !firebaseUser || !db || accepted || accepting) return;
      if (userProfile?.role === 'teacher') {
        setErrorMsg('You are signed in as a teacher. Sign out to accept a student invitation.');
        return;
      }

      setAccepting(true);
      setErrorMsg(null);
      try {
        let usedFallback = false;
        if (functions) {
          try {
            const acceptFn = httpsCallable<{ token: string }, { teacherId: string; studentId: string }>(
              functions,
              'acceptStudentInvitation'
            );
            await acceptFn({ token });
          } catch (fnErr) {
            if (!isFunctionsUnavailableError(fnErr)) {
              throw fnErr;
            }
            usedFallback = true;
          }
        } else {
          usedFallback = true;
        }

        if (usedFallback) {
          await runTransaction(db, async (tx) => {
            const inviteRef = doc(db!, 'invitations', token);
            const inviteSnap = await tx.get(inviteRef);
            if (!inviteSnap.exists()) {
              throw new Error('Invalid invitation link.');
            }
            const invite = inviteSnap.data();
            if (invite.usedAt) {
              throw new Error('This invitation link has already been used.');
            }
            const expiresAt = invite.expiresAt as Timestamp | undefined;
            if (expiresAt?.toMillis && expiresAt.toMillis() < Date.now()) {
              throw new Error('This invitation link has expired.');
            }

            const userRef = doc(db!, 'users', firebaseUser.uid);
            const userSnap = await tx.get(userRef);
            if (userSnap.exists() && userSnap.data()?.role === 'teacher') {
              throw new Error('Teacher accounts cannot accept student invitations.');
            }

            const studentRef = doc(db!, 'students', invite.studentId);
            const studentSnap = await tx.get(studentRef);
            if (!studentSnap.exists()) {
              throw new Error('Student record no longer exists.');
            }

            const relRef = doc(db!, 'relationships', invite.relationshipId);
            const relSnap = await tx.get(relRef);
            if (!relSnap.exists()) {
              throw new Error('Relationship record not found.');
            }

            const existingStudentIds: string[] = userSnap.exists()
              ? userSnap.data()?.studentIds || []
              : [];
            const existingTeacherIds: string[] = userSnap.exists()
              ? userSnap.data()?.teacherIds || []
              : [];

            const nextStudentIds = Array.from(new Set([...existingStudentIds, invite.studentId]));
            const nextTeacherIds = Array.from(new Set([...existingTeacherIds, invite.teacherId]));

            tx.update(userRef, {
              studentIds: nextStudentIds,
              teacherIds: nextTeacherIds,
              lastInviteToken: token,
              updatedAt: serverTimestamp(),
            });

            tx.update(studentRef, {
              uid: firebaseUser.uid,
              lastInviteToken: token,
              updatedAt: serverTimestamp(),
            });

            tx.update(relRef, {
              status: 'active',
              studentUid: firebaseUser.uid,
              lastInviteToken: token,
              updatedAt: serverTimestamp(),
            });

            tx.update(inviteRef, {
              usedAt: serverTimestamp(),
              acceptedByUid: firebaseUser.uid,
            });
          });
        }

        sessionStorage.removeItem('pending_invite_token');
        await refreshProfile();
        setAccepted(true);
        showToast('Enrolled successfully!', 'success');
        window.setTimeout(() => navigate('/student', { replace: true }), 1100);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unable to accept invitation.';
        setErrorMsg(msg);
      } finally {
        setAccepting(false);
      }
    };

    if (!loading && firebaseUser && userProfile) {
      runAccept();
    }
  }, [token, firebaseUser, userProfile, loading, accepted, accepting, refreshProfile, navigate, showToast]);

  const handleGoogle = async () => {
    try {
      await signInWithGoogle('student');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Sign-in failed', 'error');
    }
  };

  const handleEmailLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    try {
      await sendStudentEmailLink(email.trim());
      setEmailSent(true);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not send link', 'error');
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F7F4] dark:bg-[#0B0F19] flex items-center justify-center p-4">
      <SurfaceCard className="w-full max-w-md p-6 sm:p-8">
        <div className="flex items-center gap-3 mb-6">
          <BrandLogo brandName="ShikkhaDesk" />
          <div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              Student Invitation
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Link your student account with your tutor
            </p>
          </div>
        </div>

        {!isFirebaseConfigured ? (
          <p className="text-sm text-amber-600">
            Firebase environment variables are not configured yet.
          </p>
        ) : accepted ? (
          <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 p-4 flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <p className="text-sm text-emerald-900 dark:text-emerald-200">
              Invitation accepted. Opening your student dashboard...
            </p>
          </div>
        ) : accepting ? (
          <div className="py-6 text-center text-sm text-slate-600 dark:text-slate-300">
            Verifying your invitation token...
          </div>
        ) : errorMsg ? (
          <div className="space-y-4">
            <div className="rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 p-4 text-sm text-rose-800 dark:text-rose-200">
              {errorMsg}
            </div>
            <Button variant="secondary" onClick={() => navigate('/login')} className="w-full">
              Go to Login
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900 p-4 flex items-start gap-3">
              <Link2 className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
              <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                Sign in with Google or an email link to connect this single-use invitation to your
                student account.
              </p>
            </div>

            <Button onClick={handleGoogle} className="w-full" size="lg">
              Continue with Google
            </Button>

            <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
              {emailSent ? (
                <p className="text-xs text-emerald-700 dark:text-emerald-300">
                  Check your inbox and open the sign-in link on this browser.
                </p>
              ) : (
                <form onSubmit={handleEmailLink} className="space-y-2.5">
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="student@example.com"
                      className={`${inputClass} pl-10`}
                    />
                  </div>
                  <Button type="submit" variant="secondary" className="w-full">
                    Send Email Sign-In Link
                  </Button>
                </form>
              )}
            </div>
          </div>
        )}
      </SurfaceCard>
    </div>
  );
}
