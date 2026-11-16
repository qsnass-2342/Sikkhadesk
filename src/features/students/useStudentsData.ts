import { useCallback, useEffect, useState } from 'react';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
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
        getDocs(
          query(
            collection(db, 'relationships'),
            where('teacherId', '==', teacherId),
            orderBy('createdAt', 'desc')
          )
        ),
        getDocs(
          query(
            collection(db, 'invitations'),
            where('teacherId', '==', teacherId),
            orderBy('createdAt', 'desc')
          )
        ),
      ]);

      const invByRel = new Map<string, Invitation>();
      invSnap.docs.forEach((d) => {
        const data = { token: d.id, ...d.data() } as Invitation;
        if (!invByRel.has(data.relationshipId)) {
          invByRel.set(data.relationshipId, data);
        }
      });

      const rels = relSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Relationship));
      const studentDocs = await Promise.all(
        rels.map((r) => getDoc(doc(db!, 'students', r.studentId)))
      );

      const combined: StudentWithRelationship[] = [];
      rels.forEach((rel, idx) => {
        const sSnap = studentDocs[idx];
        if (sSnap.exists()) {
          combined.push({
            relationship: rel,
            student: { id: sSnap.id, ...sSnap.data() } as StudentProfile,
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
