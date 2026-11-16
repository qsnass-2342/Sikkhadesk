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
  where,
} from 'firebase/firestore';
import { ExternalLink, MessageSquare, Plus, Trash2 } from 'lucide-react';
import { db } from '../../lib/firebase';
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

  const [modalOpen, setModalOpen] = useState(false);
  const [tplTitle, setTplTitle] = useState('');
  const [tplCategory, setTplCategory] = useState<MessageCategory>('attendance');
  const [tplBody, setTplBody] = useState(
    'Assalamu Alaikum {guardianName}, {studentName} attended {presentDays}/{totalDays} classes this month. — {brandName}'
  );
  const [saving, setSaving] = useState(false);

  const loadAll = useCallback(async () => {
    if (!db || !teacherId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [tplSnap, sumSnap, resSnap] = await Promise.all([
        getDocs(
          query(
            collection(db, 'messageTemplates'),
            where('teacherId', '==', teacherId),
            orderBy('createdAt', 'desc')
          )
        ),
        getDocs(
          query(collection(db, 'attendanceSummaries'), where('teacherId', '==', teacherId))
        ),
        getDocs(
          query(
            collection(db, 'offlineResults'),
            where('teacherId', '==', teacherId),
            orderBy('publishedAt', 'desc')
          )
        ),
      ]);
      setTemplates(tplSnap.docs.map((d) => ({ id: d.id, ...d.data() } as MessageTemplate)));
      setSummaries(sumSnap.docs.map((d) => ({ id: d.id, ...d.data() } as AttendanceSummary)));
      setResults(resSnap.docs.map((d) => ({ id: d.id, ...d.data() } as OfflineResult)));
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load templates', 'error');
    } finally {
      setLoading(false);
    }
  }, [teacherId, showToast]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const applyTemplateForStudent = (studentId: string, templateBody: string) => {
    const item = students.find((s) => s.student.id === studentId);
    if (!item) {
      setMessageText(templateBody);
      return;
    }
    const month = getMonthISO();
    const sum = summaries.find((s) => s.studentId === studentId && s.month === month);
    const latestRes = results.find((r) => r.studentId === studentId);

    const filled = fillMessagePlaceholders(templateBody, {
      studentName: item.student.name,
      guardianName: item.student.guardianName || 'Guardian',
      class: item.relationship.class || '',
      presentDays: sum?.present ?? 0,
      absentDays: sum?.absent ?? 0,
      totalDays: sum?.total ?? 0,
      attendance: sum ? `${sum.present}/${sum.total}` : '0/0',
      marks: latestRes ? `${latestRes.marksObtained}/${latestRes.totalMarks}` : 'N/A',
      examTitle: latestRes?.examTitle || 'Recent Exam',
      brandName: teacherProfile?.brandName || 'ShikkhaDesk',
    });
    setMessageText(filled);
  };

  const handleCreateTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!db || !teacherId) return;
    setSaving(true);
    try {
      await addDoc(collection(db, 'messageTemplates'), {
        teacherId,
        category: tplCategory,
        title: tplTitle.trim(),
        body: tplBody.trim(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setModalOpen(false);
      setTplTitle('');
      showToast('Template saved', 'success');
      await loadAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    if (!db) return;
    try {
      await deleteDoc(doc(db, 'messageTemplates', id));
      await loadAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Delete failed', 'error');
    }
  };

  const selectedStudent = students.find((s) => s.student.id === selectedStudentId);
  const guardianPhone = selectedStudent?.student.guardianPhone || selectedStudent?.student.phone || '';
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
        <Button onClick={() => setModalOpen(true)}>
          <Plus className="w-4 h-4" />
          <span>{t.messages.newTemplate}</span>
        </Button>
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
              description="Save reusable WhatsApp message templates with {studentName}, {marks}, or {attendance} placeholders."
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
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-2 line-clamp-2">
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
            <label className={labelClass}>Editable Message Preview</label>
            <textarea
              rows={6}
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              placeholder="Select a template or type your message to the guardian..."
              className={inputClass}
            />
            <p className="text-[11px] text-slate-400 mt-1.5">
              Supported placeholders: {'{studentName}'}, {'{guardianName}'}, {'{class}'},{' '}
              {'{attendance}'}, {'{marks}'}, {'{examTitle}'}, {'{brandName}'}
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

      {/* New Template Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={t.messages.newTemplate}
      >
        <form onSubmit={handleCreateTemplate} className="space-y-4">
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
              rows={4}
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
