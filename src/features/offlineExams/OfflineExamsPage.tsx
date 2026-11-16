import React, { useCallback, useEffect, useState } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { CheckCircle2, FileSpreadsheet, Plus, Send, Trash2 } from 'lucide-react';
import { db, functions, isFunctionsUnavailableError } from '../../lib/firebase';
import { sortNewestFirst } from '../../lib/firestoreSort';
import { useAuth } from '../auth/AuthContext';
import { useI18n } from '../../i18n/I18nContext';
import { useStudentsData } from '../students/useStudentsData';
import type { OfflineExam, OfflineResult } from '../../types';
import { getTodayISO } from '../../lib/formatters';
import {
  Button,
  EmptyState,
  FunctionsUnavailableBanner,
  Modal,
  SkeletonRows,
  SurfaceCard,
  inputClass,
  labelClass,
} from '../../components/ui/Primitives';
import { useToast } from '../../components/ui/Toast';

export function OfflineExamsPage() {
  const { userProfile } = useAuth();
  const { t } = useI18n();
  const { showToast } = useToast();
  const teacherId = userProfile?.uid || '';
  const { items: students } = useStudentsData();

  const [exams, setExams] = useState<OfflineExam[]>([]);
  const [results, setResults] = useState<OfflineResult[]>([]);
  const [loading, setLoading] = useState(true);

  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [date, setDate] = useState(getTodayISO());
  const [totalMarks, setTotalMarks] = useState('100');
  const [savingExam, setSavingExam] = useState(false);

  // Marks entry modal
  const [marksExam, setMarksExam] = useState<OfflineExam | null>(null);
  const [draftMarks, setDraftMarks] = useState<Record<string, { marks: string; remarks: string }>>({});
  const [savingMarks, setSavingMarks] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [fnUnavailable, setFnUnavailable] = useState(false);

  const activeStudents = students.filter((s) => s.relationship.status !== 'archived');

  const loadData = useCallback(async () => {
    if (!db || !teacherId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [eSnap, rSnap] = await Promise.all([
        getDocs(query(collection(db, 'offlineExams'), where('teacherId', '==', teacherId))),
        getDocs(query(collection(db, 'offlineResults'), where('teacherId', '==', teacherId))),
      ]);
      setExams(
        sortNewestFirst(
          eSnap.docs.map((d) => ({ id: d.id, ...d.data() } as OfflineExam)),
          (e) => e.createdAt
        )
      );
      setResults(
        sortNewestFirst(
          rSnap.docs.map((d) => ({ id: d.id, ...d.data() } as OfflineResult)),
          (r) => r.publishedAt || r.updatedAt
        )
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load exams', 'error');
    } finally {
      setLoading(false);
    }
  }, [teacherId, showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreateExam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!db || !teacherId) return;
    const total = Number(totalMarks);
    if (!Number.isFinite(total) || total <= 0) {
      showToast('Total marks must be greater than 0', 'error');
      return;
    }
    setSavingExam(true);
    try {
      await addDoc(collection(db, 'offlineExams'), {
        teacherId,
        title: title.trim(),
        subject: subject.trim(),
        date,
        totalMarks: total,
        published: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setCreateOpen(false);
      setTitle('');
      setSubject('');
      setTotalMarks('100');
      showToast('Offline exam created', 'success');
      await loadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not create exam', 'error');
    } finally {
      setSavingExam(false);
    }
  };

  const openMarksModal = (exam: OfflineExam) => {
    setMarksExam(exam);
    setFnUnavailable(false);
    const map: Record<string, { marks: string; remarks: string }> = {};
    activeStudents.forEach((s) => {
      const existing = results.find(
        (r) => r.examId === exam.id && r.studentId === s.student.id
      );
      map[s.student.id] = {
        marks: existing ? String(existing.marksObtained) : '',
        remarks: existing?.remarks || '',
      };
    });
    setDraftMarks(map);
  };

  const handleSaveMarks = async () => {
    if (!db || !teacherId || !marksExam) return;
    // Validate all entered marks <= totalMarks
    for (const s of activeStudents) {
      const entry = draftMarks[s.student.id];
      if (!entry || entry.marks === '') continue;
      const val = Number(entry.marks);
      if (!Number.isFinite(val) || val < 0 || val > marksExam.totalMarks) {
        showToast(
          `Invalid marks for ${s.student.name}: must be between 0 and ${marksExam.totalMarks}`,
          'error'
        );
        return;
      }
    }

    setSavingMarks(true);
    try {
      const writes: Promise<void>[] = [];
      activeStudents.forEach((s) => {
        const entry = draftMarks[s.student.id];
        if (!entry || entry.marks === '') return;
        const val = Number(entry.marks);
        const resultId = `${marksExam.id}_${s.student.id}`;
        writes.push(
          setDoc(
            doc(db!, 'offlineResults', resultId),
            {
              examId: marksExam.id,
              teacherId,
              studentId: s.student.id,
              examTitle: marksExam.title,
              subject: marksExam.subject,
              examDate: marksExam.date,
              totalMarks: marksExam.totalMarks,
              marksObtained: val,
              remarks: entry.remarks.trim(),
              published: marksExam.published,
              ...(marksExam.published ? { publishedAt: serverTimestamp() } : {}),
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          )
        );
      });
      await Promise.all(writes);
      showToast('Marks saved', 'success');
      await loadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to save marks', 'error');
    } finally {
      setSavingMarks(false);
    }
  };

  const handlePublishResults = async (exam: OfflineExam) => {
    if (!functions || !db) return;
    setPublishing(true);
    setFnUnavailable(false);
    try {
      const fn = httpsCallable<
        { examId: string },
        { publishedCount: number; averageMarks: number }
      >(functions, 'publishOfflineResults');
      const res = await fn({ examId: exam.id });
      showToast(
        `Published ${res.data.publishedCount} results (Avg: ${res.data.averageMarks})`,
        'success'
      );
      setMarksExam((prev) => (prev ? { ...prev, published: true } : prev));
      await loadData();
    } catch (err) {
      if (isFunctionsUnavailableError(err)) {
        setFnUnavailable(true);
      } else {
        showToast(err instanceof Error ? err.message : 'Publish failed', 'error');
      }
    } finally {
      setPublishing(false);
    }
  };

  const handleDeleteExam = async (exam: OfflineExam) => {
    if (!db) return;
    try {
      await deleteDoc(doc(db, 'offlineExams', exam.id));
      const related = results.filter((r) => r.examId === exam.id);
      await Promise.all(related.map((r) => deleteDoc(doc(db!, 'offlineResults', r.id))));
      showToast('Exam deleted', 'info');
      await loadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not delete exam', 'error');
    }
  };

  const toggleDraftVisibility = async (exam: OfflineExam) => {
    if (!db) return;
    try {
      await updateDoc(doc(db, 'offlineExams', exam.id), {
        published: false,
        updatedAt: serverTimestamp(),
      });
      await loadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Update failed', 'error');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            {t.offlineExams.title}
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {t.offlineExams.subtitle}
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="w-4 h-4" />
          <span>{t.offlineExams.createExam}</span>
        </Button>
      </div>

      {loading ? (
        <SkeletonRows rows={4} />
      ) : exams.length === 0 ? (
        <EmptyState
          icon={<FileSpreadsheet className="w-6 h-6" />}
          title={t.offlineExams.emptyTitle}
          description={t.offlineExams.emptyDesc}
          action={
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="w-4 h-4" />
              <span>{t.offlineExams.createExam}</span>
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {exams.map((exam) => {
            const examResults = results.filter((r) => r.examId === exam.id);
            const avg =
              examResults.length > 0
                ? (
                    examResults.reduce((acc, r) => acc + r.marksObtained, 0) /
                    examResults.length
                  ).toFixed(1)
                : '—';

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
                        <span className="font-mono-num">{exam.date}</span>
                        <span aria-hidden="true"> · </span>
                        {exam.published ? (
                          <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                            {t.common.published}
                          </span>
                        ) : (
                          <span className="text-amber-600 dark:text-amber-400 font-medium">
                            {t.common.draft}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <span className="text-slate-400 block">Total Marks</span>
                      <span className="font-mono-num font-semibold text-slate-900 dark:text-slate-100">
                        {exam.totalMarks}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Graded</span>
                      <span className="font-mono-num font-semibold text-slate-900 dark:text-slate-100">
                        {examResults.length}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Average</span>
                      <span className="font-mono-num font-semibold text-slate-900 dark:text-slate-100">
                        {avg}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <Button size="sm" variant="secondary" onClick={() => openMarksModal(exam)}>
                    {t.offlineExams.enterMarks}
                  </Button>
                  <div className="flex items-center gap-1">
                    {exam.published ? (
                      <button
                        type="button"
                        onClick={() => toggleDraftVisibility(exam)}
                        className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 px-2 py-1"
                      >
                        Unpublish
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => handleDeleteExam(exam)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                      aria-label={t.common.delete}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </SurfaceCard>
            );
          })}
        </div>
      )}

      {/* Create Exam Modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={t.offlineExams.createExam}
      >
        <form onSubmit={handleCreateExam} className="space-y-4">
          <div>
            <label className={labelClass}>Exam Title *</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Monthly Physics Assessment 02"
              className={inputClass}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className={labelClass}>{t.common.subject} *</label>
              <input
                type="text"
                required
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Physics"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>{t.common.date} *</label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>{t.offlineExams.totalMarks} *</label>
              <input
                type="number"
                min={1}
                required
                value={totalMarks}
                onChange={(e) => setTotalMarks(e.target.value)}
                className={`${inputClass} font-mono-num`}
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => setCreateOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button type="submit" disabled={savingExam}>
              {savingExam ? t.common.loading : t.common.create}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Marks Entry Modal */}
      <Modal
        open={Boolean(marksExam)}
        onClose={() => setMarksExam(null)}
        title={marksExam ? `${t.offlineExams.enterMarks}: ${marksExam.title}` : ''}
        subtitle={
          marksExam
            ? `${marksExam.subject} · ${t.offlineExams.totalMarks}: ${marksExam.totalMarks}`
            : ''
        }
        maxWidth="max-w-2xl"
      >
        {marksExam && (
          <div className="space-y-4">
            {fnUnavailable && (
              <FunctionsUnavailableBanner context="Publishing offline results uses the publishOfflineResults Cloud Function." />
            )}

            {activeStudents.length === 0 ? (
              <p className="text-sm text-slate-500">No active students enrolled.</p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {activeStudents.map((s) => {
                  const row = draftMarks[s.student.id] || { marks: '', remarks: '' };
                  const numVal = Number(row.marks);
                  const invalid =
                    row.marks !== '' &&
                    (!Number.isFinite(numVal) || numVal < 0 || numVal > marksExam.totalMarks);
                  return (
                    <div
                      key={s.student.id}
                      className="py-3 grid grid-cols-1 sm:grid-cols-12 gap-3 items-center"
                    >
                      <div className="sm:col-span-4">
                        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                          {s.student.name}
                        </p>
                        <p className="text-xs text-slate-500">{s.relationship.class}</p>
                      </div>
                      <div className="sm:col-span-3">
                        <input
                          type="number"
                          min={0}
                          max={marksExam.totalMarks}
                          step="0.5"
                          placeholder={`0–${marksExam.totalMarks}`}
                          value={row.marks}
                          onChange={(e) =>
                            setDraftMarks((prev) => ({
                              ...prev,
                              [s.student.id]: { ...row, marks: e.target.value },
                            }))
                          }
                          className={`${inputClass} font-mono-num ${
                            invalid ? 'border-rose-500 focus:border-rose-500' : ''
                          }`}
                        />
                      </div>
                      <div className="sm:col-span-5">
                        <input
                          type="text"
                          placeholder={t.offlineExams.remarks}
                          value={row.remarks}
                          onChange={(e) =>
                            setDraftMarks((prev) => ({
                              ...prev,
                              [s.student.id]: { ...row, remarks: e.target.value },
                            }))
                          }
                          className={inputClass}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
              <Button
                variant="secondary"
                onClick={handleSaveMarks}
                disabled={savingMarks || activeStudents.length === 0}
              >
                {savingMarks ? t.common.loading : t.offlineExams.saveMarks}
              </Button>

              <Button
                onClick={() => handlePublishResults(marksExam)}
                disabled={publishing || activeStudents.length === 0}
              >
                {marksExam.published ? (
                  <CheckCircle2 className="w-4 h-4" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                <span>
                  {publishing
                    ? t.common.loading
                    : marksExam.published
                      ? 'Re-publish Results'
                      : t.offlineExams.publishResults}
                </span>
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
