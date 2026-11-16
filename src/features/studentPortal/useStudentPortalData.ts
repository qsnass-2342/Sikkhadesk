import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { sortNewestFirst } from '../../lib/firestoreSort';
import { useAuth } from '../auth/AuthContext';
import type {
  AttendanceSession,
  AttendanceSummary,
  Material,
  MaterialAssignment,
  NanoAttempt,
  NanoExam,
  OfflineResult,
} from '../../types';

export function useStudentPortalData() {
  const {
    userProfile,
    studentRelationships,
    linkedTeachers,
    activeTeacherId,
  } = useAuth();

  const activeTeacher = useMemo(
    () => linkedTeachers.find((t) => t.uid === activeTeacherId) || linkedTeachers[0] || null,
    [linkedTeachers, activeTeacherId]
  );

  const activeRelationship = useMemo(() => {
    if (!activeTeacher) return studentRelationships[0] || null;
    return (
      studentRelationships.find((r) => r.teacherId === activeTeacher.uid) ||
      studentRelationships[0] ||
      null
    );
  }, [studentRelationships, activeTeacher]);

  const studentId = activeRelationship?.studentId || userProfile?.studentIds?.[0] || '';
  const teacherId = activeTeacher?.uid || activeRelationship?.teacherId || '';

  const [materials, setMaterials] = useState<Array<{ assignment: MaterialAssignment; material: Material }>>([]);
  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [summaries, setSummaries] = useState<AttendanceSummary[]>([]);
  const [nanoExams, setNanoExams] = useState<NanoExam[]>([]);
  const [nanoAttempts, setNanoAttempts] = useState<NanoAttempt[]>([]);
  const [offlineResults, setOfflineResults] = useState<OfflineResult[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!db || !studentId || !teacherId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [assignSnap, sessSnap, sumSnap, nanoSnap, attSnap, offSnap] = await Promise.all([
        getDocs(query(collection(db, 'materialAssignments'), where('studentId', '==', studentId))),
        getDocs(query(collection(db, 'attendanceSessions'), where('studentId', '==', studentId))),
        getDocs(query(collection(db, 'attendanceSummaries'), where('studentId', '==', studentId))),
        getDocs(
          query(
            collection(db, 'nanoExams'),
            where('teacherId', '==', teacherId),
            where('status', '==', 'published')
          )
        ),
        getDocs(query(collection(db, 'nanoAttempts'), where('studentId', '==', studentId))),
        getDocs(
          query(
            collection(db, 'offlineResults'),
            where('studentId', '==', studentId),
            where('published', '==', true)
          )
        ),
      ]);

      const assignments = sortNewestFirst(
        assignSnap.docs
          .map((d) => ({ id: d.id, ...d.data() } as MaterialAssignment))
          .filter((a) => a.teacherId === teacherId),
        (a) => a.assignedAt
      );

      const matResults = await Promise.allSettled(
        assignments.map((a) => getDoc(doc(db!, 'materials', a.materialId)))
      );

      const matJoined: Array<{ assignment: MaterialAssignment; material: Material }> = [];
      assignments.forEach((a, idx) => {
        const res = matResults[idx];
        if (res.status === 'fulfilled' && res.value.exists()) {
          matJoined.push({
            assignment: a,
            material: { id: res.value.id, ...res.value.data() } as Material,
          });
        }
      });

      setMaterials(matJoined);
      setSessions(
        sortNewestFirst(
          sessSnap.docs
            .map((d) => ({ id: d.id, ...d.data() } as AttendanceSession))
            .filter((s) => s.teacherId === teacherId),
          (s) => s.date || s.createdAt
        )
      );
      setSummaries(
        sumSnap.docs
          .map((d) => ({ id: d.id, ...d.data() } as AttendanceSummary))
          .filter((s) => s.teacherId === teacherId)
      );
      setNanoExams(
        sortNewestFirst(
          nanoSnap.docs.map((d) => ({ id: d.id, ...d.data() } as NanoExam)),
          (e) => e.createdAt
        )
      );
      setNanoAttempts(
        sortNewestFirst(
          attSnap.docs
            .map((d) => ({ id: d.id, ...d.data() } as NanoAttempt))
            .filter((a) => a.teacherId === teacherId),
          (a) => a.submittedAt
        )
      );
      setOfflineResults(
        sortNewestFirst(
          offSnap.docs
            .map((d) => ({ id: d.id, ...d.data() } as OfflineResult))
            .filter((r) => r.teacherId === teacherId),
          (r) => r.publishedAt || r.examDate
        )
      );
    } catch (err) {
      console.error('Student portal load error:', err);
    } finally {
      setLoading(false);
    }
  }, [studentId, teacherId]);

  useEffect(() => {
    reload();
  }, [reload]);

  return {
    activeTeacher,
    activeRelationship,
    studentId,
    teacherId,
    materials,
    sessions,
    summaries,
    nanoExams,
    nanoAttempts,
    offlineResults,
    loading,
    reload,
  };
}
