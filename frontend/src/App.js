import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import { jwtDecode } from 'jwt-decode';

// Layouts
import AdminLayout from './components/AdminLayout';
import SuperAdminLayout from './components/SuperAdminLayout';
import StudentLayout from './components/StudentLayout';

// Protected Route Component
import ProtectedRoute from './components/ProtectedRoute';

// Pages
import LoginPage from './pages/LoginPage';

// Admin Pages
import ClassManagePage from './pages/admin/ClassManagePage';
import QuizzesPage from './pages/admin/QuizzesPage';
import ClassDetailsPage from './pages/admin/ClassDetailsPage';
import ClassStatsPage from './pages/admin/ClassStatsPage';
import ClassStatsOverviewPage from './pages/admin/ClassStatsOverviewPage';
import InviteStudentPage from './pages/admin/InviteStudentPage';
import AdminProfilePage from './pages/admin/AdminProfilePage';
import WordbookListPage from './pages/admin/WordbookListPage';
import WordbookDetailsPage from './pages/admin/WordbookDetailsPage';
import AddWordPage from './pages/admin/AddWordPage';
import WordListPage from './pages/admin/WordListPage';
import StudentManagePage from './pages/admin/StudentManagePage';
import AdminSecretBoxPage from './pages/admin/AdminSecretBoxPage';
import EditSecretWordbookPage from './pages/admin/EditSecretWordbookPage';

// Student Pages
import StudentDashboard from './pages/StudentDashboard';
import StudentProfilePage from './pages/StudentProfilePage';
import WordPracticePage from './pages/WordPracticePage';
import WordOverviewPage from './pages/WordOverviewPage';
import StudentWordbooksPage from './pages/StudentWordbooksPage';
import StudentStatsPage from './pages/StudentStatsPage';
import TakeQuizPage from './pages/TakeQuizPage';
import StudentQuizListPage from './pages/StudentQuizListPage';
import QuizResultsPage from './pages/QuizResultsPage';
import ReviewPage from './pages/ReviewPage';
import ReviewQuizAttemptsPage from './pages/ReviewQuizAttemptsPage';
import ReviewAttemptPage from './pages/ReviewAttemptPage';
import SuperAdminLoginPage from './pages/superadmin/SuperAdminLoginPage';
import SuperAdminDashboard from './pages/superadmin/SuperAdminDashboard';
import MyBookmarksPage from './pages/MyBookmarksPage';

const getRoleFromToken = (token) => {
  if (!token) return null;
  try {
    return jwtDecode(token).role;
  } catch (e) {
    console.error("Invalid token:", e);
    return null;
  }
};

function App() {
  const [token, setToken] = useState(localStorage.getItem('token'));
  const userRole = getRoleFromToken(token);

  useEffect(() => {
    if (token) {
      localStorage.setItem('token', token);
    } else {
      localStorage.removeItem('token');
    }
  }, [token]);

  return (
    <Router>
      <Routes>
        {/* Public Login Route */}
        <Route 
          path="/login" 
          element={
            !token 
              ? <LoginPage setToken={setToken} /> 
              : (
                userRole === 'admin' 
                  ? <Navigate to="/admin/dashboard" /> 
                  : userRole === 'superadmin' 
                    ? <Navigate to="/superadmin/dashboard" /> 
                    : <Navigate to="/student/dashboard" />
              )
          } 
        />

        {/* Admin Protected Routes (teachers) */}
        <Route 
          element={<ProtectedRoute allowedRoles={['admin']} />}
        >
          <Route 
            path="/admin/*"
            element={
              <AdminLayout setToken={setToken}>
                <Routes>
                  <Route path="dashboard" element={<ClassManagePage />} />
                  <Route path="quizzes" element={<QuizzesPage />} />
                  <Route path="class-stats-overview" element={<ClassStatsOverviewPage />} />
                  <Route path="class/:classId" element={<ClassDetailsPage />} />
                  <Route path="class/:classId/stats" element={<ClassStatsPage />} />
                  <Route path="class/:classId/invite" element={<InviteStudentPage />} />
                  <Route path="profile" element={<AdminProfilePage />} />
                  <Route path="secret-box" element={<AdminSecretBoxPage />} />
                  <Route path="secret-box/edit" element={<EditSecretWordbookPage />} />
                  <Route path="student/:studentId" element={<StudentManagePage />} />
                  <Route path="*" element={<Navigate to="/admin/dashboard" />} />
                </Routes>
              </AdminLayout>
            } 
          />
        </Route>

        {/* Superadmin login/register */}
        <Route path="/superadmin/login" element={<SuperAdminLoginPage setToken={setToken} />} />

        {/* Superadmin Protected Routes */}
        <Route element={<ProtectedRoute allowedRoles={['superadmin']} /> }>
          <Route 
            path="/superadmin/*"
            element={
              <SuperAdminLayout setToken={setToken}>
                <Routes>
                  <Route path="dashboard" element={<SuperAdminDashboard />} />
                  <Route path="wordbooks" element={<WordbookListPage />} />
                  <Route path="wordbooks/:wordbookId" element={<WordbookDetailsPage />} />
                  <Route path="add-word" element={<AddWordPage />} />
                  <Route path="word-list" element={<WordListPage />} />
                  <Route path="*" element={<Navigate to="/superadmin/dashboard" />} />
                </Routes>
              </SuperAdminLayout>
            }
          />
        </Route>

        {/* Student Protected Routes */}
        <Route 
          element={<ProtectedRoute allowedRoles={['user']} />}
        >
          <Route 
            path="/student/*"
            element={
              <StudentLayout setToken={setToken}>
                <Routes>
                  <Route path="dashboard" element={<StudentDashboard />} />
                  <Route path="profile" element={<StudentProfilePage />} />
                  <Route path="word-practice" element={<WordPracticePage />} />
                  <Route path="word-overview" element={<WordOverviewPage />} />
                  <Route path="quizzes" element={<StudentQuizListPage />} />
                  <Route path="my-wordbooks" element={<StudentWordbooksPage />} />
                  <Route path="stats" element={<StudentStatsPage />} />
                  <Route path="bookmarks" element={<MyBookmarksPage />} />
                  <Route path="*" element={<Navigate to="/student/dashboard" />} />
                </Routes>
              </StudentLayout>
            }
          />
        </Route>

        {/* Quiz Taking (Admins or Students) */}
        <Route element={<ProtectedRoute allowedRoles={['admin','user']} /> }>
          <Route path="/quiz/:quizId" element={<StudentLayout setToken={setToken}><TakeQuizPage /></StudentLayout>} />
          <Route path="/quiz-results" element={<StudentLayout setToken={setToken}><QuizResultsPage /></StudentLayout>} />
          {/* Review routes wrapped with Student layout for consistent nav */}
          <Route path="/review" element={<StudentLayout setToken={setToken}><ReviewPage /></StudentLayout>} />
          <Route path="/review/:quizId" element={<StudentLayout setToken={setToken}><ReviewQuizAttemptsPage /></StudentLayout>} />
          <Route path="/review/attempt/:resultId" element={<StudentLayout setToken={setToken}><ReviewAttemptPage /></StudentLayout>} />
          {/* My Bookmarks top-level alias */}
          <Route path="/bookmarks" element={<StudentLayout setToken={setToken}><MyBookmarksPage /></StudentLayout>} />
        </Route>

        {/* Fallback Route */}
        <Route 
          path="*"
          element={<Navigate to="/login" />}
        />
      </Routes>
    </Router>
  );
}

export default App;
