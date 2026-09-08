import React, { useState, useEffect } from 'react';
import { Cancellation } from '../types';
import {
  CheckCircle2,
  Calendar,
  Tag,
  MessageCircle,
  ChevronLeft,
  ChevronRight,
  Trash2,
  AlertTriangle,
  Loader2,
  RotateCcw,
  Sparkles,
  Menu,
  Settings,
  Search,
  Phone,
  Eye,
  Smartphone,
  BellOff,
  Image,
  Link,
  Folder,
  FileText,
  Camera,
  Mic,
  X
} from 'lucide-react';
import { closeLiffWindow, getCachedLiffProfile } from '../lib/liff';

interface ThankYouViewProps {
  cancellationData: Cancellation;
  onResetForm: () => void;
  onViewAdmin: () => void;
}

// Format time in Thailand Timezone (UTC+7) e.g. "09:45 น."
const getThaiCurrentTime = (): string => {
  try {
    const formatter = new Intl.DateTimeFormat('th-TH', {
      timeZone: 'Asia/Bangkok',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const parts = formatter.formatToParts(new Date());
    const hour = parts.find((p) => p.type === 'hour')?.value || '12';
    const minute = parts.find((p) => p.type === 'minute')?.value || '00';
    return `${hour}:${minute} น.`;
  } catch {
    const now = new Date();
    const utc = now.getTime() + now.getTimezoneOffset() * 60000;
    const thaiDate = new Date(utc + 7 * 3600000);
    const hour = String(thaiDate.getHours()).padStart(2, '0');
    const minute = String(thaiDate.getMinutes()).padStart(2, '0');
    return `${hour}:${minute} น.`;
  }
};

// Real-time Thailand Clock overlay matching native smartphone status bar capsule
const MockupThaiClockBadge: React.FC = () => {
  const [thaiTime, setThaiTime] = useState<string>(getThaiCurrentTime);

  useEffect(() => {
    const updateTime = () => setThaiTime(getThaiCurrentTime());
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div
      className="absolute top-[1.65%] left-[3.7%] z-15 flex items-center justify-center bg-[#292a2d] text-white font-bold rounded-full px-1.5 shadow-xs pointer-events-none select-none"
      style={{
        height: '2.3%',
        minWidth: '14.5%',
        fontSize: 'clamp(7.5px, 2.4cqw, 9px)',
        lineHeight: 1,
        letterSpacing: '-0.01em',
      }}
      title={`เวลาปัจจุบันตามเวลาประเทศไทย: ${thaiTime}`}
    >
      <span className="leading-none pt-[0.5px] whitespace-nowrap">{thaiTime}</span>
    </div>
  );
};

export const ThankYouView: React.FC<ThankYouViewProps> = ({
  cancellationData,
  onResetForm,
}) => {
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeleted, setIsDeleted] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [activeGuideStep, setActiveGuideStep] = useState<number>(1);
  const [showAllSteps, setShowAllSteps] = useState<boolean>(true);

  const handleReturnToLine = () => {
    closeLiffWindow();
  };

  const handleDeleteAllData = async () => {
    setIsDeleting(true);
    setDeleteError(null);
    try {
      const profile = getCachedLiffProfile();
      const userId = profile?.userId || '';
      const username = cancellationData.username;
      const id = cancellationData.id;

      const res = await fetch('/api/cancellations/delete-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, username, id }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'ไม่สามารถลบข้อมูลได้ กรุณาลองใหม่อีกครั้ง');
      }

      // Clear client-side cache & localStorage keys
      try {
        localStorage.removeItem(`puijai_sync_status_${cancellationData.id}`);
        localStorage.removeItem('puijai_last_submitted_id');
        localStorage.removeItem('puijai_registered_cancellation_id');
        if (userId) {
          localStorage.removeItem(`puijai_client_round_${userId}`);
        }
      } catch (e) {}

      setIsDeleted(true);
      setShowDeleteModal(false);
    } catch (err: any) {
      setDeleteError(err.message || 'เกิดข้อผิดพลาดในการลบข้อมูล');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto py-8 sm:py-12 px-4">
      <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-xl text-center space-y-6">
        {/* Success Icon Badge */}
        <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-inner ring-4 ring-emerald-50">
          <CheckCircle2 className="w-10 h-10 stroke-[2.5]" />
        </div>

        {/* Main Message requested in Thai requirement */}
        <div className="space-y-2">
          <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            ขอบคุณสำหรับข้อมูลและข้อเสนอแนะของคุณ 🙏
          </h2>
          <p className="text-base font-semibold text-emerald-700 bg-emerald-50 py-2 px-4 rounded-xl border border-emerald-200 inline-block">
            เราได้รับและบันทึกคำขอยกเลิกบริการเรียบร้อยแล้ว
          </p>
        </div>

        <p className="text-sm text-slate-600 leading-relaxed max-w-md mx-auto">
          <span className="inline-block">คำขอยกเลิกบริการแชทบอท</span> <span className="font-bold text-slate-800 inline-block">"Puijai"</span> <span className="inline-block">รหัสคำขอ</span> <span className="font-mono font-bold text-pink-600 bg-pink-50 px-2 py-0.5 rounded border border-pink-200 whitespace-nowrap inline-block">{cancellationData.id}</span> <span className="inline-block">ถูกบันทึกเข้าสู่ฐานข้อมูลเรียบร้อยแล้ว</span> <span className="inline-block">แชทบอทจะหยุดการตอบกลับอัตโนมัติ</span><span className="inline-block">สำหรับบัญชีของคุณ</span> <span className="inline-block">หากในอนาคตต้องการกลับมาใช้งานใหม่</span> <span className="inline-block">น้องปุยใจยินดีต้อนรับเสมอครับ ☁️</span>
        </p>

        {/* Cancellation Summary Ticket Box */}
        <div className="bg-slate-50 rounded-2xl p-4 sm:p-5 border border-slate-200 text-left space-y-3 text-xs overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2.5 gap-2 flex-wrap sm:flex-nowrap">
            <span className="text-slate-700 font-bold uppercase tracking-wider whitespace-nowrap shrink-0">
              รหัสอ้างอิงคำขอ
            </span>
            <div className="flex items-center space-x-2 shrink-0">
              <span className="font-mono font-bold text-slate-800 bg-white px-2.5 py-0.5 rounded-lg border border-slate-200 whitespace-nowrap shrink-0 shadow-2xs text-xs sm:text-sm tracking-tight">
                {cancellationData.id}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-800 font-medium">
            <div className="flex items-center space-x-1.5 min-w-0">
              <Calendar className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <span className="truncate">{new Date(cancellationData.created_at).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}</span>
            </div>
            <div className="flex items-center space-x-1.5 min-w-0">
              <Tag className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <span className="font-semibold text-slate-900 truncate">{cancellationData.category}</span>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-200">
            <span className="text-slate-800 font-bold block mb-1">เหตุผลที่ระบุ:</span>
            <p className="text-slate-900 italic bg-white p-2.5 rounded-lg border border-slate-200 break-words leading-relaxed text-xs">
              "{cancellationData.reason}"
            </p>
          </div>
        </div>

        {/* Interactive Delete Data Card matching user's real LINE screenshot */}
        <div className="border border-slate-200 rounded-3xl overflow-hidden bg-white shadow-sm text-left">
          {/* Header matching real LINE '< ลบข้อมูล' */}
          <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between gap-2">
            <div className="flex items-center space-x-2 text-slate-900 font-bold text-base min-w-0">
              <ChevronLeft className="w-5 h-5 text-slate-800 stroke-[2.5] shrink-0" />
              <span className="truncate">ลบข้อมูล</span>
            </div>
            <span className="text-[11px] text-slate-500 font-medium bg-slate-100 px-2.5 py-1 rounded-full whitespace-nowrap shrink-0">
              จัดการข้อมูลความเป็นส่วนตัว
            </span>
          </div>

          <div className="p-4 space-y-4">
            {!isDeleted ? (
              <>
                <p className="text-xs text-slate-600 leading-relaxed px-1">
                  เมื่อยกเลิกบริการเสร็จสิ้น ท่านสามารถเลือกได้ว่าจะลบข้อมูลออกจากระบบหรือเก็บข้อมูลไว้:
                </p>

                {/* The Exact Action Button styled to match real LINE 'ลบข้อมูล' screen */}
                <div className="border-y border-slate-200 -mx-4 px-4 py-3.5 bg-white hover:bg-rose-50/40 transition-colors cursor-pointer group">
                  <button
                    type="button"
                    onClick={() => setShowDeleteModal(true)}
                    className="w-full text-center sm:text-left flex flex-col sm:flex-row items-center justify-between gap-1 cursor-pointer"
                  >
                    <div className="w-full text-left">
                      <div className="text-base font-bold text-[#ff3b30] group-hover:text-rose-700 tracking-tight transition-colors">
                        ลบข้อมูลแชทและข้อความแชททั้งหมด
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5 font-normal">
                        ข้อมูลแชทและข้อความแชททั้งหมดจะถูกลบ
                      </div>
                    </div>
                    <span className="text-[11px] font-semibold text-rose-600 bg-rose-50 px-2.5 py-1 rounded-full border border-rose-200 whitespace-nowrap shrink-0 mt-2 sm:mt-0">
                      แตะเพื่อลบ
                    </span>
                  </button>
                </div>
              </>
            ) : (
              <div className="space-y-3">
                {/* Deleted Confirmation Badge */}
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center space-x-2.5 text-emerald-800 text-xs font-semibold">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>ลบข้อมูลในระบบและ Google Sheets เรียบร้อยแล้ว</span>
                </div>
              </div>
            )}

            {/* Visual Guide: 4 Steps referencing authentic LINE screens */}
            <div className="mt-4 pt-4 border-t border-slate-100 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="font-bold text-slate-900 flex items-center space-x-1.5 text-xs sm:text-sm min-w-0">
                  <Smartphone className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="leading-snug">ภาพประกอบวิธีลบแชทใน LINE (อ้างอิงจากแอป LINE จริง 4 สเต็ป):</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAllSteps(!showAllSteps)}
                  className="text-[11px] text-emerald-600 hover:text-emerald-700 font-semibold cursor-pointer underline flex items-center space-x-1 whitespace-nowrap shrink-0"
                >
                  <Eye className="w-3 h-3" />
                  <span>{showAllSteps ? 'ดูทีละสเต็ป' : 'ดูภาพทั้งหมด'}</span>
                </button>
              </div>

              {/* Step Navigation Tabs */}
              {!showAllSteps && (
                <div className="grid grid-cols-4 gap-1 p-1 bg-slate-100 rounded-xl text-[11px] font-semibold">
                  {[1, 2, 3, 4].map((step) => (
                    <button
                      key={step}
                      type="button"
                      onClick={() => setActiveGuideStep(step)}
                      className={`py-1.5 rounded-lg transition-all cursor-pointer text-center ${
                        activeGuideStep === step
                          ? 'bg-white text-emerald-700 font-bold shadow-xs'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      สเต็ป {step}
                    </button>
                  ))}
                </div>
              )}

              {/* Step Cards List with REAL LINE SCREENSHOTS */}
              <div className="space-y-6">
                {/* STEP 1: หน้าห้องแชท LINE (Chat Room) */}
                {(showAllSteps || activeGuideStep === 1) && (
                  <div className="bg-white border-2 border-emerald-100 rounded-3xl p-4 sm:p-5 space-y-3 text-left shadow-sm">
                    {/* Header Row: Step number and indicator on the right */}
                    <div className="flex items-center justify-between pb-1.5 border-b border-emerald-100/70">
                      <div className="flex items-center space-x-2">
                        <span className="w-5 h-5 rounded-full bg-emerald-600 text-white font-bold text-xs flex items-center justify-center shadow-xs">
                          1
                        </span>
                        <span className="font-bold text-xs text-emerald-800 tracking-tight whitespace-nowrap">
                          ขั้นตอนที่ 1
                        </span>
                      </div>
                      <span className="text-[10px] sm:text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200 whitespace-nowrap shadow-2xs">
                        สเต็ป 1 จาก 4
                      </span>
                    </div>

                    {/* Instruction Title: Full width without any squishing or broken words */}
                    <div className="text-xs sm:text-sm font-bold text-slate-800 leading-normal">
                      <span className="inline-block">ในห้องแชทน้องปุยใจ</span> <span className="inline-block">แตะไอคอน</span> <strong className="text-rose-600 font-extrabold text-sm inline-block">☰ (มุมขวาบน)</strong>
                    </div>

                    {/* Smartphone Mockup: Real Chat Room Screenshot with Exact Click Target */}
                    <div className="max-w-[310px] sm:max-w-[330px] mx-auto rounded-[32px] border-[5px] border-slate-900 bg-black overflow-hidden shadow-2xl relative">
                      <div className="relative w-full aspect-[475/1024] bg-slate-900">
                        <img
                          src="/line-step1.png?v=3"
                          alt="สเต็ป 1: ในห้องแชทน้องปุยใจ แตะไอคอน ☰ มุมขวาบน"
                          className="w-full h-full object-cover select-none pointer-events-none"
                        />

                        {/* Live Thailand Status Bar Clock Overlay */}
                        <MockupThaiClockBadge />

                        {/* EXACT TARGET: Top-right Hamburger Menu ☰ */}
                        <div className="absolute top-[5.2%] right-[2.0%] w-[12.5%] h-[5.8%] rounded-full border-3 border-rose-600 bg-rose-500/20 ring-4 ring-rose-500/80 shadow-lg shadow-rose-500/60 animate-pulse pointer-events-none z-10"></div>
                        
                        {/* Bouncing Hand / Pointer Tag with Upward Arrow pointing straight at ☰ */}
                        <div className="absolute top-[12.5%] right-[2.0%] z-20 flex flex-col items-end animate-bounce">
                          {/* Upward Arrow pointer precisely aligned with ☰ */}
                          <div className="mr-[18px] w-0 h-0 border-x-[7px] border-x-transparent border-b-[9px] border-b-rose-600 drop-shadow-md"></div>
                          <div className="bg-rose-600 text-white text-[10px] sm:text-[11px] font-extrabold px-3 py-1.5 rounded-xl shadow-2xl flex items-center space-x-1.5 whitespace-nowrap border border-white/30">
                            <span>1. แตะไอคอน ☰ (มุมขวาบน)</span>
                            <span className="text-xs">👆</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* STEP 2: เมนูห้องแชท (Menu Drawer) */}
                {(showAllSteps || activeGuideStep === 2) && (
                  <div className="bg-white border-2 border-emerald-100 rounded-3xl p-4 sm:p-5 space-y-3 text-left shadow-sm">
                    {/* Header Row: Step number and indicator on the right */}
                    <div className="flex items-center justify-between pb-1.5 border-b border-emerald-100/70">
                      <div className="flex items-center space-x-2">
                        <span className="w-5 h-5 rounded-full bg-emerald-600 text-white font-bold text-xs flex items-center justify-center shadow-xs">
                          2
                        </span>
                        <span className="font-bold text-xs text-emerald-800 tracking-tight whitespace-nowrap">
                          ขั้นตอนที่ 2
                        </span>
                      </div>
                      <span className="text-[10px] sm:text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200 whitespace-nowrap shadow-2xs">
                        สเต็ป 2 จาก 4
                      </span>
                    </div>

                    {/* Instruction Title: Full width without any squishing or broken words */}
                    <div className="text-xs sm:text-sm font-bold text-slate-800 leading-normal">
                      <span className="inline-block">ในแถบเมนู</span> <span className="inline-block">ให้เลื่อนลงมาแล้วแตะ</span> <strong className="text-rose-600 font-extrabold text-sm inline-block">"ตั้งค่า" (Settings)</strong>
                    </div>

                    {/* Smartphone Mockup: Real Drawer Screenshot with Exact Click Target */}
                    <div className="max-w-[310px] sm:max-w-[330px] mx-auto rounded-[32px] border-[5px] border-slate-900 bg-black overflow-hidden shadow-2xl relative">
                      <div className="relative w-full aspect-[475/1024] bg-slate-900">
                        <img
                          src="/line-step2.png?v=3"
                          alt="สเต็ป 2: แตะที่ ตั้งค่า"
                          className="w-full h-full object-cover select-none pointer-events-none"
                        />

                        {/* Live Thailand Status Bar Clock Overlay */}
                        <MockupThaiClockBadge />

                        {/* EXACT TARGET: ⚙️ ตั้งค่า (Settings) */}
                        <div className="absolute top-[60.5%] left-[2.5%] w-[95%] h-[5.2%] rounded-xl border-3 border-rose-600 bg-rose-500/25 ring-4 ring-rose-500/80 shadow-lg shadow-rose-500/50 animate-pulse pointer-events-none z-10"></div>

                        {/* Bouncing Pointer Tag pointing down to ⚙️ ตั้งค่า */}
                        <div className="absolute top-[52.0%] right-[4%] z-20 flex flex-col items-end animate-bounce">
                          <div className="bg-rose-600 text-white text-[10px] sm:text-[11px] font-extrabold px-3 py-1.5 rounded-xl shadow-2xl flex items-center space-x-1.5 whitespace-nowrap border border-white/30">
                            <span>2. แตะที่นี่ "ตั้งค่า"</span>
                            <span className="text-xs">👇</span>
                          </div>
                          <div className="mr-8 w-0 h-0 border-x-[7px] border-x-transparent border-t-[9px] border-t-rose-600 drop-shadow-md"></div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* STEP 3: หน้าจอตั้งค่าการแชท (Chat Settings) */}
                {(showAllSteps || activeGuideStep === 3) && (
                  <div className="bg-white border-2 border-emerald-100 rounded-3xl p-4 sm:p-5 space-y-3 text-left shadow-sm">
                    {/* Header Row: Step number and indicator on the right */}
                    <div className="flex items-center justify-between pb-1.5 border-b border-emerald-100/70">
                      <div className="flex items-center space-x-2">
                        <span className="w-5 h-5 rounded-full bg-emerald-600 text-white font-bold text-xs flex items-center justify-center shadow-xs">
                          3
                        </span>
                        <span className="font-bold text-xs text-emerald-800 tracking-tight whitespace-nowrap">
                          ขั้นตอนที่ 3
                        </span>
                      </div>
                      <span className="text-[10px] sm:text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200 whitespace-nowrap shadow-2xs">
                        สเต็ป 3 จาก 4
                      </span>
                    </div>

                    {/* Instruction Title: Full width without any squishing or broken words */}
                    <div className="text-xs sm:text-sm font-bold text-slate-800 leading-normal">
                      <span className="inline-block">เลื่อนลงมาเลือกหัวข้อ</span> <strong className="text-rose-600 font-extrabold text-sm inline-block">"ลบข้อมูล" (Delete data)</strong>
                    </div>

                    {/* Smartphone Mockup: Real Settings Screenshot with Exact Click Target */}
                    <div className="max-w-[310px] sm:max-w-[330px] mx-auto rounded-[32px] border-[5px] border-slate-900 bg-black overflow-hidden shadow-2xl relative">
                      <div className="relative w-full aspect-[475/1024] bg-slate-900">
                        <img
                          src="/line-step3.png?v=3"
                          alt="สเต็ป 3: แตะที่ ลบข้อมูล"
                          className="w-full h-full object-cover select-none pointer-events-none"
                        />

                        {/* Live Thailand Status Bar Clock Overlay */}
                        <MockupThaiClockBadge />

                        {/* EXACT TARGET: ลบข้อมูล (Delete data) */}
                        <div className="absolute top-[44.9%] left-[2.5%] w-[95%] h-[5.2%] rounded-xl border-3 border-rose-600 bg-rose-500/25 ring-4 ring-rose-500/80 shadow-lg shadow-rose-500/50 animate-pulse pointer-events-none z-10"></div>

                        {/* Bouncing Pointer Tag pointing down to ลบข้อมูล */}
                        <div className="absolute top-[36.5%] right-[4%] z-20 flex flex-col items-end animate-bounce">
                          <div className="bg-rose-600 text-white text-[10px] sm:text-[11px] font-extrabold px-3 py-1.5 rounded-xl shadow-2xl flex items-center space-x-1.5 whitespace-nowrap border border-white/30">
                            <span>3. แตะที่นี่ "ลบข้อมูล"</span>
                            <span className="text-xs">👇</span>
                          </div>
                          <div className="mr-8 w-0 h-0 border-x-[7px] border-x-transparent border-t-[9px] border-t-rose-600 drop-shadow-md"></div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* STEP 4: ภาพหน้าจอจริงของ LINE (ลบข้อมูลแชทและข้อความแชททั้งหมด) */}
                {(showAllSteps || activeGuideStep === 4) && (
                  <div className="bg-white border-2 border-rose-200 rounded-3xl p-4 sm:p-5 space-y-3 text-left shadow-md">
                    {/* Header Row: Step number and indicator on the right */}
                    <div className="flex items-center justify-between pb-1.5 border-b border-rose-200/70">
                      <div className="flex items-center space-x-2">
                        <span className="w-5 h-5 rounded-full bg-rose-600 text-white font-bold text-xs flex items-center justify-center shadow-xs">
                          4
                        </span>
                        <span className="font-bold text-xs text-rose-800 tracking-tight whitespace-nowrap">
                          ขั้นตอนที่ 4
                        </span>
                      </div>
                      <span className="text-[10px] sm:text-xs font-bold text-rose-700 bg-rose-50 px-2.5 py-0.5 rounded-full border border-rose-200 whitespace-nowrap shadow-2xs">
                        สเต็ป 4 จาก 4
                      </span>
                    </div>

                    {/* Instruction Title: Full width without any squishing or broken words */}
                    <div className="text-xs sm:text-sm font-bold text-slate-800 leading-normal">
                      <span className="inline-block">กดที่ปุ่มสีแดง</span> <strong className="text-rose-600 font-extrabold text-sm inline-block">"ลบข้อมูลแชทและข้อความแชททั้งหมด"</strong>
                    </div>

                    {/* Smartphone Mockup: Real Delete Screen with Exact Click Target */}
                    <div className="max-w-[310px] sm:max-w-[330px] mx-auto rounded-[32px] border-[5px] border-slate-900 bg-black overflow-hidden shadow-2xl relative">
                      <div className="relative w-full aspect-[475/1024] bg-slate-900">
                        <img
                          src="/line-step4.png?v=3"
                          alt="สเต็ป 4: ลบข้อมูลแชทและข้อความแชททั้งหมด"
                          className="w-full h-full object-cover select-none pointer-events-none"
                        />

                        {/* Live Thailand Status Bar Clock Overlay */}
                        <MockupThaiClockBadge />

                        {/* EXACT TARGET: ลบข้อมูลแชทและข้อความแชททั้งหมด */}
                        <div className="absolute top-[44.5%] left-[2.5%] w-[95%] h-[8.5%] rounded-2xl border-3 border-rose-600 bg-rose-500/20 ring-4 ring-rose-500/80 shadow-lg shadow-rose-500/60 animate-pulse pointer-events-none z-10"></div>

                        {/* Bouncing Pointer Tag pointing up to the red button */}
                        <div className="absolute top-[54.5%] left-1/2 -translate-x-1/2 z-20 flex flex-col items-center animate-bounce">
                          <div className="w-0 h-0 border-x-[7px] border-x-transparent border-b-[9px] border-b-rose-600 drop-shadow-md"></div>
                          <div className="bg-rose-600 text-white text-[10px] sm:text-[11px] font-extrabold px-3 py-1.5 rounded-xl shadow-2xl flex items-center space-x-1.5 whitespace-nowrap border border-white/30">
                            <span className="text-xs">👆</span>
                            <span>4. แตะปุ่มสีแดงนี้ เพื่อลบข้อความทั้งหมด</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl text-center text-xs text-emerald-800 font-semibold">
                      ✨ เมื่อแตะปุ่มนี้ในแอป LINE แล้ว ข้อความและประวัติการสนทนาบนมือถือของคุณจะถูกลบออกทั้งหมดทันทีครับ
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            type="button"
            onClick={handleReturnToLine}
            className="w-full sm:w-auto px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm flex items-center justify-center space-x-2 shadow-md shadow-emerald-900/20 transition-all cursor-pointer"
          >
            <MessageCircle className="w-4 h-4" />
            <span>กลับไปยังแชท LINE เพื่อทำตามขั้นตอน</span>
          </button>
          <button
            type="button"
            onClick={onResetForm}
            className="w-full sm:w-auto px-4 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs flex items-center justify-center space-x-1.5 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
            <span>ยื่นเรื่องใหม่</span>
          </button>
        </div>
      </div>

      {/* Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-100 text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto ring-8 ring-rose-50">
              <AlertTriangle className="w-7 h-7 stroke-[2]" />
            </div>

            <div className="space-y-2">
              <h3 className="text-lg font-bold text-slate-900">
                ยืนยันการลบข้อมูลทั้งหมด?
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                คุณต้องการลบข้อมูลคำขอยกเลิกและประวัติทั้งหมดใช่หรือไม่?
                <br />
                <span className="text-rose-600 font-medium block mt-1">
                  • ข้อมูลในระบบและ Google Sheets จะถูกลบถาวร
                </span>
                <span className="text-slate-500 text-[11px] block mt-0.5">
                  (เมื่อลบแล้วจะไม่สามารถกู้คืนได้)
                </span>
              </p>
            </div>

            {deleteError && (
              <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs">
                {deleteError}
              </div>
            )}

            <div className="pt-2 flex flex-col gap-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleDeleteAllData}
                className="w-full py-3 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center justify-center space-x-2 transition-colors disabled:opacity-50 cursor-pointer shadow-md shadow-rose-900/20"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>กำลังลบข้อมูล...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>ยืนยันลบข้อมูลทั้งหมด</span>
                  </>
                )}
              </button>

              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setShowDeleteModal(false)}
                className="w-full py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition-colors cursor-pointer"
              >
                ไม่ลบ (เก็บข้อมูลไว้)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
