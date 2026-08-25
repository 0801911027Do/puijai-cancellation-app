import React from 'react';
import { FileSpreadsheet, ShieldAlert, Bot, Sparkles, LogOut } from 'lucide-react';

interface HeaderProps {
  currentView: 'user' | 'admin';
  setCurrentView: (view: 'user' | 'admin') => void;
  totalCancellations: number;
  isAdminAuthenticated?: boolean;
  onAdminLogout?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentView,
  setCurrentView,
  totalCancellations,
  isAdminAuthenticated,
  onAdminLogout,
}) => {
  return (
    <header className="bg-white/95 backdrop-blur border-b border-sky-100 sticky top-0 z-40 shadow-xs">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-2.5 sm:py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-4 overflow-hidden">
        {/* Brand Logo & Title */}
        <div className="flex items-center space-x-2.5 sm:space-x-3 min-w-0">
          <div className="relative flex-shrink-0">
            <img
              src="/puijai-logo.jpg"
              alt="Puijai Logo"
              className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl border border-sky-200 shadow-sm shadow-sky-200/80 object-cover ring-2 ring-sky-100"
            />
            <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-500 border-2 border-white rounded-full" title="ระบบพร้อมใช้งาน"></span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <h1 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight break-words">
                Puijai
              </h1>
              <span className="text-[11px] sm:text-xs font-semibold text-sky-700 bg-sky-50/90 px-2 sm:px-2.5 py-0.5 rounded-full border border-sky-200/80 inline-flex items-center gap-1 whitespace-nowrap">
                <Sparkles className="w-3 h-3 text-sky-500 flex-shrink-0" /> AI Chatbot
              </span>
            </div>
            <p className="text-[11px] sm:text-xs text-slate-700 font-medium leading-relaxed">
              <span className="inline-block">ระบบศูนย์ขอยกเลิกการใช้งาน</span>
            </p>
          </div>
        </div>

        {/* View Switcher Controls - Only displayed in Admin mode */}
        {currentView === 'admin' && (
          <div className="flex items-center space-x-2 bg-slate-100/80 p-1 rounded-xl border border-slate-200">
            <div className="bg-white text-blue-700 shadow-xs font-semibold border border-blue-100 px-3.5 py-1.5 rounded-lg text-xs flex items-center space-x-1.5">
              <FileSpreadsheet className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <span>แผงควบคุม Admin</span>
              {totalCancellations > 0 && (
                <span className="bg-sky-100 text-sky-800 text-[10px] font-bold px-1.5 py-0.2 rounded-full border border-sky-200 ml-1">
                  {totalCancellations}
                </span>
              )}
            </div>

            {isAdminAuthenticated && onAdminLogout && (
              <button
                type="button"
                onClick={onAdminLogout}
                className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-rose-600 hover:text-rose-700 hover:bg-rose-50 transition-colors flex items-center space-x-1 cursor-pointer"
                title="ออกจากระบบ Admin"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">ออกจากระบบ</span>
              </button>
            )}
          </div>
        )}
      </div>
    </header>
  );
};
