import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  BookOpen,
  ExternalLink,
  FileText,
  Film,
  Link2,
  Plus,
  Search,
  StickyNote,
  Trash2,
  UserPlus,
} from 'lucide-react';
import { db } from '../../lib/firebase';
import { useAuth } from '../auth/AuthContext';
import { useI18n } from '../../i18n/I18nContext';
import { useStudentsData } from '../students/useStudentsData';
import type { Material, MaterialAssignment, MaterialType } from '../../types';
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
import { formatDate } from '../../lib/formatters';

export function MaterialsPage() {
  const { userProfile } = useAuth();
  const { t, lang } = useI18n();
  const { showToast } = useToast();
  const teacherId = userProfile?.uid || '';
  const { items: students } = useStudentsData();

  const [materials, setMaterials] = useState<Material[]>([]);
  const [assignments, setAssignments] = useState<MaterialAssignment[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('all');

  // Create / Edit modal
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Material | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<MaterialType>('pdf');
  const [url, setUrl] = useState('');
  const [subject, setSubject] = useState('');
  const [saving, setSaving] = useState(false);

  // Assign modal
  const [assignMaterial, setAssignMaterial] = useState<Material | null>(null);
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());
  const [assignBusy, setAssignBusy] = useState(false);

  const loadData = useCallback(async () => {
    if (!db || !teacherId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [mSnap, aSnap] = await Promise.all([
        getDocs(
          query(
            collection(db, 'materials'),
            where('teacherId', '==', teacherId),
            orderBy('createdAt', 'desc')
          )
        ),
        getDocs(
          query(
            collection(db, 'materialAssignments'),
            where('teacherId', '==', teacherId),
            orderBy('assignedAt', 'desc')
          )
        ),
      ]);
      setMaterials(mSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Material)));
      setAssignments(aSnap.docs.map((d) => ({ id: d.id, ...d.data() } as MaterialAssignment)));
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load materials', 'error');
    } finally {
      setLoading(false);
    }
  }, [teacherId, showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const subjects = useMemo(() => {
    const set = new Set(materials.map((m) => m.subject).filter(Boolean));
    return Array.from(set).sort();
  }, [materials]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return materials.filter((m) => {
      if (subjectFilter !== 'all' && m.subject !== subjectFilter) return false;
      if (!q) return true;
      return (
        m.title.toLowerCase().includes(q) ||
        m.subject.toLowerCase().includes(q) ||
        m.description.toLowerCase().includes(q)
      );
    });
  }, [materials, search, subjectFilter]);

  const openCreate = () => {
    setEditing(null);
    setTitle('');
    setDescription('');
    setType('pdf');
    setUrl('');
    setSubject('');
    setFormOpen(true);
  };

  const openEdit = (m: Material) => {
    setEditing(m);
    setTitle(m.title);
    setDescription(m.description);
    setType(m.type);
    setUrl(m.url);
    setSubject(m.subject);
    setFormOpen(true);
  };

  const handleSaveMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!db || !teacherId) return;
    setSaving(true);
    try {
      if (editing) {
        await updateDoc(doc(db, 'materials', editing.id), {
          title: title.trim(),
          description: description.trim(),
          type,
          url: url.trim(),
          subject: subject.trim(),
          updatedAt: serverTimestamp(),
        });
        showToast('Material updated', 'success');
      } else {
        await addDoc(collection(db, 'materials'), {
          teacherId,
          title: title.trim(),
          description: description.trim(),
          type,
          url: url.trim(),
          subject: subject.trim(),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        showToast('Material created', 'success');
      }
      setFormOpen(false);
      await loadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not save material', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (m: Material) => {
    if (!db) return;
    try {
      await deleteDoc(doc(db, 'materials', m.id));
      const related = assignments.filter((a) => a.materialId === m.id);
      await Promise.all(related.map((a) => deleteDoc(doc(db!, 'materialAssignments', a.id))));
      showToast('Material deleted', 'info');
      await loadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Delete failed', 'error');
    }
  };

  const openAssignModal = (m: Material) => {
    setAssignMaterial(m);
    const currentIds = new Set(
      assignments.filter((a) => a.materialId === m.id).map((a) => a.studentId)
    );
    setSelectedStudentIds(currentIds);
  };

  const handleSaveAssignments = async () => {
    if (!db || !teacherId || !assignMaterial) return;
    setAssignBusy(true);
    try {
      const existing = assignments.filter((a) => a.materialId === assignMaterial.id);
      const existingMap = new Map(existing.map((a) => [a.studentId, a]));

      // Add newly selected
      const adds: Promise<unknown>[] = [];
      selectedStudentIds.forEach((studentId) => {
        if (!existingMap.has(studentId)) {
          const rel = students.find((s) => s.student.id === studentId)?.relationship;
          if (rel) {
            adds.push(
              addDoc(collection(db!, 'materialAssignments'), {
                teacherId,
                materialId: assignMaterial.id,
                relationshipId: rel.id,
                studentId,
                assignedAt: serverTimestamp(),
              })
            );
          }
        }
      });

      // Remove unchecked
      const deletes: Promise<unknown>[] = [];
      existing.forEach((a) => {
        if (!selectedStudentIds.has(a.studentId)) {
          deletes.push(deleteDoc(doc(db!, 'materialAssignments', a.id)));
        }
      });

      await Promise.all([...adds, ...deletes]);
      showToast('Material assignments updated', 'success');
      setAssignMaterial(null);
      await loadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to update assignments', 'error');
    } finally {
      setAssignBusy(false);
    }
  };

  const typeIcon = (tType: MaterialType) => {
    if (tType === 'video') return <Film className="w-4 h-4" />;
    if (tType === 'pdf') return <FileText className="w-4 h-4" />;
    if (tType === 'note') return <StickyNote className="w-4 h-4" />;
    return <Link2 className="w-4 h-4" />;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            {t.materials.title}
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {t.materials.subtitle}
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="w-4 h-4" />
          <span>{t.materials.addMaterial}</span>
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t.common.search}
            className={`${inputClass} pl-10`}
          />
        </div>
        <select
          value={subjectFilter}
          onChange={(e) => setSubjectFilter(e.target.value)}
          className={`${inputClass} sm:w-52`}
        >
          <option value="all">{t.common.filterAll} {t.common.subject}</option>
          {subjects.map((subj) => (
            <option key={subj} value={subj}>
              {subj}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <SkeletonRows rows={4} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<BookOpen className="w-6 h-6" />}
          title={t.materials.emptyTitle}
          description={t.materials.emptyDesc}
          action={
            materials.length === 0 ? (
              <Button onClick={openCreate}>
                <Plus className="w-4 h-4" />
                <span>{t.materials.addMaterial}</span>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((m) => {
            const count = assignments.filter((a) => a.materialId === m.id).length;
            return (
              <SurfaceCard key={m.id} className="p-5 flex flex-col justify-between gap-4">
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                        {typeIcon(m.type)}
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 truncate">
                          {m.title}
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          <span>{m.subject || 'General'}</span>
                          <span aria-hidden="true"> · </span>
                          <span className="uppercase">{m.type}</span>
                          <span aria-hidden="true"> · </span>
                          <span className="tabular-nums">{formatDate(m.createdAt, lang)}</span>
                        </p>
                      </div>
                    </div>
                  </div>
                  {m.description && (
                    <p className="text-sm text-slate-600 dark:text-slate-400 mt-3 line-clamp-2">
                      {m.description}
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="secondary" onClick={() => openAssignModal(m)}>
                      <UserPlus className="w-3.5 h-3.5" />
                      <span className="tabular-nums">
                        {t.materials.assignedCount}: {count}
                      </span>
                    </Button>
                    {m.url && (
                      <a
                        href={m.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline px-2 py-1"
                      >
                        <span>Open</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => openEdit(m)}
                      className="text-xs font-medium text-slate-500 hover:text-slate-900 dark:hover:text-white px-2 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      {t.common.edit}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(m)}
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

      {/* Create / Edit Modal */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? t.common.edit : t.materials.addMaterial}
      >
        <form onSubmit={handleSaveMaterial} className="space-y-4">
          <div>
            <label className={labelClass}>Title *</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Calculus Integration Worksheet"
              className={inputClass}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
              <label className={labelClass}>Type *</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as MaterialType)}
                className={inputClass}
              >
                <option value="pdf">PDF</option>
                <option value="video">Video</option>
                <option value="link">Link</option>
                <option value="note">Note</option>
              </select>
            </div>
          </div>

          <div>
            <label className={labelClass}>Resource URL {type === 'note' ? '(optional)' : '*'}</label>
            <input
              type="url"
              required={type !== 'note'}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://drive.google.com/..."
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>Description / Study Notes</label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Instructions or summary notes for students..."
              className={inputClass}
            />
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

      {/* Assign Modal */}
      <Modal
        open={Boolean(assignMaterial)}
        onClose={() => setAssignMaterial(null)}
        title={t.materials.assignStudents}
        subtitle={assignMaterial?.title}
      >
        <div className="space-y-4">
          {students.filter((s) => s.relationship.status !== 'archived').length === 0 ? (
            <p className="text-sm text-slate-500">No active or invited students found.</p>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {students
                .filter((s) => s.relationship.status !== 'archived')
                .map((s) => {
                  const checked = selectedStudentIds.has(s.student.id);
                  return (
                    <label
                      key={s.student.id}
                      className="flex items-center justify-between gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-800 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50"
                    >
                      <div>
                        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                          {s.student.name}
                        </p>
                        <p className="text-xs text-slate-500">
                          {s.relationship.class} · {s.relationship.subjects.join(', ')}
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          setSelectedStudentIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(s.student.id)) next.delete(s.student.id);
                            else next.add(s.student.id);
                            return next;
                          });
                        }}
                        className="w-4 h-4 accent-indigo-600 rounded"
                      />
                    </label>
                  );
                })}
            </div>
          )}

          <div className="flex justify-between items-center pt-3 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => {
                const activeIds = students
                  .filter((s) => s.relationship.status !== 'archived')
                  .map((s) => s.student.id);
                setSelectedStudentIds(
                  selectedStudentIds.size === activeIds.length ? new Set() : new Set(activeIds)
                );
              }}
              className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              Toggle all
            </button>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setAssignMaterial(null)}>
                {t.common.cancel}
              </Button>
              <Button onClick={handleSaveAssignments} disabled={assignBusy}>
                {assignBusy ? t.common.loading : t.common.save}
              </Button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
