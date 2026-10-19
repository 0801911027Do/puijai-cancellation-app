import React, { useState, useEffect } from 'react';
import { Cancellation } from '../types';
import {
  CheckCircle2,
  Calendar,
  Tag,
  MessageCircle,
  RotateCcw,
  Eye,
  Smartphone,
  Check,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { closeLiffWindow } from '../lib/liff';

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

// Real-time Thailand Clock overlay matching native smartphone status bar
const MockupThaiClockBadge: React.FC<{ variant?: 'gray' | 'light'; inline?: boolean }> = ({ variant = 'light', inline = false }) => {
  const [thaiTime, setThaiTime] = useState<string>(getThaiCurrentTime);
  const isGray = variant === 'gray';

  useEffect(() => {
    const updateTime = () => setThaiTime(getThaiCurrentTime());
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  if (inline) {
    return (
      <span className="font-extrabold text-[10px] sm:text-[11px] tracking-tight text-slate-800 select-none">
        {thaiTime}
      </span>
    );
  }

  const textColor = isGray ? '#64748b' : '#1e293b';

  return (
    <div
      className="absolute top-[1.1%] left-[4.5%] z-32 flex items-center justify-center font-extrabold px-1.5 rounded-full select-none pointer-events-none bg-transparent"
      style={{
        height: '2.4%',
        color: textColor,
        fontSize: 'clamp(8px, 2.5cqw, 10px)',
        lineHeight: 1,
        letterSpacing: '-0.01em',
      }}
      title={`เวลาปัจจุบันตามเวลาประเทศไทย: ${thaiTime}`}
    >
      <span className="leading-none pt-[0.5px] whitespace-nowrap font-extrabold">{thaiTime}</span>
    </div>
  );
};

// Interface for battery status
interface BatteryStatus {
  level: number;
  charging: boolean;
  supported: boolean;
}

// Hook to detect real device battery level (supports navigator.getBattery on Android Chrome/WebView/PC, with natural session fallback)
const useDeviceBattery = (): BatteryStatus => {
  const [battery, setBattery] = useState<BatteryStatus>(() => {
    if (typeof window !== 'undefined') {
      try {
        const cached = sessionStorage.getItem('puijai_device_battery');
        if (cached) return JSON.parse(cached);
      } catch {}
    }
    const hour = new Date().getHours();
    let est = 82;
    if (hour >= 6 && hour <= 12) est = 90 - (hour - 6) * 2;
    else if (hour > 12 && hour <= 18) est = 78 - (hour - 12) * 3;
    else if (hour > 18 && hour <= 23) est = 60 - (hour - 18) * 4;
    else est = 45;
    return { level: Math.max(20, Math.min(99, est)), charging: false, supported: false };
  });

  useEffect(() => {
    let isMounted = true;
    let bm: any = null;

    const update = () => {
      if (!isMounted || !bm) return;
      const lvl = Math.max(1, Math.min(100, Math.round(bm.level * 100)));
      const info: BatteryStatus = {
        level: lvl,
        charging: Boolean(bm.charging),
        supported: true,
      };
      setBattery(info);
      try {
        sessionStorage.setItem('puijai_device_battery', JSON.stringify(info));
      } catch {}
    };

    if (typeof navigator !== 'undefined' && 'getBattery' in navigator) {
      (navigator as any).getBattery().then(
        (batteryManager: any) => {
          if (!isMounted) return;
          bm = batteryManager;
          update();
          bm.addEventListener('levelchange', update);
          bm.addEventListener('chargingchange', update);
        },
        () => {}
      );
    }

    return () => {
      isMounted = false;
      if (bm) {
        try {
          bm.removeEventListener('levelchange', update);
          bm.removeEventListener('chargingchange', update);
        } catch {}
      }
    };
  }, []);

  return battery;
};

// Real-time Device Battery Indicator overlay matching native smartphone status bar
const MockupBatteryBadge: React.FC<{ variant?: 'gray' | 'light'; inline?: boolean }> = ({ variant = 'light', inline = false }) => {
  const battery = useDeviceBattery();
  
  const getFillColor = () => {
    if (battery.level <= 15) return '#ef4444';
    if (battery.level <= 25) return '#f59e0b';
    return '#22c55e';
  };

  const strokeColor = '#334155';

  const batteryContent = (
    <div className="flex items-center select-none pointer-events-none">
      {/* Battery outer shell */}
      <div
        className="rounded-[2.5px] border flex items-center p-[1px]"
        style={{
          width: '18px',
          height: '10px',
          borderColor: strokeColor,
        }}
      >
        <div
          className="h-full rounded-[1px] transition-all"
          style={{
            width: `${Math.max(10, Math.min(100, battery.level))}%`,
            backgroundColor: getFillColor(),
          }}
        />
        <span
          className="text-[6.5px] font-extrabold absolute ml-[2px] tracking-tighter"
          style={{ color: battery.level > 55 ? '#ffffff' : strokeColor }}
        >
          {battery.level}
        </span>
      </div>
      <div
        className="rounded-r-[1px]"
        style={{
          width: '1.5px',
          height: '4px',
          backgroundColor: strokeColor,
        }}
      />
      {battery.charging && (
        <div className="ml-[1.5px] flex items-center">
          <svg
            viewBox="0 0 24 24"
            className="w-[6px] h-[10px]"
            style={{ color: strokeColor }}
            fill="currentColor"
          >
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
          </svg>
        </div>
      )}
    </div>
  );

  if (inline) {
    return batteryContent;
  }

  return (
    <div
      className="absolute top-[1.1%] right-[4.5%] z-32 flex items-center justify-end pointer-events-none select-none bg-transparent"
      style={{
        height: '2.4%',
      }}
      title={`แบตเตอรี่เครื่องของคุณ: ${battery.level}%${battery.charging ? ' ⚡ (กำลังชาร์จ)' : ''}`}
    >
      {batteryContent}
    </div>
  );
};

// Hyper-realistic flagship smartphone frame
const RealisticPhoneFrame: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <div className="relative max-w-[315px] sm:max-w-[335px] mx-auto my-3 select-none">
      {/* Side Hardware Buttons */}
      {/* Left: Action button + Volume buttons */}
      <div className="absolute -left-[3px] top-[95px] w-[3px] h-[20px] bg-slate-400/90 rounded-l-xs shadow-xs pointer-events-none" />
      <div className="absolute -left-[3px] top-[130px] w-[3px] h-[38px] bg-slate-400/90 rounded-l-xs shadow-xs pointer-events-none" />
      <div className="absolute -left-[3px] top-[178px] w-[3px] h-[38px] bg-slate-400/90 rounded-l-xs shadow-xs pointer-events-none" />

      {/* Right: Power button */}
      <div className="absolute -right-[3px] top-[138px] w-[3px] h-[50px] bg-slate-400/90 rounded-r-xs shadow-xs pointer-events-none" />

      {/* Outer Metallic Titanium Curvature */}
      <div className="p-[7px] sm:p-[8px] rounded-[48px] bg-gradient-to-b from-slate-200 via-slate-300 to-slate-400 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.35),0_0_0_1px_rgba(0,0,0,0.08)] ring-1 ring-slate-400/40">
        {/* Inner dark bezel frame */}
        <div className="rounded-[42px] bg-slate-950 p-[3px] relative overflow-hidden shadow-inner">
          {/* Top ear-piece speaker slit */}
          <div className="absolute top-[3px] left-1/2 -translate-x-1/2 w-12 h-[3px] bg-slate-700/80 rounded-full z-35 pointer-events-none" />

          {/* Screen area with exact 475:1024 aspect ratio */}
          <div className="relative w-full aspect-[475/1024] rounded-[38px] overflow-hidden bg-white">
            {/* Top Front Camera Punch-hole (Subtle modern smartphone camera) */}
            <div className="absolute top-[8px] left-1/2 -translate-x-1/2 w-3.5 h-3.5 bg-slate-950 rounded-full z-30 flex items-center justify-center pointer-events-none ring-1 ring-slate-800/40 shadow-xs">
              <div className="w-1.5 h-1.5 rounded-full bg-slate-800 border border-slate-700/80 flex items-center justify-center">
                <div className="w-0.5 h-0.5 rounded-full bg-blue-900/90" />
              </div>
            </div>

            {/* Screen Content */}
            {children}

            {/* Bottom Home Indicator Gesture Bar */}
            <div className="absolute bottom-[6px] left-1/2 -translate-x-1/2 w-28 h-[4px] bg-slate-400/80 rounded-full z-25 pointer-events-none" />

            {/* Glass reflection shine */}
            <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/[0.04] to-transparent rounded-[38px] pointer-events-none z-20" />
          </div>
        </div>
      </div>
    </div>
  );
};



export const ThankYouView: React.FC<ThankYouViewProps> = ({
  cancellationData,
  onResetForm,
}) => {
  const [activeGuideStep, setActiveGuideStep] = useState<number>(1);
  const [showAllSteps, setShowAllSteps] = useState<boolean>(true);
  const [isGuideOpen, setIsGuideOpen] = useState<boolean>(false);

  // Pre-load all 4 guide images into memory immediately on component mount
  useEffect(() => {
    const urls = [
      '/line-step1.webp?v=8',
      '/line-step2.webp?v=8',
      '/line-step3.webp?v=8',
      '/line-step4.webp?v=8',
    ];
    if (typeof window !== 'undefined') {
      urls.forEach((url) => {
        const img = new window.Image();
        img.src = url;
      });
    }
  }, []);

  const handleCloseWindow = () => {
    const closed = closeLiffWindow();
    if (!closed) {
      if (window.opener) {
        window.close();
      } else {
        window.location.href = 'line://nv/chat';
      }
    }
  };

  const handleReturnToLine = () => {
    const closed = closeLiffWindow();
    if (!closed) {
      // Attempt direct app scheme first, then web link fallback
      window.location.href = 'line://nv/chat';
      setTimeout(() => {
        window.open('https://line.me/R/ti/p/@123xuwni', '_blank');
      }, 800);
    }
  };


  return (
    <div className="max-w-xl sm:max-w-2xl mx-auto py-8 sm:py-12 px-4 pb-16 sm:pb-20">
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
            เราได้ดำเนินการตามคำขอยกเลิกบริการเรียบร้อยแล้ว
          </p>
        </div>

        {/* Submission Confirmation Status Banner */}
        <div className="bg-gradient-to-r from-emerald-50 via-teal-50/50 to-emerald-50 border border-emerald-200 rounded-2xl p-3.5 sm:p-4 text-left shadow-2xs">
          <div className="flex items-center justify-between text-xs font-bold mb-1.5 gap-2 flex-wrap sm:flex-nowrap">
            <div className="flex items-center space-x-2 text-emerald-950 font-bold">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>สถานะ: ดำเนินการยกเลิกเสร็จสมบูรณ์</span>
            </div>
            <span className="text-[11px] font-bold text-emerald-800 bg-emerald-100/90 px-2.5 py-0.5 rounded-full border border-emerald-300 shadow-2xs whitespace-nowrap">
              ✓ ดำเนินการสำเร็จเรียบร้อย
            </span>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed font-medium">
            คำขอยกเลิกและข้อเสนอแนะได้รับการยืนยันเรียบร้อยแล้ว แชทบอท Puijai ได้ระงับการตอบกลับอัตโนมัติสำหรับบัญชีของคุณครับ ☁️
          </p>
        </div>

        <p className="text-sm text-slate-600 leading-relaxed max-w-md mx-auto">
          <span className="inline-block">คำขอยกเลิกบริการแชทบอท</span> <span className="font-bold text-slate-800 inline-block">"Puijai"</span> <span className="inline-block">รหัสคำขอ</span> <span className="font-mono font-bold text-pink-600 bg-pink-50 px-2 py-0.5 rounded border border-pink-200 whitespace-nowrap inline-block">{cancellationData.id}</span> <span className="inline-block">ได้รับการยืนยันเรียบร้อยแล้ว</span> <span className="inline-block">แชทบอทจะหยุดการตอบกลับอัตโนมัติ</span><span className="inline-block">สำหรับบัญชีของคุณ</span> <span className="inline-block">หากในอนาคตต้องการกลับมาใช้งานใหม่</span> <span className="inline-block">น้องปุยใจยินดีต้อนรับเสมอครับ ☁️</span>
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

        {/* Visual Guide Card: 4 Steps referencing authentic LINE screens (Collapsible Accordion) */}
        <div className="border border-slate-200 rounded-3xl overflow-hidden bg-white shadow-sm text-left">
          <button
            type="button"
            onClick={() => setIsGuideOpen(!isGuideOpen)}
            className="w-full bg-slate-50/90 hover:bg-slate-100/90 border-b border-slate-200 px-3.5 sm:px-4 py-3.5 flex items-center justify-between gap-2 transition-colors cursor-pointer text-left"
          >
            <div className="flex items-center space-x-2 text-slate-900 font-bold text-xs sm:text-sm shrink-0">
              <Smartphone className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-600 stroke-[2] shrink-0" />
              <span className="font-bold">วิธีลบประวัติการสนทนาในเครื่อง (ผ่านแอป LINE)</span>
            </div>
            <div className="flex items-center space-x-1.5 text-[10px] sm:text-xs font-semibold text-emerald-700 bg-emerald-100/90 px-2.5 sm:px-3 py-1 rounded-full shrink-0 shadow-2xs">
              <span>{isGuideOpen ? 'ซ่อนคำแนะนำ' : 'ดูขั้นตอน (4 สเต็ป)'}</span>
              {isGuideOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </div>
          </button>

          {isGuideOpen && (
            <div className="p-4 sm:p-5 space-y-4">
            <div className="bg-emerald-50/80 border border-emerald-200 rounded-2xl p-3 sm:p-3.5 text-xs text-emerald-950 leading-relaxed flex items-start space-x-2.5 shadow-2xs">
              <span className="text-emerald-600 text-sm shrink-0 mt-0.5">💡</span>
              <p>
                <strong>คำแนะนำสำหรับผู้ใช้งาน:</strong> เพื่อความสะอาดของห้องแชทในเครื่องโทรศัพท์ของคุณ ท่านสามารถทำตาม 4 สเต็ปด้านล่างเพื่อลบประวัติข้อความเก่าในแอป LINE ได้เลยครับ <em>(ระบบได้ดำเนินการยกเลิกบริการของคุณเรียบร้อยแล้ว)</em>
              </p>
            </div>

            {/* Visual Guide: 4 Steps referencing authentic LINE screens */}
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap sm:flex-nowrap">
                <div className="font-bold text-slate-900 flex items-center space-x-1.5 text-xs sm:text-sm min-w-0">
                  <Smartphone className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="leading-snug">วิธีลบประวัติแชทใน LINE (อ้างอิงจากแอป LINE จริง 4 สเต็ป):</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAllSteps(!showAllSteps)}
                  className="text-[11px] text-emerald-600 hover:text-emerald-700 font-semibold cursor-pointer underline flex items-center space-x-1 whitespace-nowrap shrink-0"
                >
                  <Eye className="w-3 h-3" />
                  <span>{showAllSteps ? 'ดูทีละสเต็ป' : 'ดูภาพทั้ง 4 สเต็ปพร้อมกัน'}</span>
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
                    <RealisticPhoneFrame>
                      <picture>
                        <source srcSet="/line-step1.webp?v=8" type="image/webp" />
                        <img
                          src="/line-step1.png?v=8"
                          alt="สเต็ป 1: ในห้องแชทน้องปุยใจ แตะไอคอน ☰ มุมขวาบน"
                          width={475}
                          height={1024}
                          loading="eager"
                          fetchPriority="high"
                          decoding="async"
                          className="w-full h-full object-cover select-none pointer-events-none"
                        />
                      </picture>

                      {/* Live Thailand Status Bar Clock Overlay */}
                      <MockupThaiClockBadge variant="light" />

                      {/* Live Device Battery Status Bar Overlay */}
                      <MockupBatteryBadge variant="light" />

                      {/* Clickable target button */}
                      <button
                        type="button"
                        onClick={() => setActiveGuideStep(2)}
                        className="absolute top-[5.2%] right-[2.0%] w-[12.5%] h-[5.8%] rounded-full border-3 border-rose-600 bg-rose-500/20 ring-4 ring-rose-500/80 shadow-lg shadow-rose-500/60 animate-pulse z-20 cursor-pointer"
                        title="แตะเพื่อไปสเต็ป 2"
                      />

                      {/* Bouncing Hand / Pointer Tag with Upward Arrow pointing straight at ☰ */}
                      <div className="absolute top-[12.5%] right-[2.0%] z-20 flex flex-col items-end animate-bounce pointer-events-none max-w-[90%]">
                        {/* Upward Arrow pointer precisely aligned with ☰ */}
                        <div className="mr-[18px] w-0 h-0 border-x-[7px] border-x-transparent border-b-[9px] border-b-rose-600 drop-shadow-md"></div>
                        <div className="bg-rose-600 text-white text-[9.5px] sm:text-[11px] font-extrabold px-3 py-1.5 rounded-xl shadow-2xl flex items-center space-x-1.5 max-w-full border border-white/30 text-center leading-tight">
                          <span>1. แตะไอคอน ☰ (มุมขวาบน)</span>
                          <span className="text-xs shrink-0">👆</span>
                        </div>
                      </div>
                    </RealisticPhoneFrame>
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
                    <RealisticPhoneFrame>
                      <picture>
                        <source srcSet="/line-step2.webp?v=8" type="image/webp" />
                        <img
                          src="/line-step2.png?v=8"
                          alt="สเต็ป 2: แตะที่ ตั้งค่า"
                          width={475}
                          height={1024}
                          loading="eager"
                          decoding="async"
                          className="w-full h-full object-cover select-none pointer-events-none"
                        />
                      </picture>

                      {/* Live Thailand Status Bar Clock Overlay */}
                      <MockupThaiClockBadge variant="light" />

                      {/* Live Device Battery Status Bar Overlay */}
                      <MockupBatteryBadge variant="light" />

                      {/* Clickable target button */}
                      <button
                        type="button"
                        onClick={() => setActiveGuideStep(3)}
                        className="absolute top-[60.5%] left-[2.5%] w-[95%] h-[5.2%] rounded-xl border-3 border-rose-600 bg-rose-500/25 ring-4 ring-rose-500/80 shadow-lg shadow-rose-500/50 animate-pulse z-20 cursor-pointer"
                        title="แตะเพื่อไปสเต็ป 3"
                      />

                      {/* Bouncing Pointer Tag pointing down to ⚙️ ตั้งค่า */}
                      <div className="absolute top-[52.0%] right-[4%] z-20 flex flex-col items-end animate-bounce pointer-events-none max-w-[90%]">
                        <div className="bg-rose-600 text-white text-[9.5px] sm:text-[11px] font-extrabold px-3 py-1.5 rounded-xl shadow-2xl flex items-center space-x-1.5 max-w-full border border-white/30 text-center leading-tight">
                          <span>2. แตะที่นี่ "ตั้งค่า"</span>
                          <span className="text-xs shrink-0">👇</span>
                        </div>
                        <div className="mr-8 w-0 h-0 border-x-[7px] border-x-transparent border-t-[9px] border-t-rose-600 drop-shadow-md"></div>
                      </div>
                    </RealisticPhoneFrame>
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
                    <RealisticPhoneFrame>
                      <picture>
                        <source srcSet="/line-step3.webp?v=8" type="image/webp" />
                        <img
                          src="/line-step3.png?v=8"
                          alt="สเต็ป 3: แตะที่ ลบข้อมูล"
                          width={475}
                          height={1024}
                          loading="eager"
                          decoding="async"
                          className="w-full h-full object-cover select-none pointer-events-none"
                        />
                      </picture>

                      {/* Live Thailand Status Bar Clock Overlay */}
                      <MockupThaiClockBadge variant="light" />

                      {/* Live Device Battery Status Bar Overlay */}
                      <MockupBatteryBadge variant="light" />

                      {/* Clickable target button */}
                      <button
                        type="button"
                        onClick={() => setActiveGuideStep(4)}
                        className="absolute top-[44.9%] left-[2.5%] w-[95%] h-[5.2%] rounded-xl border-3 border-rose-600 bg-rose-500/25 ring-4 ring-rose-500/80 shadow-lg shadow-rose-500/50 animate-pulse z-20 cursor-pointer"
                        title="แตะเพื่อไปสเต็ป 4"
                      />

                      {/* Bouncing Pointer Tag pointing down to ลบข้อมูล */}
                      <div className="absolute top-[36.5%] right-[4%] z-20 flex flex-col items-end animate-bounce pointer-events-none max-w-[90%]">
                        <div className="bg-rose-600 text-white text-[9.5px] sm:text-[11px] font-extrabold px-3 py-1.5 rounded-xl shadow-2xl flex items-center space-x-1.5 max-w-full border border-white/30 text-center leading-tight">
                          <span>3. แตะที่นี่ "ลบข้อมูล"</span>
                          <span className="text-xs shrink-0">👇</span>
                        </div>
                        <div className="mr-8 w-0 h-0 border-x-[7px] border-x-transparent border-t-[9px] border-t-rose-600 drop-shadow-md"></div>
                      </div>
                    </RealisticPhoneFrame>
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
                    <div className="space-y-1">
                      <div className="text-xs sm:text-sm font-bold text-slate-800 leading-normal">
                        <span className="inline-block">แตะที่แถบตัวหนังสือสีแดง</span>{' '}
                        <strong className="text-rose-600 font-extrabold text-sm sm:text-base inline-block underline decoration-rose-300 underline-offset-2">
                          "ลบข้อมูลแชทและข้อความแชททั้งหมด"
                        </strong>
                      </div>
                      <p className="text-[11px] sm:text-xs text-slate-500 font-medium leading-relaxed">
                        (เป็นการลบประวัติการสนทนา รูปภาพ และข้อความเก่าทั้งหมดของน้องปุยใจที่ค้างอยู่ในเครื่องโทรศัพท์ของคุณ)
                      </p>
                    </div>

                    {/* Smartphone Mockup: Real Delete Screen with Exact Click Target */}
                    <RealisticPhoneFrame>
                      <picture>
                        <source srcSet="/line-step4.webp?v=8" type="image/webp" />
                        <img
                          src="/line-step4.png?v=8"
                          alt="สเต็ป 4: ลบข้อมูลแชทและข้อความแชททั้งหมด"
                          width={475}
                          height={1024}
                          loading="eager"
                          decoding="async"
                          className="w-full h-full object-cover select-none pointer-events-none"
                        />
                      </picture>

                      {/* Live Thailand Status Bar Clock Overlay */}
                      <MockupThaiClockBadge variant="light" />

                      {/* Live Device Battery Status Bar Overlay */}
                      <MockupBatteryBadge variant="light" />

                      {/* EXACT TARGET: ลบข้อมูลแชทและข้อความแชททั้งหมด - กรอบขอบสีแดงพร้อมเอฟเฟกต์กระพริบ */}
                      <button
                        type="button"
                        onClick={handleReturnToLine}
                        className="absolute top-[44.5%] left-[2.5%] w-[95%] h-[8.5%] rounded-2xl border-3 border-rose-600 bg-rose-500/20 ring-4 ring-rose-500/80 shadow-lg shadow-rose-500/60 animate-pulse z-20 cursor-pointer"
                        title="แตะเพื่อเปิดแอป LINE ไปลบประวัติแชทจริงทันที"
                      />

                      {/* Bouncing Pointer Tag pointing up to the red button */}
                      <div className="absolute top-[54.0%] left-1/2 -translate-x-1/2 z-20 flex flex-col items-center animate-bounce pointer-events-none w-full px-2">
                        <div className="w-0 h-0 border-x-[8px] border-x-transparent border-b-[10px] border-b-rose-600 drop-shadow-md"></div>
                        <div className="bg-rose-600 text-white text-[9.5px] sm:text-[11px] font-extrabold px-3 py-2 rounded-2xl shadow-2xl flex flex-col items-center justify-center max-w-[94%] border border-white/40 text-center leading-snug">
                          <div className="flex items-center space-x-1.5">
                            <span className="text-xs shrink-0">👆</span>
                            <span>4. ในแอป LINE ให้แตะที่แถบตัวหนังสือสีแดงนี้</span>
                          </div>
                          <span className="text-[8.5px] sm:text-[9.5px] text-rose-100 font-medium mt-0.5">
                            "ลบข้อมูลแชทและข้อความแชททั้งหมด" เพื่อล้างประวัติการคุยในเครื่อง
                          </span>
                        </div>
                      </div>
                    </RealisticPhoneFrame>

                    <div className="p-3.5 sm:p-4 bg-gradient-to-br from-rose-50/80 via-pink-50/40 to-emerald-50/60 border-2 border-rose-200/80 rounded-2xl text-xs space-y-2.5 text-slate-700 shadow-xs">
                      <div className="font-extrabold text-rose-800 text-xs sm:text-sm flex items-center gap-1.5">
                        <span>💡</span>
                        <span>คำอธิบายขั้นตอนที่ 4 (สำคัญ):</span>
                      </div>
                      <div className="space-y-1.5 text-[11.5px] sm:text-xs leading-relaxed">
                        <p className="flex items-start gap-1.5">
                          <span className="text-rose-600 font-bold shrink-0 mt-0.5">•</span>
                          <span>
                            <strong>ปุ่มนี้ทำอะไร?:</strong> เป็นการลบข้อความแชทและรูปภาพที่คุยกับน้องปุยใจที่บันทึกอยู่ในโทรศัพท์ของคุณ เพื่อไม่ให้มีประวัติแชทเก่าค้างอยู่ในเครื่อง
                          </span>
                        </p>
                        <p className="flex items-start gap-1.5">
                          <span className="text-rose-600 font-bold shrink-0 mt-0.5">•</span>
                          <span>
                            <strong>วิธีทำจริง:</strong> แตะปุ่มสีเขียว <strong className="text-emerald-700">"เปิดแอป LINE บนมือถือ"</strong> ด้านล่างนี้ เพื่อเปิดห้องแชทน้องปุยใจในแอป LINE แล้วทำตามภาพขั้นตอนที่ 1 ถึง 4
                          </span>
                        </p>
                        <p className="flex items-start gap-1.5 text-emerald-800 font-semibold bg-emerald-100/60 p-2 rounded-xl border border-emerald-200/80">
                          <span className="text-emerald-600 font-bold shrink-0">✓</span>
                          <span>
                            เมื่อแตะลบเรียบร้อยแล้ว ห้องแชทจะกลับมาว่างเปล่า และระบบน้องปุยใจจะไม่ส่งข้อความอัตโนมัติรบกวนคุณอีกต่อไปครับ
                          </span>
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        </div>

        {/* Primary Action Buttons */}
        <div className="pt-3 flex flex-col items-center justify-center gap-3">
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 w-full sm:w-auto">
            <button
              type="button"
              onClick={handleCloseWindow}
              className="w-full sm:w-auto px-7 py-3.5 rounded-2xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-sm sm:text-base flex items-center justify-center space-x-2 shadow-lg shadow-emerald-900/20 active:scale-98 transition-all cursor-pointer ring-4 ring-emerald-500/20"
            >
              <Check className="w-5 h-5 stroke-[2.5]" />
              <span>ปิดหน้าต่างนี้ (เสร็จสิ้น)</span>
            </button>

            <button
              type="button"
              onClick={handleReturnToLine}
              className="w-full sm:w-auto px-6 py-3.5 rounded-2xl bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-800 font-bold text-xs sm:text-sm flex items-center justify-center space-x-2 transition-all border border-slate-200 shadow-xs cursor-pointer active:scale-98"
            >
              <MessageCircle className="w-5 h-5 text-emerald-600" />
              <span>เปิดห้องแชทน้องปุยใจใน LINE</span>
            </button>
          </div>

          <p className="text-[11.5px] text-slate-500 max-w-sm text-center font-medium">
            * ระบบได้ระงับการตอบกลับของน้องปุยใจเรียบร้อยแล้ว ท่านสามารถปิดหน้านี้ได้ทันทีครับ ☁️
          </p>

          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-2.5">
            <button
              type="button"
              onClick={onResetForm}
              className="w-full sm:w-auto px-5 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 active:bg-slate-200 text-slate-600 font-semibold text-xs flex items-center justify-center space-x-2 transition-all border border-slate-200 shadow-2xs cursor-pointer active:scale-98"
              title="ล้างข้อมูลและกลับไปหน้าแบบฟอร์มเริ่มต้นใหม่"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
              <span>ยื่นเรื่องใหม่อีกครั้ง</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

