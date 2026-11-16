import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  CheckCircle2,
  ClipboardList,
  Clock,
  XCircle,
} from 'lucide-react';
import { functions, isFunctionsUnavailableError } from '../../lib/firebase';
import { useI18n } from '../../i18n/I18nContext';
import { useStudentPortalData } from './useStudentPortalData';
import type { NanoAttemptBreakdown, SanitizedQuestion } from '../../types';
import {
  Button,
  EmptyState,
  FunctionsUnavailableBanner,
  SkeletonRows,
  SurfaceCard,
  inputClass,
} from '../../components/ui/Primitives';
import { MathText } from '../../components/ui/MathText';
import { useToast } from '../../components/ui/Toast';
import { formatDate } from '../../lib/formatters';

interface ActiveAttemptState {
  examId: string;
  studentId: string;
  title: string;
  subject: string;
  durationMinutes: number;
  startedAtMillis: number;
  questions: SanitizedQuestion[];
}

interface SubmissionResultState {
  attemptId: string;
  score: number;
  total: number;
  percentage: number;
  breakdown: NanoAttemptBreakdown[];
}

export function StudentNanoExamsPage() {
  const { t, lang } = useI18n();
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const { studentId, nanoExams, nanoAttempts, loading, reload } = useStudentPortalData();

  const [starting, setStarting] = useState(false);
  const [fnUnavailable, setFnUnavailable] = useState(false);
  const [activeAttempt, setActiveAttempt] = useState<ActiveAttemptState | null>(null);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submissionResult, setSubmissionResult] = useState<SubmissionResultState | null>(null);

  const startExamById = async (examId: string) => {
    if (!functions) return;
    setStarting(true);
    setFnUnavailable(false);
    setSubmissionResult(null);
    try {
      const fn = httpsCallable<{ examId: string }, ActiveAttemptState>(
        functions,
        'startNanoAttempt'
      );
      const res = await fn({ examId });
      const data = res.data;

      // Initialize default ordering arrays
      const initAnswers: Record<string, unknown> = {};
      data.questions.forEach((q) => {
        if (q.type === 'ordering' && q.items) {
          initAnswers[q.id] = [...q.items];
        } else if (q.type === 'matching') {
          initAnswers[q.id] = {};
        }
      });

      setActiveAttempt(data);
      setAnswers(initAnswers);
      setCurrentIdx(0);
      setSecondsLeft(data.durationMinutes * 60);
    } catch (err) {
      if (isFunctionsUnavailableError(err)) {
        setFnUnavailable(true);
      } else {
        showToast(err instanceof Error ? err.message : 'Unable to start exam', 'error');
      }
    } finally {
      setStarting(false);
    }
  };

  useEffect(() => {
    const startId = searchParams.get('start');
    if (startId && !activeAttempt && !starting && !loading) {
      setSearchParams({}, { replace: true });
      startExamById(startId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, loading]);

  const handleSubmitExam = async () => {
    if (!functions || !activeAttempt || submitting) return;
    setSubmitting(true);
    try {
      const fn = httpsCallable<
        {
          examId: string;
          studentId: string;
          answers: Record<string, unknown>;
          startedAtMillis: number;
        },
        SubmissionResultState
      >(functions, 'submitNanoAttempt');

      const res = await fn({
        examId: activeAttempt.examId,
        studentId: activeAttempt.studentId,
        answers,
        startedAtMillis: activeAttempt.startedAtMillis,
      });
      setSubmissionResult(res.data);
      setActiveAttempt(null);
      showToast(`Submitted! Score: ${res.data.score}/${res.data.total}`, 'success');
      await reload();
    } catch (err) {
      if (isFunctionsUnavailableError(err)) {
        setFnUnavailable(true);
      } else {
        showToast(err instanceof Error ? err.message : 'Submission failed', 'error');
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Countdown Timer
  useEffect(() => {
    if (!activeAttempt) return;
    if (secondsLeft <= 0) {
      handleSubmitExam();
      return;
    }
    const timer = window.setInterval(() => {
      setSecondsLeft((s) => s - 1);
    }, 1000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAttempt, secondsLeft]);

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  // Distraction-free Exam Runner View
  if (activeAttempt) {
    const questions = activeAttempt.questions;
    const q = questions[currentIdx];
    const answeredCount = questions.filter((item) => {
      const val = answers[item.id];
      if (val === undefined || val === null || val === '') return false;
      if (item.type === 'matching') {
        const obj = val as Record<string, string>;
        return item.leftPrompts ? item.leftPrompts.every((p) => Boolean(obj[p])) : false;
      }
      return true;
    }).length;
    const progressPct = questions.length > 0 ? Math.round((answeredCount / questions.length) * 100) : 0;

    return (
      <div className="max-w-3xl mx-auto space-y-5">
        {/* Top Timer & Progress Bar */}
        <SurfaceCard className="p-4 sm:p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100">
                {activeAttempt.title}
              </h2>
              <p className="text-xs text-slate-500">
                Question {currentIdx + 1} of {questions.length} · {answeredCount} answered
              </p>
            </div>
            <div
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl font-mono-num text-sm font-semibold ${
                secondsLeft < 60
                  ? 'bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400'
                  : 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400'
              }`}
            >
              <Clock className="w-4 h-4" />
              <span>{formatTimer(secondsLeft)}</span>
            </div>
          </div>

          <div className="mt-4 h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
            <div
              className="h-full bg-indigo-600 transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </SurfaceCard>

        {/* Question Card */}
        {q && (
          <AnimatePresence mode="wait">
            <motion.div
              key={q.id}
              initial={{ opacity: 0, x: 14 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -14 }}
              transition={{ duration: 0.18 }}
            >
              <SurfaceCard className="p-6 space-y-5">
                <div className="text-xs text-slate-500">
                  <span className="uppercase font-semibold text-indigo-600 dark:text-indigo-400">
                    {q.type}
                  </span>
                  <span aria-hidden="true"> · </span>
                  <span>{q.chapter}</span>
                </div>

                <div className="text-base sm:text-lg font-medium text-slate-900 dark:text-slate-100 leading-relaxed">
                  <MathText text={q.text} />
                </div>

                {q.imageUrl && (
                  <img
                    src={q.imageUrl}
                    alt="Question diagram"
                    referrerPolicy="no-referrer"
                    className="max-h-64 rounded-xl border border-slate-200 dark:border-slate-800 object-contain"
                  />
                )}

                {/* Answer Input by Question Type */}
                {(q.type === 'mcq' || q.type === 'truefalse') && q.options && (
                  <div className="space-y-2.5">
                    {q.options.map((opt) => {
                      const selected = answers[q.id] === opt;
                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: opt }))}
                          className={`w-full text-left p-4 rounded-xl border text-sm transition-all ${
                            selected
                              ? 'border-indigo-600 bg-indigo-50/70 dark:bg-indigo-950/50 text-indigo-900 dark:text-indigo-100 font-medium'
                              : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                          }`}
                        >
                          <MathText text={opt} />
                        </button>
                      );
                    })}
                  </div>
                )}

                {q.type === 'fillblank' && (
                  <input
                    type="text"
                    value={String(answers[q.id] ?? '')}
                    onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                    placeholder="Type your exact answer..."
                    className={inputClass}
                  />
                )}

                {q.type === 'matching' && q.leftPrompts && q.rightOptions && (
                  <div className="space-y-3">
                    {q.leftPrompts.map((left) => {
                      const currentMap = (answers[q.id] as Record<string, string>) || {};
                      return (
                        <div key={left} className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-sm">
                            <MathText text={left} />
                          </div>
                          <select
                            value={currentMap[left] || ''}
                            onChange={(e) =>
                              setAnswers((prev) => ({
                                ...prev,
                                [q.id]: { ...currentMap, [left]: e.target.value },
                              }))
                            }
                            className={inputClass}
                          >
                            <option value="">Select match...</option>
                            {q.rightOptions!.map((r) => (
                              <option key={r} value={r}>
                                {r}
                              </option>
                            ))}
                          </select>
                        </div>
                      );
                    })}
                  </div>
                )}

                {q.type === 'ordering' && Array.isArray(answers[q.id]) && (
                  <div className="space-y-2">
                    {(answers[q.id] as string[]).map((item, idx, arr) => (
                      <div
                        key={`${item}_${idx}`}
                        className="flex items-center justify-between gap-3 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
                      >
                        <div className="flex items-center gap-3">
                          <span className="font-mono-num text-xs text-slate-400">{idx + 1}.</span>
                          <span className="text-sm">
                            <MathText text={item} />
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => {
                              const next = [...arr];
                              [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
                              setAnswers((prev) => ({ ...prev, [q.id]: next }));
                            }}
                            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-30"
                            aria-label="Move up"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === arr.length - 1}
                            onClick={() => {
                              const next = [...arr];
                              [next[idx + 1], next[idx]] = [next[idx], next[idx + 1]];
                              setAnswers((prev) => ({ ...prev, [q.id]: next }));
                            }}
                            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-30"
                            aria-label="Move down"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </SurfaceCard>
            </motion.div>
          </AnimatePresence>
        )}

        {/* Question Navigator & Submit */}
        <SurfaceCard className="p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-1.5 flex-wrap">
            {questions.map((item, idx) => {
              const hasAns = Boolean(answers[item.id]);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setCurrentIdx(idx)}
                  className={`w-8 h-8 rounded-lg text-xs font-mono-num font-semibold transition-colors ${
                    idx === currentIdx
                      ? 'bg-indigo-600 text-white'
                      : hasAns
                        ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="secondary"
              size="sm"
              disabled={currentIdx === 0}
              onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Prev</span>
            </Button>
            {currentIdx < questions.length - 1 ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setCurrentIdx((i) => Math.min(questions.length - 1, i + 1))}
              >
                <span>Next</span>
                <ArrowRight className="w-4 h-4" />
              </Button>
            ) : (
              <Button onClick={handleSubmitExam} disabled={submitting}>
                {submitting ? t.common.loading : t.studentPortal.submitExam}
              </Button>
            )}
          </div>
        </SurfaceCard>
      </div>
    );
  }

  // Post-Submission Review Screen
  if (submissionResult) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <SurfaceCard className="p-6 text-center space-y-2">
          <p className="text-xs font-medium text-indigo-600 dark:text-indigo-400">
            Exam Graded & Recorded
          </p>
          <h2 className="text-3xl font-bold font-mono-num text-slate-900 dark:text-slate-100">
            {submissionResult.score} / {submissionResult.total} ({submissionResult.percentage}%)
          </h2>
          <div className="pt-3">
            <Button variant="secondary" onClick={() => setSubmissionResult(null)}>
              Back to Nano Exams
            </Button>
          </div>
        </SurfaceCard>

        <div className="space-y-3">
          {submissionResult.breakdown.map((b, idx) => (
            <SurfaceCard key={b.questionId} className="p-5 space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold">
                {b.correct ? (
                  <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="w-4 h-4" /> Q{idx + 1} Correct
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400">
                    <XCircle className="w-4 h-4" /> Q{idx + 1} Incorrect
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Correct Answer:{' '}
                <span className="font-mono-num font-medium text-slate-900 dark:text-slate-100">
                  {typeof b.correctAnswer === 'object'
                    ? JSON.stringify(b.correctAnswer)
                    : String(b.correctAnswer)}
                </span>
              </p>
              {b.explanation && (
                <div className="text-sm text-slate-700 dark:text-slate-300 pt-1">
                  <MathText text={b.explanation} />
                </div>
              )}
            </SurfaceCard>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
          {t.nav.nanoExams}
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          Timed assessments graded securely on the server.
        </p>
      </div>

      {fnUnavailable && (
        <FunctionsUnavailableBanner
          context="Starting and grading Nano Exams requires startNanoAttempt and submitNanoAttempt Cloud Functions."
          onDismiss={() => setFnUnavailable(false)}
        />
      )}

      {loading ? (
        <SkeletonRows rows={4} />
      ) : nanoExams.length === 0 ? (
        <EmptyState
          icon={<ClipboardList className="w-6 h-6" />}
          title={t.studentPortal.noExams}
          description="Published Nano Exams from your tutor will appear here."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {nanoExams.map((ex) => {
            const avail = ex.availability || { mode: 'instant' };
            const now = Date.now();
            let isAvailable = true;
            let statusNote = 'Available now';

            if (avail.mode === 'window') {
              const sMs = avail.startAt?.toMillis?.() ?? 0;
              const eMs = avail.endAt?.toMillis?.() ?? Number.MAX_SAFE_INTEGER;
              if (now < sMs || now > eMs) {
                isAvailable = false;
                statusNote = 'Outside scheduled window';
              } else {
                statusNote = 'Active window';
              }
            } else if (avail.mode === 'assigned') {
              if (!avail.assignedStudentIds?.includes(studentId)) {
                isAvailable = false;
                statusNote = 'Assigned to specific students';
              }
            }

            const pastAttempts = nanoAttempts.filter((a) => a.examId === ex.id);

            return (
              <SurfaceCard key={ex.id} className="p-5 flex flex-col justify-between gap-4">
                <div>
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    {ex.title}
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    {ex.subject} · {ex.questionIds.length} Qs · {ex.durationMinutes} min ·{' '}
                    {statusNote}
                  </p>
                  {pastAttempts.length > 0 && (
                    <p className="text-xs text-emerald-600 dark:text-emerald-400 font-mono-num mt-2">
                      Latest attempt: {pastAttempts[0].score}/{pastAttempts[0].total} (
                      {pastAttempts[0].percentage}%) · {formatDate(pastAttempts[0].submittedAt, lang)}
                    </p>
                  )}
                </div>

                <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
                  <Button
                    size="sm"
                    disabled={!isAvailable || starting}
                    onClick={() => startExamById(ex.id)}
                  >
                    {starting ? t.common.loading : t.studentPortal.startExam}
                  </Button>
                </div>
              </SurfaceCard>
            );
          })}
        </div>
      )}
    </div>
  );
}
