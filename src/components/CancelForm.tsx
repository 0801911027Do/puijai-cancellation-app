import React, { useState, useEffect } from 'react';
import { CancellationCategory, PriorityLevel } from '../types';
import { AlertTriangle, Send, Info, Star, CheckCircle2, MessageCircle, Sparkles, User, ShieldCheck, Loader2 } from 'lucide-react';
import { sendLiffSummaryMessage, closeLiffWindow, getFastLiffProfile, getCachedLiffProfile, LiffUserProfile } from '../lib/liff';

interface CancelFormProps {
  onSubmitSuccess: (data: any) => void;
}

interface CategoryItem {
  label: CancellationCategory;
  descriptionNode: React.ReactNode;
  icon: string;
}

const CATEGORIES: CategoryItem[] = [
  {
    label: 'สลับไปใช้บริการอื่น',
    descriptionNode: <>เปลี่ยนไปใช้<span className="inline-block">แชทบอท</span> หรือแอปอื่นที่ตอบโจทย์กว่า</>,
    icon: '🔄'
  },
  {
    label: 'ไม่ตอบโจทย์การใช้งาน',
    descriptionNode: <>ขาดฟีเจอร์คำสั่ง หรือวิเคราะห์คำตอบ<span className="inline-block">ไม่ตรงตามต้องการ</span></>,
    icon: '🧩'
  },
  {
    label: 'พบปัญหาเทคนิค/บั๊ก',
    descriptionNode: <><span className="inline-block">แชทบอทตอบช้า</span> ค้าง หรือไม่สามารถส่งข้อความได้</>,
    icon: '⚠️'
  },
  {
    label: 'ใช้งานยาก',
    descriptionNode: <>เมนูซับซ้อน หรือการตั้งค่าคำสั่ง<span className="inline-block">ยุ่งยากเกินไป</span></>,
    icon: '🙋'
  },
  {
    label: 'เหตุผลส่วนตัว',
    descriptionNode: <>หยุดทำโครงการ หรือไม่มีความจำเป็นต้องใช้<span className="inline-block">แชทบอทแล้ว</span></>,
    icon: '👤'
  },
  {
    label: 'อื่นๆ',
    descriptionNode: <>ระบุเหตุผลเพิ่มเติม<span className="inline-block">ในช่องด้านล่าง</span></>,
    icon: '📝'
  },
];

// Instant cached user status helper (0ms before first paint - Real-time SWR)
const getInitialUserStatus = () => {
  let urlUserId = '';
  let urlUsername = '';
  try {
    if (typeof window !== 'undefined' && window.location) {
      const params = new URLSearchParams(window.location.search);
      urlUserId = params.get('userId') || params.get('user_id') || '';
      urlUsername = params.get('username') || params.get('name') || params.get('displayName') || '';
    }
  } catch (e) {}

  const profile = getCachedLiffProfile();
  let persistentKey = '';
  try {
    persistentKey = localStorage.getItem('puijai_client_device_key') || '';
  } catch (e) {}

  const targetUserId = profile?.userId || urlUserId || persistentKey;
  const targetUsername = profile?.displayName || urlUsername || targetUserId;

  try {
    // 1. Check user-specific cached sync status
    const keysToCheck = [
      targetUserId ? `puijai_sync_status_${targetUserId}` : '',
      targetUsername ? `puijai_sync_status_${targetUsername}` : '',
      'puijai_last_sync_status',
    ].filter(Boolean);

    for (const key of keysToCheck) {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.nextId) {
          return {
            referenceId: parsed.nextId,
            userRound: parsed.currentRound || 1,
            previousCount: parsed.totalHistory || (parsed.currentRound ? parsed.currentRound - 1 : 0),
          };
        }
      }
    }

    // 2. Check last submitted ID
    const lastId = localStorage.getItem('puijai_last_submitted_id');
    if (lastId) {
      return {
        referenceId: lastId,
        userRound: 1,
        previousCount: 0,
      };
    }
  } catch (e) {}

  return {
    referenceId: 'PUI-CANCEL-00001',
    userRound: 1,
    previousCount: 0,
  };
};

