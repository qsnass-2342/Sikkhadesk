import React, { useMemo, useState } from 'react';
import {
  addDoc,
  collection,
  doc,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import {
  Archive,
  Check,
  Copy,
  Edit2,
  LayoutGrid,
  Link2,
  List,
  Plus,
  RotateCcw,
  Search,
  Users,
} from 'lucide-react';
import { db, functions, isFunctionsUnavailableError } from '../../lib/firebase';
import { useAuth } from '../auth/AuthContext';
import { useI18n } from '../../i18n/I18nContext';
import { useStudentsData } from './useStudentsData';
import type { RelationshipStatus, StudentWithRelationship } from '../../types';
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
import { formatDate } from '../../lib/formatters';

export function StudentsPage() {
  const { userProfile } = useAuth();
  const { t, lang } = useI18n();
  const { showToast } = useToast();
  const { items, loading, error, reload } = useStudentsData();

  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | RelationshipStatus>('all');

  // Add / Edit Student modal
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<StudentWithRelationship | null>(null);
  const [name, setName] = useState('');
  const [classLevel, setClassLevel] = useState('');
  const [phone, setPhone] = useState('');
  const [guardianName, setGuardianName] = useState('');
  const [guardianPhone, setGuardianPhone] = useState('');
  const [subjectsText, setSubjectsText] = useState('');
  const [saving, setSaving] = useState(false);

  // Invite link modal
  const [inviteTarget, setInviteTarget] = useState<StudentWithRelationship | null>(null);
  const [inviteUrl, setInviteUrl] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [fnUnavailable, setFnUnavailable] = useState(false);
  const [copied, setCopied] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      if (statusFilter !== 'all' && item.relationship.status !== statusFilter) return false;
      if (!q) return true;
      return (
        item.student.name.toLowerCase().includes(q) ||
        item.relationship.class.toLowerCase().includes(q) ||
        item.student.guardianName.toLowerCase().includes(q) ||
        item.relationship.subjects.some((s) => s.toLowerCase().includes(q))
      );
    });
  }, [items, search, statusFilter]);

  const openAddModal = () => {
    setEditing(null);
    setName('');
    setClassLevel('');
    setPhone('');
    setGuardianName('');
    setGuardianPhone('');
    setSubjectsText('');
    setFormOpen(true);
  };

  const openEditModal = (item: StudentWithRelationship) => {
    setEditing(item);
    setName(item.student.name);
    setClassLevel(item.relationship.class);
    setPhone(item.student.phone);
    setGuardianName(item.student.guardianName);
    setGuardianPhone(item.student.guardianPhone);
    setSubjectsText(item.relationship.subjects.join(', '));
    setFormOpen(true);
  };

  const handleSaveStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!db || !userProfile?.uid) return;
    setSaving(true);
    const subjects = subjectsText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    try {
      if (editing) {
        await Promise.all([
          updateDoc(doc(db, 'students', editing.student.id), {
            name: name.trim(),
            phone: phone.trim(),
            guardianName: guardianName.trim(),
            guardianPhone: guardianPhone.trim(),
            updatedAt: serverTimestamp(),
          }),
          updateDoc(doc(db, 'relationships', editing.relationship.id), {
            class: classLevel.trim(),
            subjects,
            updatedAt: serverTimestamp(),
          }),
        ]);
        showToast('Student updated', 'success');
      } else {
        const studentRef = await addDoc(collection(db, 'students'), {
          uid: null,
          teacherId: userProfile.uid,
          teacherIds: [userProfile.uid],
          name: name.trim(),
          phone: phone.trim(),
          guardianName: guardianName.trim(),
          guardianPhone: guardianPhone.trim(),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        await addDoc(collection(db, 'relationships'), {
          teacherId: userProfile.uid,
          studentId: studentRef.id,
          class: classLevel.trim(),
          subjects,
          status: 'invited',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        showToast('Student profile added', 'success');
      }
      setFormOpen(false);
      await reload();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to save student', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleArchive = async (item: StudentWithRelationship) => {
    if (!db) return;
    const nextStatus: RelationshipStatus =
      item.relationship.status === 'archived'
        ? item.student.uid
          ? 'active'
          : 'invited'
        : 'archived';
    try {
      await updateDoc(doc(db, 'relationships', item.relationship.id), {
        status: nextStatus,
        updatedAt: serverTimestamp(),
      });
      showToast(nextStatus === 'archived' ? 'Student archived' : 'Student restored', 'info');
      await reload();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Update failed', 'error');
    }
  };

  const handleOpenInvite = async (item: StudentWithRelationship) => {
    setInviteTarget(item);
    setInviteUrl('');
    setFnUnavailable(false);
    setCopied(false);

    // Check if an unused, unexpired invitation already exists
    const existing = item.latestInvitation;
    if (
      existing &&
      !existing.usedAt &&
      existing.expiresAt?.toMillis &&
      existing.expiresAt.toMillis() > Date.now()
    ) {
      setInviteUrl(`${window.location.origin}/invite/${existing.token}`);
    }
  };

  const handleGenerateInvite = async () => {
    if (!functions || !inviteTarget) return;
    setInviteLoading(true);
    setFnUnavailable(false);
    try {
      const fn = httpsCallable<
        { studentId: string; relationshipId: string },
        { token: string; expiresAtMillis: number }
      >(functions, 'createStudentInvitation');
      const res = await fn({
        studentId: inviteTarget.student.id,
        relationshipId: inviteTarget.relationship.id,
      });
      setInviteUrl(`${window.location.origin}/invite/${res.data.token}`);
      showToast('Invitation link generated', 'success');
      await reload();
    } catch (err) {
      if (isFunctionsUnavailableError(err)) {
        setFnUnavailable(true);
      } else {
        showToast(err instanceof Error ? err.message : 'Could not create invite', 'error');
      }
    } finally {
      setInviteLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    showToast(t.common.copied, 'success');
    window.setTimeout(() => setCopied(false), 2000);
  };

  const renderStatusText = (item: StudentWithRelationship) => {
    const st = item.relationship.status;
    if (st === 'active') {
      return <span className="text-emerald-600 dark:text-emerald-400 font-medium">{t.common.active}</span>;
    }
    if (st === 'archived') {
      return <span className="text-slate-500 dark:text-slate-400">{t.common.archived}</span>;
    }
    return <span className="text-amber-600 dark:text-amber-400 font-medium">{t.common.invited}</span>;
  };

  return (
    <div className="space-y-6">
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            {t.students.title}
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {t.students.subtitle}
          </p>
        </div>
        <Button onClick={openAddModal}>
          <Plus className="w-4 h-4" />
          <span>{t.students.addStudent}</span>
        </Button>
      </div>

      {/* Filter & Search Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
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

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center p-1 rounded-xl bg-slate-200/70 dark:bg-slate-800/80">
            {(['all', 'active', 'invited', 'archived'] as const).map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setStatusFilter(status)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                  statusFilter === status
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {status === 'all' ? t.common.filterAll : t.common[status]}
              </button>
            ))}
          </div>

          <div className="flex items-center p-1 rounded-xl bg-slate-200/70 dark:bg-slate-800/80">
            <button
              type="button"
              onClick={() => setViewMode('cards')}
              className={`p-1.5 rounded-lg ${
                viewMode === 'cards'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-500'
              }`}
              aria-label={t.students.cardView}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded-lg ${
                viewMode === 'table'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-500'
              }`}
              aria-label={t.students.tableView}
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <SkeletonRows rows={5} />
      ) : error ? (
        <SurfaceCard className="p-6 text-sm text-rose-600 dark:text-rose-400">
          {error}
        </SurfaceCard>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Users className="w-6 h-6" />}
          title={t.students.emptyTitle}
          description={t.students.emptyDesc}
          action={
            items.length === 0 ? (
              <Button onClick={openAddModal}>
                <Plus className="w-4 h-4" />
                <span>{t.students.addStudent}</span>
              </Button>
            ) : undefined
          }
        />
      ) : viewMode === 'cards' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((item) => (
            <SurfaceCard key={item.relationship.id} className="p-5 flex flex-col justify-between gap-4">
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {item.student.name}
                    </h3>
                    <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-1">
                      <span>{item.relationship.class || '—'}</span>
                      <span aria-hidden="true">·</span>
                      {renderStatusText(item)}
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 space-y-1.5 text-xs text-slate-600 dark:text-slate-400">
                  <p>
                    <span className="text-slate-400 dark:text-slate-500">Subjects: </span>
                    {item.relationship.subjects.length > 0
                      ? item.relationship.subjects.join(', ')
                      : '—'}
                  </p>
                  <p className="tabular-nums">
                    <span className="text-slate-400 dark:text-slate-500">Phone: </span>
                    {item.student.phone || '—'}
                  </p>
                  <p className="tabular-nums">
                    <span className="text-slate-400 dark:text-slate-500">Guardian: </span>
                    {item.student.guardianName || '—'}
                    {item.student.guardianPhone ? ` (${item.student.guardianPhone})` : ''}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => handleOpenInvite(item)}
                >
                  <Link2 className="w-3.5 h-3.5" />
                  <span>{t.students.inviteStudent}</span>
                </Button>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => openEditModal(item)}
                    className="p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
                    aria-label={t.common.edit}
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleArchive(item)}
                    className="p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
                    aria-label={item.relationship.status === 'archived' ? t.common.restore : t.common.archive}
                  >
                    {item.relationship.status === 'archived' ? (
                      <RotateCcw className="w-4 h-4" />
                    ) : (
                      <Archive className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            </SurfaceCard>
          ))}
        </div>
      ) : (
        <SurfaceCard className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="py-3.5 px-4 font-medium">{t.students.studentName}</th>
                  <th className="py-3.5 px-4 font-medium">{t.students.classLevel}</th>
                  <th className="py-3.5 px-4 font-medium">{t.common.subject}</th>
                  <th className="py-3.5 px-4 font-medium">{t.students.guardianPhone}</th>
                  <th className="py-3.5 px-4 font-medium">{t.common.status}</th>
                  <th className="py-3.5 px-4 font-medium">Added</th>
                  <th className="py-3.5 px-4 font-medium text-right">{t.common.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {filtered.map((item) => (
                  <tr key={item.relationship.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                    <td className="py-3.5 px-4 font-medium text-slate-900 dark:text-slate-100">
                      {item.student.name}
                    </td>
                    <td className="py-3.5 px-4 text-slate-600 dark:text-slate-400">
                      {item.relationship.class || '—'}
                    </td>
                    <td className="py-3.5 px-4 text-slate-600 dark:text-slate-400 max-w-[200px] truncate">
                      {item.relationship.subjects.join(', ') || '—'}
                    </td>
                    <td className="py-3.5 px-4 font-mono-num text-xs text-slate-600 dark:text-slate-400">
                      {item.student.guardianPhone || '—'}
                    </td>
                    <td className="py-3.5 px-4 text-xs">{renderStatusText(item)}</td>
                    <td className="py-3.5 px-4 text-xs text-slate-500 tabular-nums">
                      {formatDate(item.relationship.createdAt, lang)}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="inline-flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleOpenInvite(item)}
                        >
                          <Link2 className="w-3.5 h-3.5" />
                          <span>{t.students.inviteStudent}</span>
                        </Button>
                        <button
                          type="button"
                          onClick={() => openEditModal(item)}
                          className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                          aria-label={t.common.edit}
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleArchive(item)}
                          className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                          aria-label={t.common.archive}
                        >
                          <Archive className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SurfaceCard>
      )}

      {/* Add / Edit Modal */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? t.students.editStudent : t.students.addStudent}
      >
        <form onSubmit={handleSaveStudent} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>{t.students.studentName} *</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Rafiq Ahmed"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>{t.students.classLevel} *</label>
              <input
                type="text"
                required
                value={classLevel}
                onChange={(e) => setClassLevel(e.target.value)}
                placeholder="e.g. Class 10 / HSC 1st Year"
                className={inputClass}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>{t.students.phone}</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="01XXXXXXXXX"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>{t.students.guardianName}</label>
              <input
                type="text"
                value={guardianName}
                onChange={(e) => setGuardianName(e.target.value)}
                placeholder="Parent / Guardian name"
                className={inputClass}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>{t.students.guardianPhone}</label>
              <input
                type="tel"
                value={guardianPhone}
                onChange={(e) => setGuardianPhone(e.target.value)}
                placeholder="01XXXXXXXXX (WhatsApp)"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>{t.students.subjects}</label>
              <input
                type="text"
                value={subjectsText}
                onChange={(e) => setSubjectsText(e.target.value)}
                placeholder="Math, Physics, Chemistry"
                className={inputClass}
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-3">
            <Button type="button" variant="secondary" onClick={() => setFormOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? t.common.loading : t.common.save}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Invitation Modal */}
      <Modal
        open={Boolean(inviteTarget)}
        onClose={() => setInviteTarget(null)}
        title={t.students.inviteModalTitle}
        subtitle={inviteTarget ? `${inviteTarget.student.name} · ${inviteTarget.relationship.class}` : ''}
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {t.students.inviteModalDesc}
          </p>

          {fnUnavailable && (
            <FunctionsUnavailableBanner context="Generating secure single-use invitation tokens requires the createStudentInvitation Cloud Function." />
          )}

          {inviteUrl ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={inviteUrl}
                  className={`${inputClass} font-mono-num text-xs`}
                />
                <Button onClick={handleCopy} variant="secondary">
                  {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                  <span>{copied ? t.common.copied : t.common.copyLink}</span>
                </Button>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleGenerateInvite}
                disabled={inviteLoading}
              >
                Regenerate new link
              </Button>
            </div>
          ) : (
            <Button onClick={handleGenerateInvite} disabled={inviteLoading} className="w-full">
              <Link2 className="w-4 h-4" />
              <span>{inviteLoading ? t.common.loading : t.students.generateInvite}</span>
            </Button>
          )}
        </div>
      </Modal>
    </div>
  );
}
