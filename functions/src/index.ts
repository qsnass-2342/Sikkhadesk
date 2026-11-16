import * as admin from 'firebase-admin';
import * as crypto from 'crypto';
import { onCall, HttpsError } from 'firebase-functions/v2/https';

admin.initializeApp();
const db = admin.firestore();

type QuestionType = 'mcq' | 'truefalse' | 'matching' | 'fillblank' | 'ordering';

interface MatchingPair {
  left: string;
  right: string;
}

/**
 * Generates a secure, single-use, 7-day expiring student invitation token.
 */
export const createStudentInvitation = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Authentication required.');
  }

  const uid = request.auth.uid;
  const userDoc = await db.collection('users').doc(uid).get();
  if (!userDoc.exists || userDoc.data()?.role !== 'teacher') {
    throw new HttpsError('permission-denied', 'Only teachers can create student invitations.');
  }

  const { studentId, relationshipId } = request.data as {
    studentId?: string;
    relationshipId?: string;
  };

  if (!studentId || !relationshipId) {
    throw new HttpsError('invalid-argument', 'studentId and relationshipId are required.');
  }

  const relSnap = await db.collection('relationships').doc(relationshipId).get();
  if (!relSnap.exists) {
    throw new HttpsError('not-found', 'Student relationship not found.');
  }
  const relData = relSnap.data()!;
  if (relData.teacherId !== uid || relData.studentId !== studentId) {
    throw new HttpsError('permission-denied', 'You do not own this student relationship.');
  }

  const studentSnap = await db.collection('students').doc(studentId).get();
  if (!studentSnap.exists) {
    throw new HttpsError('not-found', 'Student profile not found.');
  }

  const token = crypto.randomBytes(24).toString('base64url');
  const now = admin.firestore.Timestamp.now();
  const expiresAt = admin.firestore.Timestamp.fromMillis(
    now.toMillis() + 7 * 24 * 60 * 60 * 1000
  );

  await db.collection('invitations').doc(token).set({
    teacherId: uid,
    studentId,
    relationshipId,
    expiresAt,
    usedAt: null,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return {
    token,
    expiresAtMillis: expiresAt.toMillis(),
  };
});

/**
 * Accepts a single-use invitation token and links the authenticated student account
 * to the student profile and teacher relationship without creating duplicate accounts.
 */
