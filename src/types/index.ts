import type { Timestamp } from 'firebase/firestore';

export type UserRole = 'teacher' | 'student' | 'admin';

export interface UserProfile {
  uid: string;
  role: UserRole;
  displayName: string;
  email: string;
  photoURL?: string;
  studentIds?: string[];
  teacherIds?: string[];
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface TeacherProfile {
  uid: string;
  name: string;
  brandName: string;
  logoUrl: string;
  themeColor: string;
  phone: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface StudentProfile {
  id: string;
  uid: string | null;
  teacherId: string;
  teacherIds: string[];
  name: string;
  phone: string;
  guardianName: string;
  guardianPhone: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export type RelationshipStatus = 'invited' | 'active' | 'archived';

export interface Relationship {
  id: string;
  teacherId: string;
  studentId: string;
  studentUid?: string | null;
  class: string;
  subjects: string[];
  status: RelationshipStatus;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface StudentWithRelationship {
  relationship: Relationship;
  student: StudentProfile;
  latestInvitation?: Invitation | null;
}

export interface Invitation {
  token: string;
  teacherId: string;
  studentId: string;
  relationshipId: string;
  expiresAt: Timestamp;
  usedAt: Timestamp | null;
  createdAt?: Timestamp;
}

export type MaterialType = 'link' | 'pdf' | 'video' | 'note';

export interface Material {
  id: string;
  teacherId: string;
  title: string;
  description: string;
  type: MaterialType;
  url: string;
  subject: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface MaterialAssignment {
  id: string;
  teacherId: string;
  materialId: string;
  relationshipId: string;
  studentId: string;
  assignedAt?: Timestamp;
}

export type AttendanceStatus = 'present' | 'absent' | 'late' | 'leave';

export interface AttendanceSession {
  id: string;
  teacherId: string;
  studentId: string;
  relationshipId: string;
  date: string; // YYYY-MM-DD
  status: AttendanceStatus;
  note?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface AttendanceSummary {
  id: string; // teacherId_studentId_YYYY-MM
  teacherId: string;
  studentId: string;
  month: string; // YYYY-MM
  present: number;
  absent: number;
  late: number;
  leave: number;
  total: number;
  updatedAt?: Timestamp;
}

export interface OfflineExam {
  id: string;
  teacherId: string;
  title: string;
  subject: string;
  date: string; // YYYY-MM-DD
  totalMarks: number;
  published: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface OfflineResult {
  id: string;
  examId: string;
  teacherId: string;
  studentId: string;
  examTitle: string;
  subject: string;
  examDate: string;
  totalMarks: number;
  marksObtained: number;
  remarks: string;
  published: boolean;
  publishedAt?: Timestamp;
  updatedAt?: Timestamp;
}

export type QuestionType = 'mcq' | 'truefalse' | 'matching' | 'fillblank' | 'ordering';
export type QuestionDifficulty = 'easy' | 'medium' | 'hard';
export type QuestionOwnerType = 'platform' | 'teacher';

export interface MatchingPair {
  left: string;
  right: string;
}

export interface Question {
  id: string;
  ownerType: QuestionOwnerType;
  ownerId: string;
  teacherId?: string;
  type: QuestionType;
  text: string;
  imageUrl?: string;
  imageUrlValid?: boolean;
  options?: string[];
  pairs?: MatchingPair[];
  items?: string[];
  subject: string;
  chapter: string;
  difficulty: QuestionDifficulty;
  tags: string[];
  sourceId?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface QuestionAnswerKey {
  correctAnswer: unknown;
  explanation: string;
}

export interface SanitizedQuestion {
  id: string;
  type: QuestionType;
  text: string;
  imageUrl: string | null;
  options: string[] | null;
  leftPrompts: string[] | null;
  rightOptions: string[] | null;
  items: string[] | null;
  subject: string;
  chapter: string;
  difficulty: QuestionDifficulty;
}

export type NanoAvailabilityMode = 'instant' | 'window' | 'assigned';

export interface NanoExam {
  id: string;
  teacherId: string;
  title: string;
  subject: string;
  questionIds: string[];
  durationMinutes: number;
  availability: {
    mode: NanoAvailabilityMode;
    startAt?: Timestamp | null;
    endAt?: Timestamp | null;
    assignedStudentIds?: string[];
  };
  status: 'draft' | 'published';
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface NanoAttemptBreakdown {
  questionId: string;
  correct: boolean;
  studentAnswer: unknown;
  correctAnswer: unknown;
  explanation: string;
}

export interface NanoAttempt {
  id: string;
  examId: string;
  examTitle: string;
  subject: string;
  teacherId: string;
  studentId: string;
  answers: Record<string, unknown>;
  score: number;
  total: number;
  percentage: number;
  breakdown?: NanoAttemptBreakdown[];
  startedAt?: Timestamp;
  submittedAt?: Timestamp;
}

export type MessageCategory = 'attendance' | 'result' | 'notice' | 'payment' | 'custom';

export interface MessageTemplate {
  id: string;
  teacherId: string;
  category: MessageCategory;
  title: string;
  body: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}
