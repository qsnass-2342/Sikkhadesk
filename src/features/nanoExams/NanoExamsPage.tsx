import React, { useCallback, useEffect, useState } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { Check, ClipboardList, Plus, Send, Trash2 } from 'lucide-react';
import { db } from '../../lib/firebase';
import { useAuth } from '../auth/AuthContext';
import { useI18n } from '../../i18n/I18nContext';
import { useStudentsData } from '../students/useStudentsData';
import type { NanoAttempt, NanoAvailabilityMode, NanoExam, Question } from '../../types';
import {
  Button,
  EmptyState,
  Modal,
  SkeletonRows,
  SurfaceCard,
  inputClass,
  labelClass,
} from '../../components/ui/Primitives';
import { MathText } from '../../components/ui/MathText';
import { useToast } from '../../components/ui/Toast';
import { formatDate } from '../../lib/formatters';

export function NanoExamsPage() {
  const { userProfile } = useAuth();
  const { t, lang } = useI18n();
  const { showToast } = useToast();
  const teacherId = userProfile?.uid || '';
  const { items: students } = useStudentsData();

  const [exams, setExams] = useState<NanoExam[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [attempts, setAttempts] = useState<NanoAttempt[]>([]);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [duration, setDuration] = useState('15');
  const [availabilityMode, setAvailabilityMode] = useState<NanoAvailabilityMode>('instant');
  const [startAtStr, setStartAtStr] = useState('');
  const [endAtStr, setEndAtStr] = useState('');
  const [assignedIds, setAssignedIds] = useState<Set<string>>(new Set());
  const [selectedQIds, setSelectedQIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const loadAll = useCallback(async () => {
    if (!db || !teacherId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [eSnap, qSnap, aSnap] = await Promise.all([
        getDocs(
          query(
            collection(db, 'nanoExams'),
            where('teacherId', '==', teacherId),
            orderBy('createdAt', 'desc')
          )
        ),
        getDocs(
          query(
            collection(db, 'questions'),
            where('ownerType', '==', 'teacher'),
            where('ownerId', '==', teacherId),
            orderBy('createdAt', 'desc')
          )
        ),
        getDocs(
          query(
            collection(db, 'nanoAttempts'),
            where('teacherId', '==', teacherId),
            orderBy('submittedAt', 'desc')
          )
        ),
      ]);
      setExams(eSnap.docs.map((d) => ({ id: d.id, ...d.data() } as NanoExam)));
      setQuestions(qSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Question)));
      setAttempts(aSnap.docs.map((d) => ({ id: d.id, ...d.data() } as NanoAttempt)));
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load Nano Exams', 'error');
    } finally {
      setLoading(false);
    }
  }, [teacherId, showToast]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleCreateExam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!db || !teacherId) return;
    if (selectedQIds.length === 0) {
      showToast('Select at least one question from your library', 'error');
      return;
    }
    setSaving(true);
    try {
      await addDoc(collection(db, 'nanoExams'), {
        teacherId,
        title: title.trim(),
        subject: subject.trim(),
        questionIds: selectedQIds,
        durationMinutes: Math.max(1, Number(duration) || 15),
        availability: {
          mode: availabilityMode,
          startAt:
            availabilityMode === 'window' && startAtStr
              ? Timestamp.fromDate(new Date(startAtStr))
              : null,
          endAt:
            availabilityMode === 'window' && endAtStr
              ? Timestamp.fromDate(new Date(endAtStr))
              : null,
          assignedStudentIds:
            availabilityMode === 'assigned' ? Array.from(assignedIds) : [],
        },
        status: 'draft',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setModalOpen(false);
      setTitle('');
      setSubject('');
      setSelectedQIds([]);
      showToast('Nano Exam created as draft', 'success');
      await loadAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not create Nano Exam', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleTogglePublish = async (exam: NanoExam) => {
    if (!db) return;
    const next = exam.status === 'published' ? 'draft' : 'published';
    try {
      await updateDoc(doc(db, 'nanoExams', exam.id), {
        status: next,
        updatedAt: serverTimestamp(),
      });
      showToast(next === 'published' ? 'Exam published to students' : 'Moved to draft', 'success');
      await loadAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Update failed', 'error');
    }
  };

  const handleDelete = async (exam: NanoExam) => {
    if (!db) return;
    try {
      await deleteDoc(doc(db, 'nanoExams', exam.id));
      showToast('Nano Exam deleted', 'info');
      await loadAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Delete failed', 'error');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            {t.nanoExams.title}
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {t.nanoExams.subtitle}
          </p>
        </div>
        <Button onClick={() => setModalOpen(true)}>
          <Plus className="w-4 h-4" />
          <span>{t.nanoExams.createExam}</span>
        </Button>
      </div>

      {loading ? (
        <SkeletonRows rows={4} />
      ) : exams.length === 0 ? (
        <EmptyState
          icon={<ClipboardList className="w-6 h-6" />}
          title={t.nanoExams.emptyTitle}
          description={t.nanoExams.emptyDesc}
          action={
            <Button onClick={() => setModalOpen(true)}>
              <Plus className="w-4 h-4" />
              <span>{t.nanoExams.createExam}</span>
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {exams.map((exam) => {
            const examAttempts = attempts.filter((a) => a.examId === exam.id);
            return (
              <SurfaceCard key={exam.id} className="p-5 flex flex-col justify-between gap-4">
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                        {exam.title}
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        <span>{exam.subject}</span>
                        <span aria-hidden="true"> · </span>
                        <span className="font-mono-num">{exam.questionIds.length} Qs</span>
                        <span aria-hidden="true"> · </span>
                        <span className="font-mono-num">{exam.durationMinutes} min</span>
                        <span aria-hidden="true"> · </span>
                        <span
                          className={
                            exam.status === 'published'
                              ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                              : 'text-amber-600 dark:text-amber-400 font-medium'
                          }
                        >
                          {exam.status === 'published' ? t.common.published : t.common.draft}
                        </span>
                      </p>
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 mt-3">
                    Availability: <span className="capitalize">{exam.availability?.mode || 'instant'}</span>
                    <span aria-hidden="true"> · </span>
                    <span className="font-mono-num">{examAttempts.length} submissions</span>
                  </p>
                </div>

                <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <Button
                    size="sm"
                    variant={exam.status === 'published' ? 'secondary' : 'primary'}
                    onClick={() => handleTogglePublish(exam)}
                  >
                    {exam.status === 'published' ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Unpublish</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-3.5 h-3.5" />
                        <span>{t.common.publish}</span>
                      </>
                    )}
                  </Button>
                  <button
                    type="button"
                    onClick={() => handleDelete(exam)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                    aria-label={t.common.delete}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </SurfaceCard>
            );
          })}
        </div>
      )}

      {/* Recent Nano Attempts */}
      {attempts.length > 0 && (
        <SurfaceCard className="overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Recent Student Submissions
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500">
                <tr>
                  <th className="py-3 px-4 font-medium">Exam</th>
                  <th className="py-3 px-4 font-medium">Student</th>
                  <th className="py-3 px-4 font-medium text-right">Score</th>
                  <th className="py-3 px-4 font-medium text-right">Submitted</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {attempts.slice(0, 15).map((att) => {
                  const st = students.find((s) => s.student.id === att.studentId);
                  return (
                    <tr key={att.id}>
                      <td className="py-3 px-4 font-medium">{att.examTitle}</td>
                      <td className="py-3 px-4 text-slate-600 dark:text-slate-400">
                        {st?.student.name || att.studentId}
                      </td>
                      <td className="py-3 px-4 text-right font-mono-num font-semibold">
                        {att.score}/{att.total} ({att.percentage}%)
                      </td>
                      <td className="py-3 px-4 text-right text-xs text-slate-500 tabular-nums">
                        {formatDate(att.submittedAt, lang)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </SurfaceCard>
      )}

      {/* Create Nano Exam Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={t.nanoExams.createExam}
        maxWidth="max-w-3xl"
      >
        <form onSubmit={handleCreateExam} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className={labelClass}>Exam Title *</label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Calculus Quick Check 01"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>{t.nanoExams.duration} *</label>
              <input
                type="number"
                min={1}
                required
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                className={`${inputClass} font-mono-num`}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>{t.common.subject} *</label>
              <input
                type="text"
                required
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Mathematics"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>{t.nanoExams.availability}</label>
              <select
                value={availabilityMode}
                onChange={(e) => setAvailabilityMode(e.target.value as NanoAvailabilityMode)}
                className={inputClass}
              >
                <option value="instant">{t.nanoExams.instant}</option>
                <option value="window">{t.nanoExams.window}</option>
                <option value="assigned">{t.nanoExams.assigned}</option>
              </select>
            </div>
          </div>

          {availabilityMode === 'window' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Start Time</label>
                <input
                  type="datetime-local"
                  required
                  value={startAtStr}
                  onChange={(e) => setStartAtStr(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>End Time</label>
                <input
                  type="datetime-local"
                  required
                  value={endAtStr}
                  onChange={(e) => setEndAtStr(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
          )}

          {availabilityMode === 'assigned' && (
            <div>
              <label className={labelClass}>Select Assigned Students</label>
              <div className="grid grid-cols-2 gap-2 max-h-36 overflow-y-auto p-2 rounded-xl border border-slate-200 dark:border-slate-800">
                {students
                  .filter((s) => s.relationship.status !== 'archived')
                  .map((s) => (
                    <label key={s.student.id} className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={assignedIds.has(s.student.id)}
                        onChange={() =>
                          setAssignedIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(s.student.id)) next.delete(s.student.id);
                            else next.add(s.student.id);
                            return next;
                          })
                        }
                        className="accent-indigo-600"
                      />
                      <span className="truncate">{s.student.name}</span>
                    </label>
                  ))}
              </div>
            </div>
          )}

          <div>
            <label className={labelClass}>
              Pick Questions from My Library ({selectedQIds.length} selected)
            </label>
            {questions.length === 0 ? (
              <p className="text-xs text-slate-500">
                Your Nano Library has no questions yet. Create or import questions first.
              </p>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {questions.map((q) => {
                  const checked = selectedQIds.includes(q.id);
                  return (
                    <label
                      key={q.id}
                      className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-800 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setSelectedQIds((prev) =>
                            prev.includes(q.id) ? prev.filter((id) => id !== q.id) : [...prev, q.id]
                          )
                        }
                        className="mt-1 accent-indigo-600"
                      />
                      <div className="min-w-0 flex-1 text-xs">
                        <span className="uppercase font-semibold text-indigo-600 dark:text-indigo-400">
                          {q.type}
                        </span>
                        <span className="text-slate-400"> · {q.subject} · {q.chapter}</span>
                        <div className="text-sm text-slate-900 dark:text-slate-100 mt-0.5">
                          <MathText text={q.text} />
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? t.common.loading : t.common.create}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