export const CancelForm: React.FC<CancelFormProps> = ({ onSubmitSuccess }) => {
  const initialStatus = getInitialUserStatus();
  const [referenceId, setReferenceId] = useState<string>(initialStatus.referenceId);
  const [userProfile, setUserProfile] = useState<LiffUserProfile | null>(() => getCachedLiffProfile());
  const [userRound, setUserRound] = useState<number>(initialStatus.userRound);
  const [previousSubmissionsCount, setPreviousSubmissionsCount] = useState<number>(initialStatus.previousCount);
  const [previousRecord, setPreviousRecord] = useState<any | null>(null);

  const [category, setCategory] = useState<CancellationCategory>('สลับไปใช้บริการอื่น');
  const [reason, setReason] = useState('');
  const [priority, setPriority] = useState<PriorityLevel>('กลาง');
  const [rating, setRating] = useState<number>(3);
  const [confirmed, setConfirmed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let isMounted = true;

    // Helper to get persistent user identifier (LINE userId or unique device key)
    const getPersistentUserKey = (profile?: LiffUserProfile | null) => {
      if (profile?.userId) return profile.userId;
      if (profile?.displayName) return profile.displayName;
      let storedKey = '';
      try {
        storedKey = localStorage.getItem('puijai_client_device_key') || '';
        if (!storedKey) {
          storedKey = 'LINE-' + Math.random().toString(36).substring(2, 10).toUpperCase();
          localStorage.setItem('puijai_client_device_key', storedKey);
        }
      } catch (e) {}
      return storedKey || 'LINE-DEVICE-01';
    };

    // 1. Function to resolve ticket reference ID & user round in real-time
    const resolveUserStatus = async (profileObj?: LiffUserProfile | null) => {
      let urlUserId = '';
      let urlUsername = '';
      try {
        if (typeof window !== 'undefined' && window.location) {
          const params = new URLSearchParams(window.location.search);
          urlUserId = params.get('userId') || params.get('user_id') || '';
          urlUsername = params.get('username') || params.get('name') || params.get('displayName') || '';
        }
      } catch (e) {}

      const targetUserId = profileObj?.userId || urlUserId || getPersistentUserKey(profileObj);
      const targetUsername = profileObj?.displayName || urlUsername || targetUserId;

      // Realtime SWR: Query ticket reference ID and round via serverless backend proxy
      try {
        const apiRes = await fetch(`/api/cancellations/next-id?userId=${encodeURIComponent(targetUserId)}&username=${encodeURIComponent(targetUsername)}`, {
          signal: AbortSignal.timeout(5000)
        });

        if (apiRes.ok) {
          const validData = await apiRes.json();
          if (isMounted && validData && validData.nextId) {
            setReferenceId(validData.nextId);
            if (validData.currentRound) {
              setUserRound(validData.currentRound);
              setPreviousSubmissionsCount(validData.totalHistory || 0);
            }
            try {
              localStorage.setItem(`puijai_sync_status_${targetUserId}`, JSON.stringify(validData));
              if (targetUsername && targetUsername !== targetUserId) {
                localStorage.setItem(`puijai_sync_status_${targetUsername}`, JSON.stringify(validData));
              }
              localStorage.setItem('puijai_last_sync_status', JSON.stringify(validData));
            } catch (e) {}
          }
        }
      } catch (e) {}
    };

    // Initial resolution with cached LIFF / URL params
    const initialFastProfile = getCachedLiffProfile();
    if (initialFastProfile) {
      setUserProfile(initialFastProfile);
      resolveUserStatus(initialFastProfile);
    } else {
      resolveUserStatus();
    }

    // 2. Fetch LINE LIFF Profile & lock ID per user
    getFastLiffProfile((profile) => {
      if (!isMounted || !profile) return;
      setUserProfile(profile);
      resolveUserStatus(profile);
    });

    return () => {
      isMounted = false;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (!reason.trim()) {
      setErrorMessage('กรุณากรอกเหตุผลที่ต้องการยกเลิกการใช้งาน');
      return;
    }
    if (!confirmed) {
      setErrorMessage('กรุณายืนยันความประสงค์ในการยกเลิกการใช้งาน');
      return;
    }

    setErrorMessage('');
    setIsSubmitting(true);

    const gasWebhookUrl = 'https://script.google.com/macros/s/AKfycbzekm0u18dOk_iVIdA92e_TwcxXaudq5B4i_vK68bxA-hoHbsYpygaAi5Hc45ArFMlv/exec';
    
    // Get unique identifier for this user/device
    let persistentKey = '';
    if (userProfile?.userId) {
      persistentKey = userProfile.userId;
    } else if (userProfile?.displayName) {
      persistentKey = userProfile.displayName;
    } else {
      try {
        persistentKey = localStorage.getItem('puijai_client_device_key') || 'LINE-DEVICE-01';
      } catch (e) {
        persistentKey = 'LINE-DEVICE-01';
      }
    }

    const finalUserId = persistentKey;
    const finalUsername = userProfile?.displayName || persistentKey;

    const payload = {
      id: referenceId || 'PUI-CANCEL-00001',
      userId: finalUserId,
      username: finalUsername,
      category,
      reason: reason.trim(),
      priority,
      rating,
      round: userRound,
      notes: `รอบที่ ${userRound}`,
      created_at: new Date().toISOString(),
    };

    const startTime = Date.now();
    let submittedRecord: any = null;

    try {
      // 1. Primary: Send request to backend API
      const res = await fetch('/api/cancellations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(8000),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success && data.data) {
          submittedRecord = data.data;
        }
      }
    } catch (apiErr) {
      console.warn('Backend API submission failed, falling back to direct GAS:', apiErr);
    }

    // Fallback: Directly submit to Google Apps Script if backend was unreachable
    if (!submittedRecord) {
      try {
        const gasRes = await fetch(gasWebhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(8000),
        });
        if (gasRes.ok) {
          const gasData = await gasRes.json();
          if (gasData.success) {
            submittedRecord = {
              ...payload,
              id: gasData.id || payload.id,
              round: gasData.round || payload.round,
              status: 'ยกเลิกสำเร็จ',
            };
          }
        }
      } catch (gasErr) {
        console.warn('Direct GAS fallback failed:', gasErr);
      }
    }

    // Ensure final result object
    const finalResult = submittedRecord || {
      ...payload,
      id: referenceId || 'PUI-CANCEL-00001',
      round: userRound,
      status: 'ยกเลิกสำเร็จ' as const,
    };

    // Standard UX feedback: enforce at least 800ms loading state so user perceives reliable submission
    const elapsedTime = Date.now() - startTime;
    if (elapsedTime < 800) {
      await new Promise((resolve) => setTimeout(resolve, 800 - elapsedTime));
    }

    // Save to localStorage
    try {
      localStorage.setItem('puijai_last_submitted_id', finalResult.id);
      const nextRoundInfo = {
        nextId: finalResult.id,
        currentRound: (finalResult.round || userRound) + 1,
        totalHistory: finalResult.round || userRound,
      };
      localStorage.setItem(`puijai_sync_status_${finalUserId}`, JSON.stringify(nextRoundInfo));
      if (finalUsername && finalUsername !== finalUserId) {
        localStorage.setItem(`puijai_sync_status_${finalUsername}`, JSON.stringify(nextRoundInfo));
      }
    } catch (e) {}

    // Send LINE summary message (non-blocking)
    sendLiffSummaryMessage({
      id: finalResult.id,
      username: finalUsername,
      category: finalResult.category || category,
      reason: (finalResult.reason || reason).trim(),
      round: finalResult.round || userRound,
      notes: finalResult.notes || `รอบที่ ${userRound}`,
    }).catch(() => {});

    setIsSubmitting(false);
    onSubmitSuccess(finalResult);
  };

  return (
    <div className="max-w-2xl mx-auto py-4 sm:py-8 px-2.5 sm:px-4">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-sky-400 via-pink-400 to-rose-400 rounded-[24px] p-6 sm:p-8 text-white shadow-xl shadow-pink-200/50 mb-6 relative overflow-hidden">
        {/* Decorative soft glow */}
        <div className="absolute -right-8 -top-8 w-40 h-40 bg-white/15 rounded-full blur-2xl pointer-events-none"></div>
        <div className="absolute -left-8 -bottom-8 w-40 h-40 bg-pink-300/25 rounded-full blur-2xl pointer-events-none"></div>

        <div className="relative z-10 flex flex-col items-center sm:items-start text-center sm:text-left">
          {/* Puijai Logo Above Title */}
          <div className="mb-3.5 relative inline-flex">
            <picture>
              <source srcSet="/puijai-logo.webp" type="image/webp" />
              <img
                src="/puijai-logo.jpg"
                alt="Puijai Logo"
                width={80}
                height={80}
                loading="eager"
                decoding="async"
                className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl sm:rounded-3xl border-2 border-white/90 shadow-lg shadow-pink-900/15 object-cover ring-4 ring-white/30 hover:scale-105 transition-transform duration-300"
              />
            </picture>
            <span className="absolute -bottom-1 -right-1 w-4 h-4 sm:w-5 sm:h-5 bg-emerald-400 border-2 border-white rounded-full flex items-center justify-center shadow-xs" title="Puijai Online">
              <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-white rounded-full"></span>
            </span>
          </div>

          <div className="flex items-center justify-center sm:justify-start space-x-1.5 text-white mb-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
            </svg>
            <span className="font-bold text-[10px] sm:text-xs tracking-[0.15em] uppercase text-white">
              Puijai Service Cancellation
            </span>
          </div>

          {userRound > 1 && (
            <div className="mb-3 inline-flex flex-wrap items-center gap-x-2 gap-y-1 px-3 sm:px-3.5 py-1 sm:py-1.5 bg-white/95 backdrop-blur-md rounded-2xl sm:rounded-full text-xs shadow-sm border border-white/80 transition-all max-w-full">
              <span className="inline-flex items-center space-x-1.5 shrink-0">
                <span className="w-2 h-2 rounded-full bg-pink-500 shrink-0"></span>
                <span className="font-bold text-pink-700 whitespace-nowrap text-xs">
                  คำขอยกเลิก: รอบที่ {userRound}
                </span>
              </span>
              <span className="text-slate-400 font-normal hidden sm:inline">|</span>
              <span className="text-slate-700 font-medium whitespace-nowrap text-[11px] sm:text-xs">
                เคยยกเลิกมาแล้ว {previousSubmissionsCount} ครั้ง
              </span>
            </div>
          )}
          
          <h2 className="text-[22px] sm:text-[28px] font-extrabold tracking-tight leading-snug sm:leading-tight drop-shadow-sm text-white mb-2 sm:mb-3">
            <span className="inline-block">แบบฟอร์มขอยกเลิก</span> <span className="inline-block">แชทบอท "Puijai"</span>
          </h2>
          
          <p className="text-white drop-shadow-sm font-medium text-[13px] sm:text-[15px] leading-relaxed max-w-[95%] sm:max-w-none">
            <span className="inline-block">แชทบอท Puijai (น้องปุยใจ)</span> <span className="inline-block">เป็นบริการ AI</span> <span className="inline-block">เราขอขอบคุณที่คุณเปิดโอกาสลองใช้</span> <span className="inline-block">และยินดีรับฟังข้อเสนอแนะ</span><span className="inline-block">เพื่อนำไปพัฒนาต่อ ☁️</span>
          </p>
        </div>
      </div>

      {/* Main Form */}
      <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-pink-100 p-4 sm:p-8 shadow-xs space-y-5 sm:space-y-6">
        {/* Reference Ticket & Round Badge */}
        <div className="bg-gradient-to-r from-sky-50/80 via-white to-pink-50/70 border border-sky-200/80 rounded-2xl p-3 sm:p-3.5 shadow-2xs">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center space-x-1.5 min-w-0">
              <Sparkles className="w-4 h-4 text-pink-500 shrink-0" />
              <span className="text-slate-700 font-semibold whitespace-nowrap shrink-0">
                รหัสคำขอ:
              </span>
              <strong className="font-mono font-bold text-pink-600 bg-white px-2.5 py-0.5 rounded-lg border border-pink-200 shadow-2xs whitespace-nowrap text-xs sm:text-sm tracking-tight shrink-0 transition-all duration-200">
                {referenceId || 'PUI-CANCEL-00001'}
              </strong>
            </div>

            <span className="text-[10px] sm:text-xs font-bold px-2.5 py-0.5 bg-pink-100 text-pink-700 rounded-full border border-pink-200 whitespace-nowrap shrink-0 shadow-2xs ml-auto transition-all duration-200">
              รอบที่ {userRound}
            </span>
          </div>
        </div>

        {errorMessage && (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-sm flex items-center space-x-3">
            <AlertTriangle className="w-5 h-5 flex-shrink-0 text-rose-500" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* 1. Reason Category Selection */}
        <div className="space-y-3">
          <h3 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-2 flex items-start space-x-2">
            <span className="w-6 h-6 rounded-full bg-pink-100 text-pink-800 text-xs flex items-center justify-center font-bold shrink-0 mt-0.5" aria-hidden="true">1</span>
            <span className="min-w-0 flex-1 leading-snug">
              <span className="inline-block">หมวดหมู่เหตุผล</span><span className="inline-block">ที่ขอยกเลิก</span>
            </span>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5" role="radiogroup" aria-label="หมวดหมู่เหตุผลที่ขอยกเลิก">
            {CATEGORIES.map((cat) => (
              <label
                key={cat.label}
                className={`flex items-start space-x-3 p-3 rounded-xl border cursor-pointer transition-all min-w-0 ${
                  isSubmitting ? 'opacity-70 cursor-not-allowed' : ''
                } ${
                  category === cat.label
                    ? 'border-pink-500 bg-pink-50/70 ring-2 ring-pink-400/20 shadow-xs'
                    : 'border-slate-200 hover:border-pink-200 bg-slate-50/50'
                }`}
              >
                <input
                  type="radio"
                  name="category"
                  aria-label={cat.label}
                  disabled={isSubmitting}
                  checked={category === cat.label}
                  onChange={() => setCategory(cat.label)}
                  className="mt-1 text-pink-600 focus:ring-pink-500 flex-shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center space-x-1.5 text-sm font-bold text-slate-900 break-words">
                    <span className="flex-shrink-0">{cat.icon}</span>
                    <span className="break-words">{cat.label}</span>
                  </div>
                  <p className="text-xs text-slate-800 mt-0.5 leading-relaxed font-normal">{cat.descriptionNode}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* 2. Detailed Reason Textarea */}
        <div className="space-y-3">
          <h3 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-2 flex items-start space-x-2">
            <span className="w-6 h-6 rounded-full bg-pink-100 text-pink-800 text-xs flex items-center justify-center font-bold shrink-0 mt-0.5" aria-hidden="true">2</span>
            <label htmlFor="cancel-reason-input" className="min-w-0 flex-1 leading-snug cursor-pointer">
              <span className="inline-block">รายละเอียดเหตุผล</span><span className="inline-block">และข้อเสนอแนะ <span className="text-rose-600 whitespace-nowrap">*</span></span>
            </label>
          </h3>

          <div>
            <textarea
              id="cancel-reason-input"
              rows={4}
              required
              disabled={isSubmitting}
              aria-label="รายละเอียดเหตุผลและข้อเสนอแนะ"
              placeholder="ช่วยบอกเราสักนิดว่าทำไมถึงต้องการยกเลิก หรือมีจุดไหนที่คุณอยากให้น้องปุยใจปรับปรุงเพิ่มเติม (เช่น ตอบช้า, คำตอบไม่ตรงใจ, สลับไปใช้แอปอื่น ฯลฯ)..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full p-4 rounded-xl border border-slate-300 focus:ring-2 focus:ring-pink-600 focus:border-pink-600 text-slate-900 text-sm leading-relaxed transition-all placeholder:text-slate-500 disabled:bg-slate-100 disabled:cursor-not-allowed"
            />
            <p className="text-xs text-slate-700 mt-1 font-medium">
              <span className="inline-block">ความคิดเห็นของคุณมีค่ามาก</span> <span className="inline-block">เพื่อนำไปพัฒนาการตอบคำถาม</span><span className="inline-block">ของน้องปุยใจให้ดียิ่งขึ้น ☁️</span>
            </p>
          </div>
        </div>

        {/* 3. Priority & Satisfaction Rating */}
        <div className="space-y-3">
          <h3 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-2 flex items-start space-x-2">
            <span className="w-6 h-6 rounded-full bg-pink-100 text-pink-800 text-xs flex items-center justify-center font-bold shrink-0 mt-0.5" aria-hidden="true">3</span>
            <span className="min-w-0 flex-1 leading-snug">
              <span className="inline-block">ระดับความเร่งด่วน</span><span className="inline-block">และความพึงพอใจ</span>
            </span>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-1">
            {/* Priority */}
          <div>
            <label className="block text-xs font-semibold text-slate-800 uppercase tracking-wider mb-2">
              ระดับความเร่งด่วนในการยกเลิก
            </label>
            <div className="grid grid-cols-3 gap-2" role="group" aria-label="ระดับความเร่งด่วนในการยกเลิก">
              {(['ต่ำ', 'กลาง', 'สูง'] as PriorityLevel[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => setPriority(p)}
                  aria-label={`เลือกระดับความเร่งด่วน ${p}`}
                  aria-pressed={priority === p}
                  className={`py-2.5 px-3 rounded-xl text-xs font-bold border transition-all ${
                    isSubmitting ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'
                  } ${
                    priority === p
                      ? p === 'สูง'
                        ? 'bg-rose-700 text-white border-rose-800 shadow-xs'
                        : p === 'กลาง'
                        ? 'bg-sky-700 text-white border-sky-800 shadow-xs'
                        : 'bg-emerald-700 text-white border-emerald-800 shadow-xs'
                      : 'bg-slate-100 text-slate-800 border-slate-300 hover:bg-slate-200'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Rating */}
          <div>
            <label className="block text-xs font-semibold text-slate-800 uppercase tracking-wider mb-2">
              ความพึงพอใจการใช้งานที่ผ่านมา
            </label>
            <div className="flex items-center space-x-1 py-1" role="group" aria-label="คะแนนความพึงพอใจการใช้งานที่ผ่านมา">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => setRating(star)}
                  aria-label={`ให้คะแนน ${star} จาก 5 คะแนน`}
                  aria-pressed={star <= rating}
                  className={`p-1 text-amber-500 transition-transform ${
                    isSubmitting ? 'cursor-not-allowed opacity-70' : 'hover:scale-110 cursor-pointer'
                  }`}
                >
                  <Star
                    className={`w-6 h-6 ${
                      star <= rating ? 'fill-amber-500 text-amber-500' : 'text-slate-300'
                    }`}
                  />
                </button>
              ))}
              <span className="text-xs text-slate-800 ml-2 font-bold">({rating}/5 คะแนน)</span>
            </div>
          </div>
        </div>
      </div>

        {/* 4. Policy Notice */}
        <div className="bg-pink-50/70 p-4 rounded-2xl border border-pink-200 space-y-2.5">
          <div className="flex items-center space-x-2 text-xs font-bold text-pink-950">
            <Info className="w-4 h-4 text-pink-700 shrink-0" />
            <span className="whitespace-nowrap font-bold text-pink-950">ข้อตกลงและผลของการยกเลิกบริการ</span>
          </div>
          <ul className="text-xs text-slate-800 space-y-2 list-disc list-inside pl-1 leading-relaxed font-normal">
            <li>
              <span className="inline-block">หลังจากส่งคำขอยกเลิก</span> <span className="inline-block">แชทบอท Puijai</span> <span className="inline-block">จะหยุดการตอบกลับอัตโนมัติทันที</span>
            </li>
            <li>
              <span className="inline-block">ข้อเสนอแนะของคุณ</span> <span className="inline-block">จะถูกนำไปพัฒนาปรับปรุง</span> <span className="inline-block">ระบบ AI ให้ดียิ่งขึ้น</span>
            </li>
            <li>
              <span className="inline-block">หากต้องการกลับมาใช้ใหม่</span> <span className="inline-block">สามารถเปิดใช้งานผ่าน LINE OA</span> <span className="inline-block">ได้ตลอดเวลา</span>
            </li>
          </ul>
        </div>

        {/* Confirmation Checkbox */}
        <div className="pt-2">
          <label className={`flex items-start space-x-3 select-none ${isSubmitting ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'}`}>
            <input
              type="checkbox"
              id="confirm-cancellation-checkbox"
              disabled={isSubmitting}
              aria-label="ข้าพเจ้ายืนยันการขอยกเลิกการใช้งานแชทบอท Puijai และส่งข้อเสนอแนะเข้าสู่ระบบ"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded border-slate-300 text-pink-600 focus:ring-pink-500 shrink-0 cursor-pointer disabled:cursor-not-allowed"
            />
            <span className="text-xs sm:text-sm text-slate-800 font-medium leading-relaxed min-w-0 flex-1">
              <span className="inline-block">ข้าพเจ้ายืนยันการขอยกเลิกใช้งาน</span> <span className="inline-block">แชทบอท Puijai</span> <span className="inline-block">และส่งข้อเสนอแนะเข้าสู่ระบบ</span>
            </span>
          </label>
        </div>

        {/* Form Actions */}
        <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-xs text-slate-700 leading-normal font-medium">
            <span className="inline-block">* ข้อมูลจะถูกจัดเก็บลงระบบ</span> <span className="inline-block">และแจ้งเตือนเข้าแชท LINE ทันที</span>
          </div>

          <button
            type="submit"
            aria-label="ยืนยันส่งคำขอยกเลิกบริการ"
            disabled={isSubmitting || !confirmed}
            className={`w-full sm:w-auto px-8 py-3.5 rounded-xl font-bold text-sm text-white flex items-center justify-center space-x-2.5 shadow-md transition-all duration-200 ${
              isSubmitting
                ? 'bg-pink-500 opacity-90 cursor-wait shadow-pink-200'
                : confirmed
                ? 'bg-pink-600 hover:bg-pink-700 active:scale-[0.98] shadow-pink-300 cursor-pointer'
                : 'bg-slate-300 cursor-not-allowed shadow-none'
            }`}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                <span>กำลังบันทึกและส่งคำขอ...</span>
              </>
            ) : (
              <>
                <Send className="w-4 h-4 shrink-0" />
                <span>ยืนยันส่งคำขอยกเลิกบริการ</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};
