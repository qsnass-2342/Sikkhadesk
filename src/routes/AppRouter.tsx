import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { LoginPage } from '../features/auth/LoginPage';
import { InviteAcceptPage } from '../features/auth/InviteAcceptPage';
import { RequireStudent, RequireTeacher, RootRedirect } from '../features/auth/RouteGuards';
import { TeacherLayout } from '../app/TeacherLayout';
import { StudentLayout } from '../app/StudentLayout';
import { TeacherOverviewPage } from '../features/overview/TeacherOverviewPage';
import { StudentsPage } from '../features/students/StudentsPage';
import { MaterialsPage } from '../features/materials/MaterialsPage';
import { AttendancePage } from '../features/attendance/AttendancePage';
import { OfflineExamsPage } from '../features/offlineExams/OfflineExamsPage';
import { NanoLibraryPage } from '../features/nanoLibrary/NanoLibraryPage';
import { NanoExamsPage } from '../features/nanoExams/NanoExamsPage';
import { MessagesPage } from '../features/messages/MessagesPage';
import { ProfilePage } from '../features/profile/ProfilePage';
import { StudentHomePage } from '../features/studentPortal/StudentHomePage';
import { StudentProfilePage } from '../features/studentPortal/StudentProfilePage';
import { StudentMaterialsPage } from '../features/studentPortal/StudentMaterialsPage';
import { StudentAttendancePage } from '../features/studentPortal/StudentAttendancePage';
import { StudentNanoExamsPage } from '../features/studentPortal/StudentNanoExamsPage';
import { StudentOfflineResultsPage } from '../features/studentPortal/StudentOfflineResultsPage';
import { StudentProgressPage } from '../features/progress/StudentProgressPage';

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/invite/:token" element={<InviteAcceptPage />} />

        {/* Protected Teacher Routes */}
        <Route
          path="/teacher"
          element={
            <RequireTeacher>
              <TeacherLayout />
            </RequireTeacher>
          }
        >
          <Route index element={<TeacherOverviewPage />} />
          <Route path="students" element={<StudentsPage />} />
          <Route path="materials" element={<MaterialsPage />} />
          <Route path="attendance" element={<AttendancePage />} />
          <Route path="offline-exams" element={<OfflineExamsPage />} />
          <Route path="nano-library" element={<NanoLibraryPage />} />
          <Route path="nano-exams" element={<NanoExamsPage />} />
          <Route path="messages" element={<MessagesPage />} />
          <Route path="profile" element={<ProfilePage />} />
        </Route>

        {/* Protected Student Routes */}
        <Route
          path="/student"
          element={
            <RequireStudent>
              <StudentLayout />
            </RequireStudent>
          }
        >
          <Route index element={<StudentHomePage />} />
          <Route path="profile" element={<StudentProfilePage />} />
          <Route path="materials" element={<StudentMaterialsPage />} />
          <Route path="attendance" element={<StudentAttendancePage />} />
          <Route path="nano-exams" element={<StudentNanoExamsPage />} />
          <Route path="offline-results" element={<StudentOfflineResultsPage />} />
          <Route path="progress" element={<StudentProgressPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
