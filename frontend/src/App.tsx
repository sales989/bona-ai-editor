import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './utils/auth';
import LoginPage from './pages/Login';
import WorkbenchPage from './pages/Workbench';
import TasksPage from './pages/Tasks';
import AdminPage from './pages/Admin';

const AppContent: React.FC = () => {
  const { user, loading } = useAuth();
  const [route, setRoute] = useState(window.location.hash.slice(1) || '/');

  useEffect(() => {
    const onHashChange = () => setRoute(window.location.hash.slice(1) || '/');
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin w-10 h-10 border-2 border-primary-600 border-t-transparent rounded-full mx-auto mb-3" />
          <p className="text-gray-500">加载中...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  if (route.startsWith('/tasks')) {
    return <TasksPage />;
  }

  if (route.startsWith('/admin')) {
    return <AdminPage />;
  }

  return <WorkbenchPage />;
};

const App: React.FC = () => {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
};

export default App;
