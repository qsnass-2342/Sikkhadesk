# ShikkhaDesk — Education Management System for Home Tutors

A multi-tenant-ready Education Management System built with **React + Vite + TypeScript**, **Tailwind CSS**, **Firebase Auth & Cloud Firestore**, **Firebase Cloud Functions**, **KaTeX**, **Recharts**, and **Framer Motion** (`motion/react`), with full **English / Bangla (`বাংলা`)** bilingual support and dark mode.

---

## 1. Environment Setup

1. Create a Firebase project in the [Firebase Console](https://console.firebase.google.com/).
2. Enable **Authentication** -> **Google** sign-in and **Email/Password -> Email link (passwordless sign-in)**.
3. Create a **Cloud Firestore** database.
4. Copy `.env.example` to `.env` and fill in your Firebase Web App credentials:

```bash
cp .env.example .env
```

Required variables:
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_FIREBASE_FUNCTIONS_REGION` (optional, defaults to `us-central1`)

---

## 2. Deploy Firestore Rules, Indexes & Cloud Functions

Install the Firebase CLI (`npm install -g firebase-tools`), log in, and select your project:

```bash
firebase login
firebase use --add
```

Deploy Firestore Security Rules and Composite Indexes:

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

Install Cloud Functions dependencies and deploy:

```bash
cd functions
npm install
npm run build
cd ..
firebase deploy --only functions
```

### Deployed Cloud Functions
- `createStudentInvitation` — Generates a single-use, 7-day expiring invitation token.
- `acceptStudentInvitation` — Validates token and links a student's global account to the teacher relationship.
- `publishOfflineResults` — Publishes exam marks and calculates exam averages.
- `startNanoAttempt` — Validates exam availability (`instant` | `window` | `assigned`) and returns sanitized questions without answer keys.
- `submitNanoAttempt` — Grades answers server-side against `questions/{id}/private/answerKey`, records an immutable `nanoAttempts` document, and returns explanations.

---

## 3. First-Time Teacher Setup

1. Start the app (`npm run dev`).
2. Sign in with **Google** on the Teacher tab.
3. If `config/teacherWhitelist` does not yet exist in Firestore, the First-Time Setup screen allows you to seed `config/teacherWhitelist` with your Google email and configure your tutor brand profile (`teachers/{uid}`).
4. Future teachers can be added to `config/teacherWhitelist.emails` by an existing whitelisted teacher or future platform admin.

---

## 4. Architecture Highlights

- **Strict Multi-Tenancy**: Every teacher-owned record includes `teacherId` and is isolated via `firestore.rules`.
- **Global Student Identity**: One student Google/Email-link account (`users/{uid}`) can accept invitations from multiple teachers without creating duplicate accounts.
- **Exam Security**: Answer keys live in `questions/{id}/private/answerKey`, which students cannot read directly; grading happens exclusively in `submitNanoAttempt`, and `nanoAttempts` are immutable after creation.
- **Newest-First Ordering**: Every list across both dashboards sorts newest first by default using composite Firestore indexes.
