import React, { useState } from 'react';
import { Lock, KeyRound, Eye, EyeOff, ShieldCheck, AlertCircle, ArrowLeft } from 'lucide-react';

interface AdminLoginModalProps {
  onLoginSuccess: () => void;
  onCancel: () => void;
}

export const AdminLoginModal: React.FC<AdminLoginModalProps> = ({
  onLoginSuccess,
  onCancel,
}) => {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) {
      setErrorMsg('กรุณากรอกรหัสผ่านผู้ดูแลระบบ');
      return;
    }

    setIsLoading(true);
    setErrorMsg('');

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: password.trim() }),
      });

      const data = await res.json();
      if (data.success) {
        sessionStorage.setItem('puijai_admin_authed', 'true');
        onLoginSuccess();
      } else {
        setErrorMsg(data.error || 'รหัสผ่านไม่ถูกต้อง');
      }
    } catch (err) {
      setErrorMsg('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full p-6 sm:p-8 space-y-6 relative overflow-hidden">
        {/* Top Decorative Header */}
        <div className="flex flex-col items-center text-center space-y-3">
          <div className="relative">
            <img
              src="/puijai-logo.jpg"
              alt="Puijai Mascot Logo"
              className="w-16 h-16 rounded-2xl border-2 border-slate-200 shadow-md object-cover ring-2 ring-slate-100"
            />
            <div className="absolute -bottom-1 -right-1 bg-slate-900 text-sky-400 p-1 rounded-lg border border-slate-700 shadow-xs">
              <Lock className="w-3.5 h-3.5" />
            </div>
          </div>
          <div>
            <h3 className="text-xl font-extrabold text-slate-900 tracking-tight">
              เข้าสู่ระบบผู้ดูแลระบบ (Admin)
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              กรุณากรอกรหัสผ่านเพื่อเข้าใช้งานแผงควบคุมข้อมูล
            </p>
          </div>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {errorMsg && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center space-x-2.5">
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              รหัสผ่าน (Admin Password)
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <KeyRound className="w-4 h-4" />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                required
                placeholder="ระบุรหัสผ่าน..."
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 text-slate-900 text-sm transition-all"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm shadow-md transition-all flex items-center justify-center space-x-2 disabled:opacity-50 cursor-pointer"
          >
            {isLoading ? (
              <span>กำลังตรวจสอบ...</span>
            ) : (
              <>
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>ยืนยันเข้าสู่ระบบ</span>
              </>
            )}
          </button>
        </form>

        {/* Back Link */}
        <div className="pt-2 text-center border-t border-slate-100">
          <button
            type="button"
            onClick={onCancel}
            className="text-xs text-slate-500 hover:text-slate-800 font-medium inline-flex items-center space-x-1.5 py-1 px-2 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>กลับไปยังแบบฟอร์มผู้ใช้งาน</span>
          </button>
        </div>
      </div>
    </div>
  );
};
