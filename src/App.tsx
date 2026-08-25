/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, Suspense, lazy } from 'react';
import { Cancellation } from './types';
import { Header } from './components/Header';
import { CancelForm } from './components/CancelForm';

const ThankYouView = lazy(() =>
  import('./components/ThankYouView').then((module) => ({ default: module.ThankYouView }))
);
const AdminDashboard = lazy(() =>
  import('./components/AdminDashboard').then((module) => ({ default: module.AdminDashboard }))
);
const AdminLoginModal = lazy(() =>
  import('./components/AdminLoginModal').then((module) => ({ default: module.AdminLoginModal }))
);

export default function App() {
  const [currentView, setCurrentView] = useState<'user' | 'admin' | 'thankyou'>(() => {
    if (typeof window !== 'undefined') {
      const path = window.location.pathname;
      const search = window.location.search;
      if (path === '/admin' || path.startsWith('/admin') || search.includes('admin=true')) {
        return 'admin';
      }
    }
    return 'user';
  });

  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('puijai_admin_authed') === 'true';
    }
    return false;
  });

  const [cancellations, setCancellations] = useState<Cancellation[]>([]);
  const [lastSubmittedData, setLastSubmittedData] = useState<Cancellation | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch cancellations from Express SQLite backend
  const fetchCancellations = async () => {
    try {
      const res = await fetch('/api/cancellations');
      const data = await res.json();
      if (data.success) {
        setCancellations(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch cancellations:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const syncViewWithUrl = () => {
      const path = window.location.pathname;
      const search = window.location.search;
      if (path === '/admin' || path.startsWith('/admin') || search.includes('admin=true')) {
        setCurrentView('admin');
      } else {
        setCurrentView('user');
      }
    };

    syncViewWithUrl();
    window.addEventListener('popstate', syncViewWithUrl);
    return () => window.removeEventListener('popstate', syncViewWithUrl);
  }, []);

  // Only fetch cancellations when admin view is active
  useEffect(() => {
    if (currentView === 'admin' && isAdminAuthenticated) {
      fetchCancellations();
    }
  }, [currentView, isAdminAuthenticated]);

  const changeView = (view: 'user' | 'admin') => {
    setCurrentView(view);
    if (typeof window !== 'undefined') {
      const newPath = view === 'admin' ? '/admin' : '/';
      window.history.pushState({}, '', newPath);
    }
  };

  const handleAdminLogout = () => {
    sessionStorage.removeItem('puijai_admin_authed');
    setIsAdminAuthenticated(false);
    changeView('user');
  };

  const [showSubmitToast, setShowSubmitToast] = useState(false);

  const handleFormSubmitSuccess = (newRecord: Cancellation) => {
    setLastSubmittedData(newRecord);
    setCancellations((prev) => [newRecord, ...prev]);
    setCurrentView('thankyou');
    setShowSubmitToast(true);
    setTimeout(() => setShowSubmitToast(false), 4000);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col selection:bg-rose-500 selection:text-white">
      {/* Toast Notification */}
      {showSubmitToast && (
        <div className="fixed top-4 right-4 z-50 bg-emerald-600 text-white px-5 py-3 rounded-2xl shadow-xl flex items-center space-x-3 animate-bounce">
          <span className="text-xs sm:text-sm font-bold">✅ บันทึกข้อมูลขอยกเลิกสำเร็จแล้ว!</span>
        </div>
      )}

      {/* Top Header */}
      <Header
        currentView={currentView === 'thankyou' ? 'user' : currentView}
        setCurrentView={changeView}
        totalCancellations={cancellations.length}
        isAdminAuthenticated={isAdminAuthenticated}
        onAdminLogout={handleAdminLogout}
      />

      {/* Main Content Area */}
      <main className="flex-1">
        {currentView === 'user' && (
          <CancelForm onSubmitSuccess={handleFormSubmitSuccess} />
        )}

        <Suspense fallback={
          <div className="flex justify-center items-center py-24">
            <div className="w-8 h-8 border-3 border-pink-500 border-t-transparent rounded-full animate-spin" />
          </div>
        }>
          {currentView === 'thankyou' && lastSubmittedData && (
            <ThankYouView
              cancellationData={lastSubmittedData}
              onResetForm={() => changeView('user')}
              onViewAdmin={() => changeView('admin')}
            />
          )}

          {currentView === 'admin' && (
            !isAdminAuthenticated ? (
              <AdminLoginModal
                onLoginSuccess={() => setIsAdminAuthenticated(true)}
                onCancel={() => changeView('user')}
              />
            ) : (
              <AdminDashboard
                cancellations={cancellations}
                onRefresh={fetchCancellations}
                onViewUserForm={() => changeView('user')}
              />
            )
          )}
        </Suspense>
      </main>

      {/* App Footer */}
      <footer className="border-t border-slate-200 bg-white py-6 text-center text-xs text-slate-700 font-medium">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="leading-relaxed text-center sm:text-left">
            <span className="inline-block">© 2026 Puijai -</span> <span className="inline-block">ระบบศูนย์ขอยกเลิกการใช้งาน</span>
          </div>
          {currentView === 'admin' && (
            <div className="flex items-center space-x-4">
              <button
                onClick={() => changeView('user')}
                className="hover:underline text-slate-600 font-medium"
              >
                หน้าแบบฟอร์มยกเลิก
              </button>
            </div>
          )}
        </div>
      </footer>
    </div>
  );
}
