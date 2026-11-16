import React, { useCallback, useEffect, useState } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { Edit2, ExternalLink, MessageSquare, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { db } from '../../lib/firebase';
import { sortNewestFirst } from '../../lib/firestoreSort';
import { useAuth } from '../auth/AuthContext';
import { useI18n } from '../../i18n/I18nContext';
import { useStudentsData } from '../students/useStudentsData';
import { buildWhatsAppUrl, fillMessagePlaceholders, getMonthISO } from '../../lib/formatters';
import type {
  AttendanceSummary,
  MessageCategory,
  MessageTemplate,
  OfflineResult,
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
import { useToast } from '../../components/ui/Toast';

const DEFAULT_TEMPLATES: Array<{
  category: MessageCategory;
  title: string;
  body: string;
}> = [
  {
    category: 'attendance',
    title: 'Monthly Attendance Summary',
    body: 'Assalamu Alaikum {guardianName},\n\nAttendance update for {studentName} ({class}):\n• Present: {presentDays} days\n• Absent: {absentDays} days\n• Total Classes: {totalDays}\n\nThank you,\n{brandName}',
  },
  {
    category: 'result',
    title: 'Exam Result Update',
    body: 'Assalamu Alaikum {guardianName},\n\n{studentName} ({class}) scored {marks} in "{examTitle}".\nPlease encourage regular practice at home.\n\nRegards,\n{brandName}',
  },
  {
    category: 'notice',
    title: 'Class Schedule Notice',
    body: 'Assalamu Alaikum {guardianName},\n\nPlease note that {studentName}\'s next class for {class} will follow the updated schedule. Kindly ensure homework is completed beforehand.\n\nRegards,\n{brandName}',
  },
  {
    category: 'payment',
    title: 'Tuition Fee Reminder',
    body: 'Assalamu Alaikum {guardianName},\n\nThis is a gentle reminder regarding {studentName}\'s monthly tuition fee for {class}. Please let us know once completed.\n\nThank you,\n{brandName}',
  },
];

export function MessagesPage() {
  const { userProfile, teacherProfile } = useAuth();
  const { t } = useI18n();
  const { showToast } = useToast();
  const teacherId = userProfile?.uid || '';
  const { items: students } = useStudentsData();

  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [summaries, setSummaries] = useState<AttendanceSummary[]>([]);
  const [results, setResults] = useState<OfflineResult[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [messageText, setMessageText] = useState('');

  // Create / Edit Template Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<MessageTemplate | null>(null);
  const [tplTitle, setTplTitle] = useState('');
  const [tplCategory, setTplCategory] = useState<MessageCategory>('attendance');
  const [tplBody, setTplBody] = useState('');
  const [saving, setSaving] = useState(false);

  const applyTemplateForStudent = useCallback(
    (studentId: string, templateBody: string) => {
      const item = students.find((s) => s.student.id === studentId);
      const month = getMonthISO();
      const sum = studentId
        ? summaries.find((s) => s.studentId === studentId && s.month === month)
        : undefined;
      const latestRes = studentId
        ? results.find((r) => r.studentId === studentId)
        : undefined;

      const filled = fillMessagePlaceholders(templateBody, {
        studentName: item?.student.name || 'Student',
        guardianName: item?.student.guardianName || 'Guardian',
        class: item?.relationship.class || 'Class',
        presentDays: sum?.present ?? 0,
        absentDays: sum?.absent ?? 0,
        totalDays: sum?.total ?? 0,
        attendance: sum ? `${sum.present}/${sum.total}` : '0/0',
        marks: latestRes ? `${latestRes.marksObtained}/${latestRes.totalMarks}` : 'N/A',
        examTitle: latestRes?.examTitle || 'Recent Exam',
        brandName: teacherProfile?.brandName || 'ShikkhaDesk',
      });
      setMessageText(filled);
    },
    [students, summaries, results, teacherProfile]
  );

  const seedDefaultTemplates = useCallback(async () => {
    if (!db || !teacherId) return [];
    const created: MessageTemplate[] = [];
    for (const tpl of DEFAULT_TEMPLATES) {
      const ref = await addDoc(collection(db, 'messageTemplates'), {
        teacherId,
        category: tpl.category,
        title: tpl.title,
        body: tpl.body,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      created.push({
        id: ref.id,
        teacherId,
        category: tpl.category,
        title: tpl.title,
        body: tpl.body,
      });
    }
    return created;
  }, [teacherId]);

  const loadAll = useCallback(async () => {
    if (!db || !teacherId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [tplSnap, sumSnap, resSnap] = await Promise.all([
        getDocs(query(collection(db, 'messageTemplates'), where('teacherId', '==', teacherId))),
        getDocs(query(collection(db, 'attendanceSummaries'), where('teacherId', '==', teacherId))),
        getDocs(query(collection(db, 'offlineResults'), where('teacherId', '==', teacherId))),
      ]);

      let loadedTemplates = sortNewestFirst(
        tplSnap.docs.map((d) => ({ id: d.id, ...d.data() } as MessageTemplate)),
        (tpl) => tpl.createdAt
      );

      // Seed default formatted templates automatically on first visit if none exist
      const seedKey = `shikkha_tpl_seeded_${teacherId}`;
      if (loadedTemplates.length === 0 && !localStorage.getItem(seedKey)) {
        try {
          loadedTemplates = await seedDefaultTemplates();
          localStorage.setItem(seedKey, '1');
        } catch {
          // Fall back to in-memory default formatted templates if Firestore write is unavailable
          loadedTemplates = DEFAULT_TEMPLATES.map((tpl, idx) => ({
            id: `default_${idx}`,
            teacherId,
            category: tpl.category,
            title: tpl.title,
            body: tpl.body,
          }));
        }
      }

      if (loadedTemplates.length === 0) {
        loadedTemplates = DEFAULT_TEMPLATES.map((tpl, idx) => ({
          id: `default_${idx}`,
          teacherId,
          category: tpl.category,
          title: tpl.title,
          body: tpl.body,
        }));
      }

      setTemplates(loadedTemplates);
      setSummaries(sumSnap.docs.map((d) => ({ id: d.id, ...d.data() } as AttendanceSummary)));
      setResults(
        sortNewestFirst(
          resSnap.docs.map((d) => ({ id: d.id, ...d.data() } as OfflineResult)),
          (r) => r.publishedAt || r.updatedAt
        )
      );

      // Select first template by default if none selected
      if (loadedTemplates.length > 0) {
        setSelectedTemplateId((prev) =>
          prev && loadedTemplates.some((item) => item.id === prev) ? prev : loadedTemplates[0].id
        );
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load templates', 'error');
      const fallbackTemplates: MessageTemplate[] = DEFAULT_TEMPLATES.map((tpl, idx) => ({
        id: `default_${idx}`,
        teacherId,
        category: tpl.category,
        title: tpl.title,
        body: tpl.body,
      }));
      setTemplates(fallbackTemplates);
      setSelectedTemplateId((prev) => prev || fallbackTemplates[0].id);
    } finally {
      setLoading(false);
    }
  }, [teacherId, seedDefaultTemplates, showToast]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Auto-select first active student when students arrive and refresh formatted message preview
  useEffect(() => {
    const active = students.filter((s) => s.relationship.status !== 'archived');
    if (!selectedStudentId && active.length > 0) {
      setSelectedStudentId(active[0].student.id);
    }
  }, [students, selectedStudentId]);

  useEffect(() => {
    const activeTpl = templates.find((tpl) => tpl.id === selectedTemplateId) || templates[0];
    if (activeTpl) {
      applyTemplateForStudent(selectedStudentId, activeTpl.body);
    } else if (DEFAULT_TEMPLATES.length > 0) {
      applyTemplateForStudent(selectedStudentId, DEFAULT_TEMPLATES[0].body);
    }
  }, [selectedTemplateId, selectedStudentId, templates, applyTemplateForStudent]);

  const openNewTemplate = () => {
    setEditingTemplate(null);
    setTplTitle('');
    setTplCategory('attendance');
    setTplBody(DEFAULT_TEMPLATES[0].body);
    setModalOpen(true);
  };

  const openEditTemplate = (tpl: MessageTemplate) => {
    setEditingTemplate(tpl);
    setTplTitle(tpl.title);
    setTplCategory(tpl.category);
    setTplBody(tpl.body);
    setModalOpen(true);
  };

  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!db || !teacherId) return;
    setSaving(true);
    try {
      if (editingTemplate && !editingTemplate.id.startsWith('default_')) {
        await updateDoc(doc(db, 'messageTemplates', editingTemplate.id), {
          category: tplCategory,
          title: tplTitle.trim(),
          body: tplBody.trim(),
          updatedAt: serverTimestamp(),
        });
        showToast('Template updated', 'success');
      } else {
        const ref = await addDoc(collection(db, 'messageTemplates'), {
          teacherId,
          category: tplCategory,
          title: tplTitle.trim(),
          body: tplBody.trim(),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        setSelectedTemplateId(ref.id);
        showToast('Template saved', 'success');
      }
      setModalOpen(false);
      await loadAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleRestoreDefaults = async () => {
    if (!db || !teacherId) return;
    try {
      await seedDefaultTemplates();
      showToast('Default formatted templates added', 'success');
      await loadAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not restore defaults', 'error');
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    if (!db) return;
    if (id.startsWith('default_')) {
      setTemplates((prev) => prev.filter((item) => item.id !== id));
      if (selectedTemplateId === id) setSelectedTemplateId('');
      return;
    }
    try {
      await deleteDoc(doc(db, 'messageTemplates', id));
      if (selectedTemplateId === id) setSelectedTemplateId('');
      await loadAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Delete failed', 'error');
    }
  };

  const selectedStudent = students.find((s) => s.student.id === selectedStudentId);
  const guardianPhone =
    selectedStudent?.student.guardianPhone || selectedStudent?.student.phone || '';
  const waUrl = buildWhatsAppUrl(guardianPhone, messageText);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            {t.messages.title}
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {t.messages.subtitle}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={handleRestoreDefaults}>
            <RotateCcw className="w-4 h-4" />
            <span>Restore Defaults</span>
          </Button>
          <Button onClick={openNewTemplate}>
            <Plus className="w-4 h-4" />
            <span>{t.messages.newTemplate}</span>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Templates List */}
        <SurfaceCard className="lg:col-span-5 p-5">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-4">
            {t.messages.templates}
          </h3>
          {loading ? (
            <SkeletonRows rows={3} />
          ) : templates.length === 0 ? (
            <EmptyState
              icon={<MessageSquare className="w-5 h-5" />}
              title="No templates yet"
              description="Restore default formatted templates or create a custom message template."
              action={
                <Button size="sm" variant="secondary" onClick={handleRestoreDefaults}>
                  Restore Default Templates
                </Button>
              }
            />
          ) : (
            <div className="space-y-2.5">
              {templates.map((tpl) => (
                <div
                  key={tpl.id}
                  onClick={() => {
                    setSelectedTemplateId(tpl.id);
                    applyTemplateForStudent(selectedStudentId, tpl.body);
                  }}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-colors ${
                    selectedTemplateId === tpl.id
                      ? 'border-indigo-500 bg-indigo-50/60 dark:bg-indigo-950/40'
                      : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                        {tpl.title}
                      </p>
                      <p className="text-xs text-slate-400 capitalize">{tpl.category}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openEditTemplate(tpl);
                        }}
                        className="p-1 text-slate-400 hover:text-indigo-600"
                        aria-label={t.common.edit}
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteTemplate(tpl.id);
                        }}
                        className="p-1 text-slate-400 hover:text-rose-600"
                        aria-label={t.common.delete}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-2 whitespace-pre-line line-clamp-2">
                    {tpl.body}
                  </p>
                </div>
              ))}
            </div>
          )}
        </SurfaceCard>

        {/* WhatsApp Composer */}
        <SurfaceCard className="lg:col-span-7 p-5 space-y-4">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {t.messages.composer}
          </h3>

          <div>
            <label className={labelClass}>Select Student / Guardian</label>
            <select
              value={selectedStudentId}
              onChange={(e) => {
                const sid = e.target.value;
                setSelectedStudentId(sid);
                const tpl = templates.find((item) => item.id === selectedTemplateId);
                if (tpl) applyTemplateForStudent(sid, tpl.body);
              }}
              className={inputClass}
            >
              <option value="">Choose a student...</option>
              {students
                .filter((s) => s.relationship.status !== 'archived')
                .map((s) => (
                  <option key={s.student.id} value={s.student.id}>
                    {s.student.name} — Guardian: {s.student.guardianName || 'N/A'} (
                    {s.student.guardianPhone || 'No phone'})
                  </option>
                ))}
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                Editable Formatted Message Preview
              </label>
              <button
                type="button"
                onClick={() => {
                  const activeTpl =
                    templates.find((tpl) => tpl.id === selectedTemplateId) || templates[0];
                  applyTemplateForStudent(
                    selectedStudentId,
                    activeTpl?.body || DEFAULT_TEMPLATES[0].body
                  );
                }}
                className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                Re-apply template
              </button>
            </div>
            <textarea
              rows={7}
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              placeholder="Select a template or type your message to the guardian..."
              className={inputClass}
            />
            <p className="text-[11px] text-slate-400 mt-1.5">
              Placeholders: {'{studentName}'}, {'{guardianName}'}, {'{class}'},{' '}
              {'{presentDays}'}, {'{absentDays}'}, {'{totalDays}'}, {'{attendance}'},{' '}
              {'{marks}'}, {'{examTitle}'}, {'{brandName}'}
            </p>
          </div>

          <div className="flex items-center justify-between gap-3 pt-2">
            <span className="text-xs font-mono-num text-slate-500">
              To: {guardianPhone || 'No phone selected'}
            </span>
            <a
              href={messageText.trim() ? waUrl : undefined}
              target="_blank"
              rel="noopener noreferrer"
              aria-disabled={!messageText.trim()}
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                messageText.trim()
                  ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                  : 'bg-slate-200 dark:bg-slate-800 text-slate-400 pointer-events-none'
              }`}
            >
              <span>{t.messages.openWhatsApp}</span>
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        </SurfaceCard>
      </div>

      {/* New / Edit Template Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingTemplate ? 'Edit Template' : t.messages.newTemplate}
      >
        <form onSubmit={handleSaveTemplate} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Template Title *</label>
              <input
                type="text"
                required
                value={tplTitle}
                onChange={(e) => setTplTitle(e.target.value)}
                placeholder="Monthly Attendance Update"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Category</label>
              <select
                value={tplCategory}
                onChange={(e) => setTplCategory(e.target.value as MessageCategory)}
                className={inputClass}
              >
                <option value="attendance">Attendance</option>
                <option value="result">Result</option>
                <option value="notice">Notice</option>
                <option value="payment">Payment</option>
                <option value="custom">Custom</option>
              </select>
            </div>
          </div>

          <div>
            <label className={labelClass}>Template Body *</label>
            <textarea
              rows={5}
              required
              value={tplBody}
              onChange={(e) => setTplBody(e.target.value)}
              className={inputClass}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? t.common.loading : t.common.save}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
