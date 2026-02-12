import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from './store/authStore';
import Layout from './components/Layout';
import Login from './pages/Login';
import Users from './pages/Users';
import Dashboard from './pages/Dashboard';
import Partners from './pages/Partners';
import Batches from './pages/Batches';
import BatchDetail from './pages/BatchDetail';
import InvoiceMCCs from './pages/InvoiceMCCs';
import InvoiceMCCDetail from './pages/InvoiceMCCDetail';
import Customers from './pages/Customers';
import CustomerDetail from './pages/CustomerDetail';
import Accounts from './pages/Accounts';
import AccountDetail from './pages/AccountDetail';
import PartnerDetail from './pages/PartnerDetail';
import Import from './pages/Import';
import ActivityLogs from './pages/ActivityLogs';
import QuickLinkTool from './pages/QuickLinkTool';
import './App.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuthStore();

  if (isLoading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
      </div>
    );
  }

  return isAuthenticated ? <>{children}</> : <Navigate to="/login" />;
}

function AppRoutes() {
  const { checkAuth, isLoading } = useAuthStore();

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  if (isLoading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <PrivateRoute>
            <Layout />
          </PrivateRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="batches" element={<Batches />} />
        <Route path="batches/:id" element={<BatchDetail />} />
        <Route path="partners" element={<Partners />} />
        <Route path="partners/:id" element={<PartnerDetail />} />
        <Route path="invoice-mccs" element={<InvoiceMCCs />} />
        <Route path="invoice-mccs/:id" element={<InvoiceMCCDetail />} />
        <Route path="customers" element={<Customers />} />
        <Route path="customers/:id" element={<CustomerDetail />} />
        <Route path="accounts" element={<Accounts />} />
        <Route path="accounts/:id" element={<AccountDetail />} />
        <Route path="import" element={<Import />} />
        <Route path="quick-link" element={<QuickLinkTool />} />
        <Route path="activity-logs" element={<ActivityLogs />} />
        <Route path="users" element={<Users />} />
      </Route>
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
