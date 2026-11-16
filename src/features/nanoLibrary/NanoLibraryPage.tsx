import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import {
  CheckCircle2,
  CopyPlus,
  Download,
  Image as ImageIcon,
  Library,
  Plus,
  Search,
  Trash2,
  Upload,
  XCircle,
} from 'lucide-react';
import { db } from '../../lib/firebase';
import { useAuth } from '../auth/AuthContext';
import { useI18n } from '../../i18n/I18nContext';
import { normalizeImageUrl, validateImageLoads } from '../../lib/driveUtils';
import {
  parseBulkQuestions,
  SAMPLE_CSV_TEMPLATE,
  SAMPLE_JSON_TEMPLATE,
  type BulkImportResult,
} from '../../lib/formatters';
import type {
  MatchingPair,
  Question,
  QuestionAnswerKey,
  QuestionDifficulty,
  QuestionType,
} from '../../types';
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

export function NanoLibraryPage() {
  const { userProfile } = useAuth();
  const { t } = useI18n();
  const { showToast } = useToast();
  const teacherId = userProfile?.uid || '';

  const [tab, setTab] = useState<'my' | 'platform'>('my');
  const [myQuestions, setMyQuestions] = useState<Question[]>([]);
  const [platformQuestions, setPlatformQuestions] = useState<Question[]>([]);
  const [answerKeys, setAnswerKeys] = useState<Record<string, QuestionAnswerKey>>({});
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | QuestionType>('all');
  const [subjectFilter, setSubjectFilter] = useState('all');
  const [chapterFilter, setChapterFilter] = useState('all');
  const [difficultyFilter, setDifficultyFilter] = useState<'all' | QuestionDifficulty>('all');

  // Authoring Modal
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [qType, setQType] = useState<QuestionType>('mcq');
  const [qText, setQText] = useState('');
  const [qSubject, setQSubject] = useState('');
  const [qChapter, setQChapter] = useState('');
  const [qDifficulty, setQDifficulty] = useState<QuestionDifficulty>('medium');
  const [qTags, setQTags] = useState('');
  const [qImageUrl, setQImageUrl] = useState('');
  const [qImageValid, setQImageValid] = useState<boolean | null>(null);
  const [validatingImg, setValidatingImg] = useState(false);
  const [qOptions, setQOptions] = useState<string[]>(['', '', '', '']);
  const [qPairs, setQPairs] = useState<MatchingPair[]>([
    { left: '', right: '' },
    { left: '', right: '' },
  ]);
  const [qItems, setQItems] = useState<string[]>(['', '', '']);
  const [qCorrectText, setQCorrectText] = useState('');
  const [qExplanation, setQExplanation] = useState('');
  const [saving, setSaving] = useState(false);

  // Bulk Import Modal
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkFormat, setBulkFormat] = useState<'csv' | 'json'>('csv');
  const [bulkRaw, setBulkRaw] = useState('');
  const [bulkReport, setBulkReport] = useState<BulkImportResult | null>(null);
  const [bulkImporting, setBulkImporting] = useState(false);

  const loadLibrary = useCallback(async () => {
    if (!db || !teacherId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [mySnap, platSnap] = await Promise.all([
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
            collection(db, 'questions'),
            where('ownerType', '==', 'platform'),
            orderBy('createdAt', 'desc')
          )
        ),
      ]);

      const mine = mySnap.docs.map((d) => ({ id: d.id, ...d.data() } as Question));
      const plat = platSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Question));
      setMyQuestions(mine);
      setPlatformQuestions(plat);

      const allIds = [...mine, ...plat].map((q) => q.id);
      const akSnaps = await Promise.all(
        allIds.map((id) => getDoc(doc(db!, 'questions', id, 'private', 'answerKey')))
      );
      const akMap: Record<string, QuestionAnswerKey> = {};
      akSnaps.forEach((snap, idx) => {
        if (snap.exists()) {
          akMap[allIds[idx]] = snap.data() as QuestionAnswerKey;
        }
      });
      setAnswerKeys(akMap);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load library', 'error');
    } finally {
      setLoading(false);
    }
  }, [teacherId, showToast]);

  useEffect(() => {
    loadLibrary();
  }, [loadLibrary]);

  const activeList = tab === 'my' ? myQuestions : platformQuestions;

  const subjects = useMemo(
    () => Array.from(new Set(activeList.map((q) => q.subject).filter(Boolean))).sort(),
    [activeList]
  );

  const chapters = useMemo(
    () =>
      Array.from(
        new Set(
          activeList
            .filter((q) => subjectFilter === 'all' || q.subject === subjectFilter)
            .map((q) => q.chapter)
            .filter(Boolean)
        )
      ).sort(),
    [activeList, subjectFilter]
  );

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return activeList.filter((q) => {
      if (typeFilter !== 'all' && q.type !== typeFilter) return false;
      if (subjectFilter !== 'all' && q.subject !== subjectFilter) return false;
      if (chapterFilter !== 'all' && q.chapter !== chapterFilter) return false;
      if (difficultyFilter !== 'all' && q.difficulty !== difficultyFilter) return false;
      if (!s) return true;
      return (
        q.text.toLowerCase().includes(s) ||
        q.subject.toLowerCase().includes(s) ||
        q.chapter.toLowerCase().includes(s) ||
        q.tags.some((tg) => tg.toLowerCase().includes(s))
      );
    });
  }, [activeList, search, typeFilter, subjectFilter, chapterFilter, difficultyFilter]);

  const resetForm = () => {
    setEditingId(null);
    setQType('mcq');
    setQText('');
    setQSubject('');
    setQChapter('');
    setQDifficulty('medium');
    setQTags('');
    setQImageUrl('');
    setQImageValid(null);
    setQOptions(['', '', '', '']);
    setQPairs([
      { left: '', right: '' },
      { left: '', right: '' },
    ]);
    setQItems(['', '', '']);
    setQCorrectText('');
    setQExplanation('');
  };

  const openEditQuestion = (q: Question) => {
    const ak = answerKeys[q.id];
    setEditingId(q.id);
    setQType(q.type);
    setQText(q.text);
    setQSubject(q.subject);
    setQChapter(q.chapter);
    setQDifficulty(q.difficulty);
    setQTags((q.tags || []).join(', '));
    setQImageUrl(q.imageUrl || '');
    setQImageValid(q.imageUrl ? Boolean(q.imageUrlValid) : null);
    setQOptions(q.options && q.options.length > 0 ? q.options : ['', '', '', '']);
    setQPairs(
      q.pairs && q.pairs.length > 0
        ? q.pairs
        : [
            { left: '', right: '' },
            { left: '', right: '' },
          ]
    );
    setQItems(q.items && q.items.length > 0 ? q.items : ['', '', '']);
    setQCorrectText(
      ak?.correctAnswer !== undefined
        ? Array.isArray(ak.correctAnswer)
          ? ak.correctAnswer.join(' | ')
          : typeof ak.correctAnswer === 'object'
            ? ''
            : String(ak.correctAnswer)
        : ''
    );
    setQExplanation(ak?.explanation || '');
    setFormOpen(true);
  };

  const handleValidateImage = async () => {
    const normalized = normalizeImageUrl(qImageUrl);
    setQImageUrl(normalized);
    if (!normalized) {
      setQImageValid(null);
      return;
    }
    setValidatingImg(true);
    const ok = await validateImageLoads(normalized);
    setQImageValid(ok);
    setValidatingImg(false);
    showToast(ok ? 'Image loaded successfully' : 'Image failed to load', ok ? 'success' : 'error');
  };

  const handleSaveQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!db || !teacherId) return;

    const normalizedUrl = normalizeImageUrl(qImageUrl);
    let imageValid = qImageValid ?? false;
    if (normalizedUrl && qImageValid === null) {
      imageValid = await validateImageLoads(normalizedUrl);
    }

    let correctAnswer: unknown = qCorrectText.trim();
    const cleanOptions = qOptions.map((o) => o.trim()).filter(Boolean);
    const cleanPairs = qPairs.filter((p) => p.left.trim() && p.right.trim());
    const cleanItems = qItems.map((i) => i.trim()).filter(Boolean);

    if (qType === 'mcq' && cleanOptions.length < 2) {
      showToast('Provide at least 2 MCQ options', 'error');
      return;
    }
    if (qType === 'truefalse') {
      if (!qCorrectText) correctAnswer = 'True';
    }
    if (qType === 'matching') {
      if (cleanPairs.length < 2) {
        showToast('Provide at least 2 matching pairs', 'error');
        return;
      }
      const map: Record<string, string> = {};
      cleanPairs.forEach((p) => {
        map[p.left.trim()] = p.right.trim();
      });
      correctAnswer = map;
    }
    if (qType === 'ordering') {
      if (cleanItems.length < 2) {
        showToast('Provide at least 2 ordering items', 'error');
        return;
      }
      // Correct sequence is the items entered in order
      correctAnswer = cleanItems;
    }

    setSaving(true);
    try {
      const payload = {
        ownerType: 'teacher' as const,
        ownerId: teacherId,
        teacherId,
        type: qType,
        text: qText.trim(),
        imageUrl: normalizedUrl || '',
        imageUrlValid: normalizedUrl ? imageValid : false,
        options: qType === 'mcq' ? cleanOptions : qType === 'truefalse' ? ['True', 'False'] : [],
        pairs: qType === 'matching' ? cleanPairs : [],
        items: qType === 'ordering' ? cleanItems : [],
        subject: qSubject.trim(),
        chapter: qChapter.trim() || 'General',
        difficulty: qDifficulty,
        tags: qTags
          .split(',')
          .map((tItem) => tItem.trim())
          .filter(Boolean),
        updatedAt: serverTimestamp(),
      };

      let targetId = editingId;
      if (editingId) {
        await setDoc(doc(db, 'questions', editingId), payload, { merge: true });
      } else {
        const ref = await addDoc(collection(db, 'questions'), {
          ...payload,
          createdAt: serverTimestamp(),
        });
        targetId = ref.id;
      }

      if (targetId) {
        await setDoc(doc(db, 'questions', targetId, 'private', 'answerKey'), {
          correctAnswer,
          explanation: qExplanation.trim(),
          updatedAt: serverTimestamp(),
        });
      }

      setFormOpen(false);
      resetForm();
      showToast('Question saved', 'success');
      await loadLibrary();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleImportPlatformQuestion = async (q: Question) => {
    if (!db || !teacherId) return;
    try {
      const ak = answerKeys[q.id];
      const newRef = await addDoc(collection(db, 'questions'), {
        ownerType: 'teacher',
        ownerId: teacherId,
        teacherId,
        type: q.type,
        text: q.text,
        imageUrl: q.imageUrl || '',
        imageUrlValid: Boolean(q.imageUrlValid),
        options: q.options || [],
        pairs: q.pairs || [],
        items: q.items || [],
        subject: q.subject,
        chapter: q.chapter,
        difficulty: q.difficulty,
        tags: q.tags || [],
        sourceId: q.id,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      if (ak) {
        await setDoc(doc(db, 'questions', newRef.id, 'private', 'answerKey'), {
          correctAnswer: ak.correctAnswer,
          explanation: ak.explanation || '',
          updatedAt: serverTimestamp(),
        });
      }
      showToast('Imported independent copy to My Library', 'success');
      await loadLibrary();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Import failed', 'error');
    }
  };

  const handleDeleteQuestion = async (q: Question) => {
    if (!db) return;
    try {
      await deleteDoc(doc(db, 'questions', q.id, 'private', 'answerKey'));
      await deleteDoc(doc(db, 'questions', q.id));
      showToast('Question deleted', 'info');
      await loadLibrary();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Delete failed', 'error');
    }
  };

  const handleDownloadTemplate = (fmt: 'csv' | 'json') => {
    const content = fmt === 'csv' ? SAMPLE_CSV_TEMPLATE : SAMPLE_JSON_TEMPLATE;
    const blob = new Blob([content], {
      type: fmt === 'csv' ? 'text/csv;charset=utf-8;' : 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nano_questions_template.${fmt}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleParseBulk = () => {
    const report = parseBulkQuestions(bulkRaw, bulkFormat);
    setBulkReport(report);
  };

  const handleCommitBulk = async () => {
    if (!db || !teacherId || !bulkReport || bulkReport.valid.length === 0) return;
    setBulkImporting(true);
    try {
      for (const item of bulkReport.valid) {
        const normalizedUrl = item.imageUrl ? normalizeImageUrl(item.imageUrl) : '';
        const imgOk = normalizedUrl ? await validateImageLoads(normalizedUrl, 4000) : false;

        const qRef = await addDoc(collection(db, 'questions'), {
          ownerType: 'teacher',
          ownerId: teacherId,
          teacherId,
          type: item.type,
          text: item.text,
          imageUrl: normalizedUrl,
          imageUrlValid: imgOk,
          options: item.options || [],
          pairs: item.pairs || [],
          items: item.items || [],
          subject: item.subject,
          chapter: item.chapter,
          difficulty: item.difficulty,
          tags: item.tags,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        await setDoc(doc(db, 'questions', qRef.id, 'private', 'answerKey'), {
          correctAnswer: item.correctAnswer,
          explanation: item.explanation || '',
          updatedAt: serverTimestamp(),
        });
      }
      showToast(`Imported ${bulkReport.valid.length} questions`, 'success');
      setBulkOpen(false);
      setBulkRaw('');
      setBulkReport(null);
      await loadLibrary();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Bulk import failed', 'error');
    } finally {
      setBulkImporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            {t.nanoLibrary.title}
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {t.nanoLibrary.subtitle}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="secondary" onClick={() => setBulkOpen(true)}>
            <Upload className="w-4 h-4" />
            <span>{t.nanoLibrary.bulkImport}</span>
          </Button>
          <Button
            onClick={() => {
              resetForm();
              setFormOpen(true);
            }}
          >
            <Plus className="w-4 h-4" />
            <span>{t.nanoLibrary.addQuestion}</span>
          </Button>
        </div>
      </div>

      {/* Tabs + Filters */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="inline-flex p-1 rounded-xl bg-slate-200/70 dark:bg-slate-800/80 w-fit">
          <button
            type="button"
            onClick={() => setTab('my')}
            className={`px-4 py-2 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
              tab === 'my'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            {t.nanoLibrary.myLibraryTab} ({myQuestions.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('platform')}
            className={`px-4 py-2 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
              tab === 'platform'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            {t.nanoLibrary.platformTab} ({platformQuestions.length})
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-56">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t.common.search}
              className={`${inputClass} pl-9 py-2 text-xs`}
            />
          </div>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as 'all' | QuestionType)}
            className={`${inputClass} w-auto py-2 text-xs`}
          >
            <option value="all">All Types</option>
            <option value="mcq">MCQ</option>
            <option value="truefalse">True / False</option>
            <option value="matching">Matching</option>
            <option value="fillblank">Fill Blank</option>
            <option value="ordering">Ordering</option>
          </select>
          <select
            value={subjectFilter}
            onChange={(e) => {
              setSubjectFilter(e.target.value);
              setChapterFilter('all');
            }}
            className={`${inputClass} w-auto py-2 text-xs`}
          >
            <option value="all">All Subjects</option>
            {subjects.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            value={chapterFilter}
            onChange={(e) => setChapterFilter(e.target.value)}
            className={`${inputClass} w-auto py-2 text-xs`}
          >
            <option value="all">All Chapters</option>
            {chapters.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            value={difficultyFilter}
            onChange={(e) => setDifficultyFilter(e.target.value as 'all' | QuestionDifficulty)}
            className={`${inputClass} w-auto py-2 text-xs`}
          >
            <option value="all">All Difficulty</option>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </div>
      </div>

      {/* Question List */}
      {loading ? (
        <SkeletonRows rows={4} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Library className="w-6 h-6" />}
          title={t.nanoLibrary.emptyTitle}
          description={t.nanoLibrary.emptyDesc}
          action={
            tab === 'my' ? (
              <Button
                onClick={() => {
                  resetForm();
                  setFormOpen(true);
                }}
              >
                <Plus className="w-4 h-4" />
                <span>{t.nanoLibrary.addQuestion}</span>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((q) => (
            <SurfaceCard key={q.id} className="p-5">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-slate-500 dark:text-slate-400 mb-1.5">
                    <span className="uppercase font-semibold text-indigo-600 dark:text-indigo-400">
                      {q.type}
                    </span>
                    <span aria-hidden="true"> · </span>
                    <span>{q.subject}</span>
                    <span aria-hidden="true"> · </span>
                    <span>{q.chapter}</span>
                    <span aria-hidden="true"> · </span>
                    <span className="capitalize">{q.difficulty}</span>
                    {q.sourceId && (
                      <>
                        <span aria-hidden="true"> · </span>
                        <span>Imported copy</span>
                      </>
                    )}
                  </div>

                  <div className="text-sm sm:text-base font-medium text-slate-900 dark:text-slate-100 leading-relaxed">
                    <MathText text={q.text} />
                  </div>

                  {q.imageUrl && (
                    <div className="mt-3">
                      {q.imageUrlValid ? (
                        <img
                          src={q.imageUrl}
                          alt="Question attachment"
                          referrerPolicy="no-referrer"
                          className="max-h-44 rounded-xl border border-slate-200 dark:border-slate-800 object-contain"
                        />
                      ) : (
                        <p className="text-xs text-amber-600">
                          Image URL attached (could not verify load)
                        </p>
                      )}
                    </div>
                  )}

                  {q.tags && q.tags.length > 0 && (
                    <p className="text-xs text-slate-400 mt-2">
                      Tags: {q.tags.join(' · ')}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {tab === 'platform' ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => handleImportPlatformQuestion(q)}
                    >
                      <CopyPlus className="w-3.5 h-3.5" />
                      <span>{t.nanoLibrary.importCopy}</span>
                    </Button>
                  ) : (
                    <>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => openEditQuestion(q)}
                      >
                        {t.common.edit}
                      </Button>
                      <button
                        type="button"
                        onClick={() => handleDeleteQuestion(q)}
                        className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                        aria-label={t.common.delete}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </SurfaceCard>
          ))}
        </div>
      )}

      {/* Question Authoring Modal with Live KaTeX Preview */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editingId ? 'Edit Question' : t.nanoLibrary.addQuestion}
        maxWidth="max-w-3xl"
      >
        <form onSubmit={handleSaveQuestion} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label className={labelClass}>Type *</label>
              <select
                value={qType}
                onChange={(e) => setQType(e.target.value as QuestionType)}
                className={inputClass}
              >
                <option value="mcq">MCQ</option>
                <option value="truefalse">True / False</option>
                <option value="matching">Matching</option>
                <option value="fillblank">Fill Blank</option>
                <option value="ordering">Ordering</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>{t.common.subject} *</label>
              <input
                type="text"
                required
                value={qSubject}
                onChange={(e) => setQSubject(e.target.value)}
                placeholder="Mathematics"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Chapter</label>
              <input
                type="text"
                value={qChapter}
                onChange={(e) => setQChapter(e.target.value)}
                placeholder="Calculus"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Difficulty</label>
              <select
                value={qDifficulty}
                onChange={(e) => setQDifficulty(e.target.value as QuestionDifficulty)}
                className={inputClass}
              >
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Question Text (supports $LaTeX$) *</label>
              <textarea
                rows={4}
                required
                value={qText}
                onChange={(e) => setQText(e.target.value)}
                placeholder="Evaluate $\int_0^1 x^2\,dx$."
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Live KaTeX Preview</label>
              <div className="min-h-[106px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-950 p-3.5 text-sm">
                {qText ? (
                  <MathText text={qText} />
                ) : (
                  <span className="text-slate-400">Preview renders here...</span>
                )}
              </div>
            </div>
          </div>

          {/* Image URL + Google Drive normalization */}
          <div>
            <label className={labelClass}>
              Image URL (Direct URL or Google Drive share link)
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <ImageIcon className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="url"
                  value={qImageUrl}
                  onChange={(e) => {
                    setQImageUrl(e.target.value);
                    setQImageValid(null);
                  }}
                  placeholder="https://drive.google.com/file/d/.../view?usp=sharing"
                  className={`${inputClass} pl-10`}
                />
              </div>
              <Button
                type="button"
                variant="secondary"
                onClick={handleValidateImage}
                disabled={validatingImg || !qImageUrl.trim()}
              >
                {validatingImg ? 'Checking...' : t.nanoLibrary.validateImage}
              </Button>
            </div>
            {qImageValid !== null && (
              <div className="mt-2 flex items-center gap-2 text-xs">
                {qImageValid ? (
                  <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Image verified and loadable
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400">
                    <XCircle className="w-3.5 h-3.5" /> Image could not be loaded (check sharing permissions)
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Type-specific fields */}
          {qType === 'mcq' && (
            <div className="space-y-3">
              <label className={labelClass}>Options & Correct Answer *</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {qOptions.map((opt, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="mcq_correct"
                      checked={qCorrectText !== '' && qCorrectText === opt}
                      onChange={() => setQCorrectText(opt)}
                      aria-label={`Mark option ${idx + 1} as correct`}
                      className="accent-indigo-600"
                    />
                    <input
                      type="text"
                      value={opt}
                      onChange={(e) => {
                        const next = [...qOptions];
                        const oldVal = next[idx];
                        next[idx] = e.target.value;
                        setQOptions(next);
                        if (qCorrectText === oldVal) setQCorrectText(e.target.value);
                      }}
                      placeholder={`Option ${idx + 1}`}
                      className={inputClass}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {qType === 'truefalse' && (
            <div>
              <label className={labelClass}>Correct Answer *</label>
              <select
                value={qCorrectText || 'True'}
                onChange={(e) => setQCorrectText(e.target.value)}
                className={inputClass}
              >
                <option value="True">True</option>
                <option value="False">False</option>
              </select>
            </div>
          )}

          {qType === 'fillblank' && (
            <div>
              <label className={labelClass}>Expected Exact Answer *</label>
              <input
                type="text"
                required
                value={qCorrectText}
                onChange={(e) => setQCorrectText(e.target.value)}
                placeholder="e.g. Au"
                className={inputClass}
              />
            </div>
          )}

          {qType === 'matching' && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <label className={labelClass}>Matching Pairs (Left &rarr; Right) *</label>
                <button
                  type="button"
                  onClick={() => setQPairs((p) => [...p, { left: '', right: '' }])}
                  className="text-xs font-medium text-indigo-600 hover:underline"
                >
                  + Add Pair
                </button>
              </div>
              {qPairs.map((pair, idx) => (
                <div key={idx} className="grid grid-cols-2 gap-2.5">
                  <input
                    type="text"
                    value={pair.left}
                    onChange={(e) => {
                      const next = [...qPairs];
                      next[idx] = { ...pair, left: e.target.value };
                      setQPairs(next);
                    }}
                    placeholder={`Prompt ${idx + 1}`}
                    className={inputClass}
                  />
                  <input
                    type="text"
                    value={pair.right}
                    onChange={(e) => {
                      const next = [...qPairs];
                      next[idx] = { ...pair, right: e.target.value };
                      setQPairs(next);
                    }}
                    placeholder={`Match ${idx + 1}`}
                    className={inputClass}
                  />
                </div>
              ))}
            </div>
          )}

          {qType === 'ordering' && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <label className={labelClass}>
                  Items in Correct Order (shuffled automatically for students) *
                </label>
                <button
                  type="button"
                  onClick={() => setQItems((it) => [...it, ''])}
                  className="text-xs font-medium text-indigo-600 hover:underline"
                >
                  + Add Step
                </button>
              </div>
              {qItems.map((item, idx) => (
                <input
                  key={idx}
                  type="text"
                  value={item}
                  onChange={(e) => {
                    const next = [...qItems];
                    next[idx] = e.target.value;
                    setQItems(next);
                  }}
                  placeholder={`Step ${idx + 1}`}
                  className={inputClass}
                />
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Tags (comma separated)</label>
              <input
                type="text"
                value={qTags}
                onChange={(e) => setQTags(e.target.value)}
                placeholder="algebra, board-exam"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Solution Explanation (shown after submit)</label>
              <input
                type="text"
                value={qExplanation}
                onChange={(e) => setQExplanation(e.target.value)}
                placeholder="Step-by-step hint..."
                className={inputClass}
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => setFormOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? t.common.loading : t.common.save}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Bulk Import Modal */}
      <Modal
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        title={t.nanoLibrary.bulkImport}
        subtitle="Download a template, paste CSV or JSON data, review row-level validation, then import."
        maxWidth="max-w-3xl"
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex p-1 rounded-xl bg-slate-200/70 dark:bg-slate-800">
              {(['csv', 'json'] as const).map((fmt) => (
                <button
                  key={fmt}
                  type="button"
                  onClick={() => {
                    setBulkFormat(fmt);
                    setBulkReport(null);
                  }}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg uppercase ${
                    bulkFormat === fmt
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {fmt}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="secondary" onClick={() => handleDownloadTemplate('csv')}>
                <Download className="w-3.5 h-3.5" />
                <span>CSV Template</span>
              </Button>
              <Button size="sm" variant="secondary" onClick={() => handleDownloadTemplate('json')}>
                <Download className="w-3.5 h-3.5" />
                <span>JSON Template</span>
              </Button>
            </div>
          </div>

          <textarea
            rows={8}
            value={bulkRaw}
            onChange={(e) => {
              setBulkRaw(e.target.value);
              setBulkReport(null);
            }}
            placeholder={
              bulkFormat === 'csv'
                ? 'Paste CSV rows including header...'
                : 'Paste JSON array of question objects...'
            }
            className={`${inputClass} font-mono-num text-xs`}
          />

          {bulkReport && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-2 text-xs">
              <p className="font-semibold text-slate-900 dark:text-slate-100">
                Validation Report: {bulkReport.valid.length} valid · {bulkReport.errors.length} errors
              </p>
              {bulkReport.errors.length > 0 && (
                <ul className="space-y-1 text-rose-600 dark:text-rose-400 max-h-32 overflow-y-auto">
                  {bulkReport.errors.map((err, i) => (
                    <li key={i}>
                      Row {err.row}: {err.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={handleParseBulk} disabled={!bulkRaw.trim()}>
              Validate Rows
            </Button>
            <Button
              onClick={handleCommitBulk}
              disabled={!bulkReport || bulkReport.valid.length === 0 || bulkImporting}
            >
              {bulkImporting
                ? 'Importing...'
                : `Import ${bulkReport?.valid.length || 0} Valid Questions`}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