export const acceptStudentInvitation = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Please sign in first to accept this invitation.');
  }

  const uid = request.auth.uid;
  const { token } = request.data as { token?: string };
  if (!token) {
    throw new HttpsError('invalid-argument', 'Invitation token is required.');
  }

  const inviteRef = db.collection('invitations').doc(token);

  const result = await db.runTransaction(async (tx) => {
    const inviteSnap = await tx.get(inviteRef);
    if (!inviteSnap.exists) {
      throw new HttpsError('not-found', 'Invalid invitation link.');
    }

    const invite = inviteSnap.data()!;
    if (invite.usedAt) {
      throw new HttpsError('failed-precondition', 'This invitation link has already been used.');
    }

    const expiresAt = invite.expiresAt as admin.firestore.Timestamp;
    if (expiresAt.toMillis() < Date.now()) {
      throw new HttpsError('deadline-exceeded', 'This invitation link has expired.');
    }

    const userRef = db.collection('users').doc(uid);
    const userSnap = await tx.get(userRef);
    if (userSnap.exists && userSnap.data()?.role === 'teacher') {
      throw new HttpsError('failed-precondition', 'Teacher accounts cannot accept student invitations.');
    }

    const studentRef = db.collection('students').doc(invite.studentId);
    const studentSnap = await tx.get(studentRef);
    if (!studentSnap.exists) {
      throw new HttpsError('not-found', 'Student record no longer exists.');
    }

    const relRef = db.collection('relationships').doc(invite.relationshipId);
    const relSnap = await tx.get(relRef);
    if (!relSnap.exists) {
      throw new HttpsError('not-found', 'Relationship record not found.');
    }

    const existingStudentIds: string[] = userSnap.exists ? (userSnap.data()?.studentIds || []) : [];
    const existingTeacherIds: string[] = userSnap.exists ? (userSnap.data()?.teacherIds || []) : [];

    const nextStudentIds = Array.from(new Set([...existingStudentIds, invite.studentId]));
    const nextTeacherIds = Array.from(new Set([...existingTeacherIds, invite.teacherId]));

    // Ensure user doc exists and has student role + linked IDs
    tx.set(
      userRef,
      {
        role: 'student',
        displayName: request.auth!.token.name || studentSnap.data()?.name || 'Student',
        email: request.auth!.token.email || '',
        photoURL: request.auth!.token.picture || '',
        studentIds: nextStudentIds,
        teacherIds: nextTeacherIds,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        ...(userSnap.exists ? {} : { createdAt: admin.firestore.FieldValue.serverTimestamp() }),
      },
      { merge: true }
    );

    tx.update(studentRef, {
      uid,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    tx.update(relRef, {
      status: 'active',
      studentUid: uid,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    tx.update(inviteRef, {
      usedAt: admin.firestore.FieldValue.serverTimestamp(),
      acceptedByUid: uid,
    });

    return {
      teacherId: invite.teacherId,
      studentId: invite.studentId,
      relationshipId: invite.relationshipId,
    };
  });

  return result;
});

/**
 * Publishes an offline exam and marks all associated student results as visible.
 */
export const publishOfflineResults = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Authentication required.');
  }

  const uid = request.auth.uid;
  const { examId } = request.data as { examId?: string };
  if (!examId) {
    throw new HttpsError('invalid-argument', 'examId is required.');
  }

  const examRef = db.collection('offlineExams').doc(examId);
  const examSnap = await examRef.get();
  if (!examSnap.exists) {
    throw new HttpsError('not-found', 'Offline exam not found.');
  }
  const exam = examSnap.data()!;
  if (exam.teacherId !== uid) {
    throw new HttpsError('permission-denied', 'You do not own this exam.');
  }

  const resultsSnap = await db
    .collection('offlineResults')
    .where('examId', '==', examId)
    .where('teacherId', '==', uid)
    .get();

  const batch = db.batch();
  batch.update(examRef, {
    published: true,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  let sum = 0;
  let count = 0;
  resultsSnap.docs.forEach((doc) => {
    const data = doc.data();
    sum += Number(data.marksObtained || 0);
    count += 1;
    batch.update(doc.ref, {
      published: true,
      publishedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });

  await batch.commit();

  return {
    publishedCount: count,
    averageMarks: count > 0 ? Number((sum / count).toFixed(2)) : 0,
  };
});

/**
 * Starts a Nano Exam attempt for an authorized student.
 * Validates availability mode (instant | window | assigned) and strips ALL answer keys.
 */
export const startNanoAttempt = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Authentication required.');
  }

  const uid = request.auth.uid;
  const { examId } = request.data as { examId?: string };
  if (!examId) {
    throw new HttpsError('invalid-argument', 'examId is required.');
  }

  const userSnap = await db.collection('users').doc(uid).get();
  if (!userSnap.exists || userSnap.data()?.role !== 'student') {
    throw new HttpsError('permission-denied', 'Only enrolled students can start Nano Exams.');
  }

  const user = userSnap.data()!;
  const studentIds: string[] = user.studentIds || [];
  const teacherIds: string[] = user.teacherIds || [];

  const examSnap = await db.collection('nanoExams').doc(examId).get();
  if (!examSnap.exists) {
    throw new HttpsError('not-found', 'Nano Exam not found.');
  }

  const exam = examSnap.data()!;
  if (exam.status !== 'published') {
    throw new HttpsError('failed-precondition', 'This exam is not published.');
  }
  if (!teacherIds.includes(exam.teacherId)) {
    throw new HttpsError('permission-denied', 'You are not linked to this teacher.');
  }

  // Find matching studentId for this teacher
  const relSnap = await db
    .collection('relationships')
    .where('teacherId', '==', exam.teacherId)
    .where('status', '==', 'active')
    .get();

  const matchingRel = relSnap.docs.find((d) => studentIds.includes(d.data().studentId));
  if (!matchingRel) {
    throw new HttpsError('permission-denied', 'Active enrollment with this teacher is required.');
  }
  const studentId = matchingRel.data().studentId as string;

  // Validate availability
  const availability = exam.availability || { mode: 'instant' };
  const nowMs = Date.now();
  if (availability.mode === 'window') {
    const startMs = availability.startAt?.toMillis?.() ?? 0;
    const endMs = availability.endAt?.toMillis?.() ?? Number.MAX_SAFE_INTEGER;
    if (nowMs < startMs || nowMs > endMs) {
      throw new HttpsError('failed-precondition', 'This exam is outside its scheduled availability window.');
    }
  } else if (availability.mode === 'assigned') {
    const assignedIds: string[] = availability.assignedStudentIds || [];
    if (!assignedIds.includes(studentId)) {
      throw new HttpsError('permission-denied', 'This exam is not assigned to you.');
    }
  }

  // Load questions WITHOUT private/answerKey subcollection
  const questionIds: string[] = exam.questionIds || [];
  const questionSnaps = await Promise.all(
    questionIds.map((qId) => db.collection('questions').doc(qId).get())
  );

  const sanitizedQuestions = questionSnaps
    .filter((snap) => snap.exists)
    .map((snap) => {
      const q = snap.data()!;
      // For matching questions, send shuffled right-hand options so order doesn't leak answer
      const rightOptions =
        q.type === 'matching' && Array.isArray(q.pairs)
          ? [...q.pairs.map((p: MatchingPair) => p.right)].sort(() => Math.random() - 0.5)
          : undefined;
      const leftPrompts =
        q.type === 'matching' && Array.isArray(q.pairs)
          ? q.pairs.map((p: MatchingPair) => p.left)
          : undefined;
      // For ordering questions, shuffle items so order doesn't leak correct sequence
      const shuffledItems =
        q.type === 'ordering' && Array.isArray(q.items)
          ? [...q.items].sort(() => Math.random() - 0.5)
          : undefined;

      return {
        id: snap.id,
        type: q.type as QuestionType,
        text: q.text,
        imageUrl: q.imageUrlValid ? q.imageUrl : null,
        options: q.options || null,
        leftPrompts: leftPrompts || null,
        rightOptions: rightOptions || null,
        items: shuffledItems || null,
        subject: q.subject,
        chapter: q.chapter,
        difficulty: q.difficulty,
      };
    });

  return {
    examId,
    studentId,
    title: exam.title,
    subject: exam.subject,
    durationMinutes: exam.durationMinutes,
    startedAtMillis: nowMs,
    questions: sanitizedQuestions,
  };
});

