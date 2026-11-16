import { useCallback, useEffect, useState } from 'react';
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
  Invitation,
  Relationship,
  StudentProfile,
  StudentWithRelationship,
} from '../../types';

export function useStudentsData() {
  const { userProfile } = useAuth();
  const teacherId = userProfile?.uid || '';
  const [items, setItems] = useState<StudentWithRelationship[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!db || !teacherId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [relSnap, invSnap] = await Promise.all([
        getDocs(query(collection(db, 'relationships'), where('teacherId', '==', teacherId))),
        getDocs(query(collection(db, 'invitations'), where('teacherId', '==', teacherId))).catch(
          () => null
        ),
      ]);

      const invByRel = new Map<string, Invitation>();
      if (invSnap) {
        const sortedInvs = sortNewestFirst(
          invSnap.docs.map((d) => ({ token: d.id, ...d.data() } as Invitation)),
          (inv) => inv.createdAt
        );
        sortedInvs.forEach((data) => {
          if (!invByRel.has(data.relationshipId)) {
            invByRel.set(data.relationshipId, data);
          }
        });
      }

      const rels = sortNewestFirst(
        relSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Relationship)),
        (r) => r.createdAt
      );

      const studentResults = await Promise.allSettled(
        rels.map((r) => getDoc(doc(db!, 'students', r.studentId)))
      );

      const combined: StudentWithRelationship[] = [];
      rels.forEach((rel, idx) => {
        const res = studentResults[idx];
        if (res.status === 'fulfilled' && res.value.exists()) {
          combined.push({
            relationship: rel,
            student: { id: res.value.id, ...res.value.data() } as StudentProfile,
            latestInvitation: invByRel.get(rel.id) || null,
          });
        }
      });

      setItems(combined);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load students');
    } finally {
      setLoading(false);
    }
  }, [teacherId]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { items, loading, error, reload };
}
