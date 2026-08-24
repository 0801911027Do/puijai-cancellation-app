import React, { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { Cancellation } from '../types';
import { googleSignIn, logout, initAuth } from '../lib/firebaseAuth';
import { createCancellationSpreadsheet, appendCancellationRecord, readSpreadsheetValues, SheetInfo } from '../lib/googleSheets';
import { FileSpreadsheet, ExternalLink, RefreshCw, CheckCircle2, AlertCircle, LogOut, Sparkles, Download, Layers } from 'lucide-react';

interface GoogleSheetsManagerProps {
  cancellations: Cancellation[];
  onAutoSyncSpreadsheetIdChange?: (id: string | null) => void;
}

export function GoogleSheetsManager({ cancellations, onAutoSyncSpreadsheetIdChange }: GoogleSheetsManagerProps) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [activeSheet, setActiveSheet] = useState<SheetInfo | null>(() => {
    const saved = localStorage.getItem('puijai_active_sheet');
    return saved ? JSON.parse(saved) : null;
  });

  const [customSheetId, setCustomSheetId] = useState(
    'https://docs.google.com/spreadsheets/d/1gKkHEsunANN_5OAzVigbFxE5XFf7VRLlYiQA6RgOCIY/edit?gid=0#gid=0'
  );
  const [isProcessing, setIsProcessing] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [previewRows, setPreviewRows] = useState<string[][] | null>(null);
  const [autoSyncEnabled, setAutoSyncEnabled] = useState<boolean>(() => {
    return localStorage.getItem('puijai_auto_sync') === 'true';
  });

  useEffect(() => {
    const unsubscribe = initAuth(
      (currentUser, accessToken) => {
        setUser(currentUser);
        setToken(accessToken);
      },
      () => {
        setUser(null);
        setToken(null);
      }
    );
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (activeSheet) {
      localStorage.setItem('puijai_active_sheet', JSON.stringify(activeSheet));
      if (autoSyncEnabled && onAutoSyncSpreadsheetIdChange) {
        onAutoSyncSpreadsheetIdChange(activeSheet.spreadsheetId);
      }
    } else {
      localStorage.removeItem('puijai_active_sheet');
      if (onAutoSyncSpreadsheetIdChange) {
        onAutoSyncSpreadsheetIdChange(null);
      }
    }
  }, [activeSheet, autoSyncEnabled, onAutoSyncSpreadsheetIdChange]);

  const handleLogin = async () => {
    setIsLoggingIn(true);
    setMessage(null);
    try {
      const res = await googleSignIn();
      if (res) {
        setUser(res.user);
        setToken(res.accessToken);
        setMessage({ type: 'success', text: `เข้าสู่ระบบด้วย Google สำเร็จ (${res.user.email})` });
      }
    } catch (err: any) {
      console.error(err);
      setMessage({ type: 'error', text: 'ไม่สามารถเข้าสู่ระบบ Google ได้ กรุณาลองใหม่อีกครั้ง' });
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    setUser(null);
    setToken(null);
    setMessage({ type: 'success', text: 'ออกจากระบบ Google เรียบร้อย' });
  };

  const handleCreateSheet = async () => {
    if (!token) {
      setMessage({ type: 'error', text: 'กรุณาลงชื่อเข้าใช้ด้วย Google ก่อนสร้างไฟล์' });
      return;
    }

    const confirmCreate = window.confirm(
      `คุณต้องการสร้างไฟล์ Google Spreadsheet ใหม่ใน Google Drive ของคุณ และส่งออกข้อมูลคำขอจำนวน ${cancellations.length} รายการใช่หรือไม่?`
    );
    if (!confirmCreate) return;

    setIsProcessing(true);
    setMessage(null);
    try {
      const sheet = await createCancellationSpreadsheet(
        token,
        `ปุยใจ (Puijai) - บันทึกคำขอยกเลิก (${new Date().toLocaleDateString('th-TH')})`,
        cancellations
      );
      setActiveSheet(sheet);
      setMessage({
        type: 'success',
        text: `สร้างไฟล์ Google Sheets สำเร็จ! บันทึกข้อมูล ${cancellations.length} รายการลงในตารางเรียบร้อย`
      });
    } catch (err: any) {
      console.error(err);
      setMessage({ type: 'error', text: `เกิดข้อผิดพลาดในการสร้าง Google Sheets: ${err.message}` });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConnectCustomSheet = async () => {
    if (!customSheetId.trim()) return;
    if (!token) {
      setMessage({ type: 'error', text: 'กรุณาลงชื่อเข้าใช้ด้วย Google ก่อนเชื่อมต่อ' });
      return;
    }

    // Extract ID if full URL pasted
    let id = customSheetId.trim();
    const match = id.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (match) id = match[1];

    setIsProcessing(true);
    setMessage(null);
    try {
      const rows = await readSpreadsheetValues(token, id, 'A1:I5');
      const info: SheetInfo = {
        spreadsheetId: id,
        spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${id}`,
        title: `Google Sheet (${id.substring(0, 8)}...)`
      };
      setActiveSheet(info);
      setPreviewRows(rows);
      setCustomSheetId('');
      setMessage({ type: 'success', text: 'เชื่อมต่อ Google Spreadsheet สำเร็จ!' });
    } catch (err: any) {
      console.error(err);
      let errText = err.message || '';
      if (errText.includes('insufficient authentication scopes') || errText.includes('insufficient permissions')) {
        errText = 'สิทธิ์การเข้าถึงไม่เพียงพอ: กรุณากดปุ่ม "Sign in with Google" ด้านบนเพื่อลงชื่อเข้าใช้อีกครั้ง และติ๊กอนุญาตสิทธิ์ Google Sheets และ Drive';
      }
      setMessage({ type: 'error', text: `ไม่สามารถเข้าถึง Spreadsheet ID นี้ได้: ${errText}` });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSyncCurrentData = async () => {
    if (!token || !activeSheet) return;
    const confirmSync = window.confirm(
      `ต้องการสร้าง Google Sheet ใหม่และส่งออกข้อมูลอัปเดตล่าสุด ${cancellations.length} รายการใช่หรือไม่?`
    );
    if (!confirmSync) return;

    setIsProcessing(true);
    setMessage(null);
    try {
      const sheet = await createCancellationSpreadsheet(
        token,
        `ปุยใจ (Puijai) - บันทึกคำขอยกเลิก (อัปเดต ${new Date().toLocaleTimeString('th-TH')})`,
        cancellations
      );
      setActiveSheet(sheet);
      setMessage({ type: 'success', text: 'ส่งออกข้อมูลล่าสุดไปยัง Google Sheets เรียบร้อยแล้ว' });
    } catch (err: any) {
      console.error(err);
      setMessage({ type: 'error', text: `ส่งออกข้อมูลล้มเหลว: ${err.message}` });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReadSheet = async () => {
    if (!token || !activeSheet) return;
    setIsProcessing(true);
    try {
      const rows = await readSpreadsheetValues(token, activeSheet.spreadsheetId, 'รายการคำขอยกเลิก!A1:I20');
      setPreviewRows(rows);
      setMessage({ type: 'success', text: `โหลดข้อมูลจาก Google Sheets สำเร็จ (${rows.length} แถว)` });
    } catch (err: any) {
      console.error(err);
      setMessage({ type: 'error', text: `อ่านข้อมูลจาก Google Sheets ล้มเหลว: ${err.message}` });
    } finally {
      setIsProcessing(false);
    }
  };

  const toggleAutoSync = () => {
    const nextVal = !autoSyncEnabled;
    setAutoSyncEnabled(nextVal);
    localStorage.setItem('puijai_auto_sync', String(nextVal));
    if (nextVal && activeSheet && onAutoSyncSpreadsheetIdChange) {
      onAutoSyncSpreadsheetIdChange(activeSheet.spreadsheetId);
    } else if (onAutoSyncSpreadsheetIdChange) {
      onAutoSyncSpreadsheetIdChange(null);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-emerald-200 shadow-xs overflow-hidden mb-8">
      {/* Header Banner */}
      <div className="bg-linear-to-r from-emerald-600 to-teal-700 text-white p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-white/10 rounded-lg backdrop-blur-xs shrink-0">
            <FileSpreadsheet className="w-7 h-7 text-emerald-100" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-lg text-white">Google Sheets Integration</h3>
              <span className="px-2 py-0.5 bg-emerald-400/20 text-emerald-100 border border-emerald-300/30 rounded-full text-xs font-medium">
                Google Workspace API
              </span>
            </div>
            <p className="text-emerald-100 text-xs sm:text-sm mt-0.5">
              เชื่อมต่อ Google Sheets เพื่อซิงก์ บันทึก และส่งออกข้อมูลคำขอยกเลิกอัตโนมัติ
            </p>
          </div>
        </div>

        {/* User Google Auth Status */}
        <div className="shrink-0 flex items-center">
          {user ? (
            <div className="flex items-center gap-3 bg-white/10 p-2 pr-3 rounded-lg backdrop-blur-xs border border-white/20">
              {user.photoURL ? (
                <img src={user.photoURL} alt={user.displayName || 'Google Account'} className="w-8 h-8 rounded-full border border-white/40" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-emerald-300 text-emerald-900 font-bold flex items-center justify-center text-xs">
                  {user.displayName?.[0] || 'G'}
                </div>
              )}
              <div className="text-left text-xs">
                <div className="font-semibold text-white leading-tight">{user.displayName || 'Google Account'}</div>
                <div className="text-emerald-200 text-[11px] truncate max-w-[140px]">{user.email}</div>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="p-1.5 text-emerald-200 hover:text-white hover:bg-white/20 rounded transition-colors"
                title="ออกจากระบบ Google"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleLogin}
              disabled={isLoggingIn}
              className="gsi-material-button inline-flex items-center gap-2 bg-white text-slate-700 hover:bg-slate-50 font-medium px-4 py-2.5 rounded-lg shadow-sm border border-slate-200 transition-all text-xs sm:text-sm cursor-pointer"
            >
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 48 48">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
              </svg>
              <span>{isLoggingIn ? 'กำลังเชื่อมต่อ...' : 'Sign in with Google'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Body Content */}
      <div className="p-4 sm:p-6 space-y-6">
        {/* Status Alerts */}
        {message && (
          <div
            className={`p-3.5 rounded-lg border text-xs sm:text-sm flex items-start gap-2.5 ${
              message.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : 'bg-rose-50 text-rose-800 border-rose-200'
            }`}
          >
            {message.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            )}
            <div className="flex-1 font-medium">{message.text}</div>
          </div>
        )}

        {/* Section 1: Active Connected Sheet Info or Creation */}
        {!user ? (
          <div className="bg-slate-50 border border-dashed border-slate-300 rounded-xl p-6 text-center">
            <Sparkles className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
            <h4 className="font-bold text-slate-800 text-base mb-1">ปลดล็อกการใช้งาน Google Sheets</h4>
            <p className="text-xs text-slate-600 max-w-md mx-auto mb-4">
              คลิกปุ่ม "Sign in with Google" ด้านบน เพื่ออนุญาตสิทธิ์การเข้าถึง Google Sheets จากนั้นคุณจะสามารถส่งออก ซิงก์ข้อมูล และสร้างรายงานใน Google Drive ได้ทันที
            </p>
            <button
              type="button"
              onClick={handleLogin}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs sm:text-sm rounded-lg transition-colors cursor-pointer inline-flex items-center gap-2 shadow-xs"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>เข้าสู่ระบบเพื่อใช้งาน Google Sheets</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Box A: Connected Sheet Card */}
            <div className="bg-emerald-50/60 border border-emerald-200 rounded-xl p-4 sm:p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-800 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    ไฟล์ Google Sheet ที่เชื่อมต่ออยู่
                  </span>
                  {activeSheet && (
                    <a
                      href={activeSheet.spreadsheetUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-emerald-700 hover:text-emerald-900 font-medium hover:underline"
                    >
                      <span>เปิดใน Google Sheets</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>

                {activeSheet ? (
                  <div className="space-y-2">
                    <div className="font-bold text-slate-900 text-sm sm:text-base break-words">
                      {activeSheet.title}
                    </div>
                    <div className="text-xs text-slate-500 font-mono break-all bg-white/80 p-2 rounded border border-emerald-100">
                      ID: {activeSheet.spreadsheetId}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 py-2">
                    ยังไม่มีไฟล์ Google Spreadsheet ที่เชื่อมต่อ กดปุ่มเพื่อสร้างไฟล์ใหม่ใน Google Drive ของคุณ
                  </p>
                )}
              </div>

              <div className="pt-4 mt-2 border-t border-emerald-200/60 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleCreateSheet}
                  disabled={isProcessing}
                  className="flex-1 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-medium text-xs rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-2xs"
                >
                  <Download className="w-4 h-4" />
                  <span>{activeSheet ? 'สร้างไฟล์ใหม่ + ส่งออก' : 'สร้างไฟล์ Google Sheets ใน Drive'}</span>
                </button>

                {activeSheet && (
                  <button
                    type="button"
                    onClick={handleSyncCurrentData}
                    disabled={isProcessing}
                    className="px-3 py-2 bg-white hover:bg-emerald-100 border border-emerald-300 text-emerald-800 font-medium text-xs rounded-lg transition-colors cursor-pointer flex items-center gap-1"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isProcessing ? 'animate-spin' : ''}`} />
                    <span>ส่งออกข้อมูลล่าสุด</span>
                  </button>
                )}
              </div>
            </div>

            {/* Box B: Auto-Sync & Custom Sheet ID Connect */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 sm:p-5 flex flex-col justify-between">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-3 flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-emerald-600" />
                  การตั้งค่า Auto-Sync & นำเข้า
                </h4>

                {/* Auto Sync Toggle */}
                <div className="p-3 bg-white rounded-lg border border-slate-200 mb-4 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-bold text-slate-800">Auto-Sync คำขอยกเลิกใหม่</div>
                    <p className="text-[11px] text-slate-500">
                      เมื่อมีผู้ใช้นำเสนอคำขอยกเลิกใหม่ จะเพิ่มแถวใน Google Sheet ทันที
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={toggleAutoSync}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                      autoSyncEnabled ? 'bg-emerald-600' : 'bg-slate-300'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-xs ring-0 transition duration-200 ease-in-out ${
                        autoSyncEnabled ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {/* Connect Existing Sheet ID input */}
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    เชื่อมต่อด้วย Spreadsheet ID หรือ URL ที่มีอยู่แล้ว:
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={customSheetId}
                      onChange={(e) => setCustomSheetId(e.target.value)}
                      placeholder="https://docs.google.com/spreadsheets/d/1A2B3C..."
                      className="flex-1 px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                    />
                    <button
                      type="button"
                      onClick={handleConnectCustomSheet}
                      disabled={isProcessing || !customSheetId.trim()}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 disabled:bg-slate-300 text-white text-xs font-medium rounded-lg transition-colors cursor-pointer"
                    >
                      เชื่อมต่อ
                    </button>
                  </div>
                </div>
              </div>

              {activeSheet && (
                <div className="pt-3 mt-3 border-t border-slate-200 text-right">
                  <button
                    type="button"
                    onClick={handleReadSheet}
                    disabled={isProcessing}
                    className="text-xs text-emerald-700 hover:text-emerald-900 font-medium hover:underline inline-flex items-center gap-1"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>ดึงตารางตัวอย่างจาก Google Sheets</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Section 2: Preview Rows Table if Read */}
        {previewRows && previewRows.length > 0 && (
          <div className="mt-4 bg-slate-50 border border-slate-200 rounded-xl p-4 overflow-x-auto">
            <h4 className="text-xs font-bold text-slate-700 mb-2">ตัวอย่างข้อมูลล่าสุดใน Google Sheet ({previewRows.length} แถว):</h4>
            <table className="w-full text-xs text-left text-slate-700 border-collapse bg-white rounded border border-slate-200">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-200">
                  {previewRows[0]?.map((col, idx) => (
                    <th key={idx} className="p-2 border-r border-slate-200 font-bold whitespace-nowrap">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewRows.slice(1).map((row, rIdx) => (
                  <tr key={rIdx} className="border-b border-slate-100 hover:bg-slate-50">
                    {row.map((cell, cIdx) => (
                      <td key={cIdx} className="p-2 border-r border-slate-200 whitespace-nowrap">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
