import { useState } from 'react';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import Login from '@/pages/Login';
import Layout, { type Page } from '@/components/Layout';
import Dashboard from '@/pages/Dashboard';
import Contacts from '@/pages/Contacts';
import CreateMessage from '@/pages/CreateMessage';
import MessageHistory from '@/pages/MessageHistory';
import WhatsAppSettings from '@/pages/WhatsAppSettings';
import Attendance from '@/pages/Attendance';
import Reports from '@/pages/Reports';
import { Loader2 } from 'lucide-react';

function AppContent() {
  const { user, loading } = useAuth();
  const [page, setPage] = useState<Page>('dashboard');

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <Loader2 className="w-9 h-9 text-amber-500 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  return (
    <Layout currentPage={page} onNavigate={setPage}>
      {page === 'dashboard' && <Dashboard />}
      {page === 'contacts' && <Contacts />}
      {page === 'create-message' && (
        <CreateMessage
          onNavigateToSettings={() => setPage('whatsapp-settings')}
          onNavigateToHistory={() => setPage('message-history')}
        />
      )}
      {page === 'message-history' && <MessageHistory />}
      {page === 'whatsapp-settings' && <WhatsAppSettings />}
      {page === 'attendance' && <Attendance />}
      {page === 'reports' && <Reports />}
    </Layout>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