/**
 * Scores a Nano Exam submission on the server against questions/{id}/private/answerKey,
 * writes an immutable attempt document, and returns score + explanations.
 */
export const submitNanoAttempt = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Authentication required.');
  }

  const uid = request.auth.uid;
  const { examId, studentId, answers, startedAtMillis } = request.data as {
    examId?: string;
    studentId?: string;
    answers?: Record<string, unknown>;
    startedAtMillis?: number;
  };

  if (!examId || !studentId || !answers) {
    throw new HttpsError('invalid-argument', 'examId, studentId, and answers are required.');
  }

  const userSnap = await db.collection('users').doc(uid).get();
  if (!userSnap.exists || userSnap.data()?.role !== 'student') {
    throw new HttpsError('permission-denied', 'Student account required.');
  }
  const studentIds: string[] = userSnap.data()?.studentIds || [];
  if (!studentIds.includes(studentId)) {
    throw new HttpsError('permission-denied', 'You cannot submit for another student.');
  }

  const examSnap = await db.collection('nanoExams').doc(examId).get();
  if (!examSnap.exists) {
    throw new HttpsError('not-found', 'Exam not found.');
  }
  const exam = examSnap.data()!;
  const questionIds: string[] = exam.questionIds || [];

  const [questionSnaps, answerKeySnaps] = await Promise.all([
    Promise.all(questionIds.map((qId) => db.collection('questions').doc(qId).get())),
    Promise.all(
      questionIds.map((qId) =>
        db.collection('questions').doc(qId).collection('private').doc('answerKey').get()
      )
    ),
  ]);

  let score = 0;
  const total = questionIds.length;
  const breakdown: Array<{
    questionId: string;
    correct: boolean;
    studentAnswer: unknown;
    correctAnswer: unknown;
    explanation: string;
  }> = [];

  for (let i = 0; i < questionIds.length; i++) {
    const qId = questionIds[i];
    const qSnap = questionSnaps[i];
    const akSnap = answerKeySnaps[i];
    if (!qSnap.exists || !akSnap.exists) continue;

    const qType = qSnap.data()!.type as QuestionType;
    const ak = akSnap.data()!;
    const correctAnswer = ak.correctAnswer;
    const studentAnswer = answers[qId];

    let isCorrect = false;
    if (qType === 'mcq' || qType === 'truefalse') {
      isCorrect = String(studentAnswer ?? '').trim() === String(correctAnswer ?? '').trim();
    } else if (qType === 'fillblank') {
      isCorrect =
        String(studentAnswer ?? '').trim().toLowerCase() ===
        String(correctAnswer ?? '').trim().toLowerCase();
    } else if (qType === 'ordering') {
      const expected = Array.isArray(correctAnswer) ? correctAnswer : [];
      const given = Array.isArray(studentAnswer) ? studentAnswer : [];
      isCorrect =
        expected.length > 0 &&
        expected.length === given.length &&
        expected.every((val, idx) => String(val).trim() === String(given[idx]).trim());
    } else if (qType === 'matching') {
      const expectedMap = (correctAnswer && typeof correctAnswer === 'object' ? correctAnswer : {}) as Record<string, string>;
      const givenMap = (studentAnswer && typeof studentAnswer === 'object' ? studentAnswer : {}) as Record<string, string>;
      const keys = Object.keys(expectedMap);
      isCorrect =
        keys.length > 0 &&
        keys.every((k) => String(givenMap[k] ?? '').trim() === String(expectedMap[k] ?? '').trim());
    }

    if (isCorrect) score += 1;

    breakdown.push({
      questionId: qId,
      correct: isCorrect,
      studentAnswer: studentAnswer ?? null,
      correctAnswer,
      explanation: ak.explanation || '',
    });
  }

  const percentage = total > 0 ? Math.round((score / total) * 100) : 0;

  const attemptRef = await db.collection('nanoAttempts').add({
    examId,
    examTitle: exam.title,
    subject: exam.subject,
    teacherId: exam.teacherId,
    studentId,
    studentUid: uid,
    answers,
    score,
    total,
    percentage,
    breakdown,
    startedAt: startedAtMillis
      ? admin.firestore.Timestamp.fromMillis(startedAtMillis)
      : admin.firestore.FieldValue.serverTimestamp(),
    submittedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return {
    attemptId: attemptRef.id,
    score,
    total,
    percentage,
    breakdown,
  };
});
