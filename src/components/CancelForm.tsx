import React, { useState, useEffect } from 'react';
import { CancellationCategory, PriorityLevel } from '../types';
import { AlertTriangle, Send, Info, Star, CheckCircle2, MessageCircle, Sparkles, User, ShieldCheck } from 'lucide-react';
import { sendLiffSummaryMessage, closeLiffWindow, getFastLiffProfile, LiffUserProfile } from '../lib/liff';

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

export const CancelForm: React.FC<CancelFormProps> = ({ onSubmitSuccess }) => {
  const [referenceId, setReferenceId] = useState<string>('');
  const [isLoadingId, setIsLoadingId] = useState<boolean>(true);
  const [userProfile, setUserProfile] = useState<LiffUserProfile | null>(null);
  const [userRound, setUserRound] = useState<number>(1);
  const [previousSubmissionsCount, setPreviousSubmissionsCount] = useState<number>(0);
  const [previousRecord, setPreviousRecord] = useState<any | null>(null);

  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [category, setCategory] = useState<CancellationCategory>('สลับไปใช้บริการอื่น');
  const [reason, setReason] = useState('');
  const [priority, setPriority] = useState<PriorityLevel>('กลาง');
  const [rating, setRating] = useState<number>(3);
  const [confirmed, setConfirmed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let isMounted = true;
    const gasWebhookUrl = 'https://script.google.com/macros/s/AKfycbzekm0u18dOk_iVIdA92e_TwcxXaudq5B4i_vK68bxA-hoHbsYpygaAi5Hc45ArFMlv/exec';

    // 1. Function to resolve ticket reference ID & user round per LINE User
    const resolveUserStatus = async (profileObj?: LiffUserProfile | null) => {
      let resolved = false;
      const uId = profileObj?.userId || '';
      const uName = profileObj?.displayName || '';
      const queryParam = `?userId=${encodeURIComponent(uId)}&username=${encodeURIComponent(uName || uId)}`;

      try {
        const res = await fetch(`/api/cancellations/next-id${queryParam}`);
        if (res.ok) {
          const data = await res.json();
          if (isMounted && data.success && data.nextId) {
            setReferenceId(data.nextId);
            if (data.currentRound) {
              setUserRound(data.currentRound);
              setPreviousSubmissionsCount(data.totalHistory || 0);
            }
            resolved = true;
          }
        }
      } catch (e) {}

      // Direct fallback to Google Apps Script
      if (!resolved) {
        try {
          const gasRes = await fetch(`${gasWebhookUrl}?action=checkUser&userId=${encodeURIComponent(uId)}&username=${encodeURIComponent(uName)}`);
          if (gasRes.ok) {
            const gasData = await gasRes.json();
            if (isMounted && gasData.success && gasData.nextId) {
              setReferenceId(gasData.nextId);
              if (gasData.currentRound) {
                setUserRound(gasData.currentRound);
                setPreviousSubmissionsCount(gasData.totalHistory || 0);
              }
              resolved = true;
            }
          }
        } catch (e) {}
      }

      if (isMounted) {
        if (!resolved && !referenceId) {
          setReferenceId('PUI-CANCEL-00001');
        }
        setIsLoadingId(false);
      }
    };

    // Initial resolution
    resolveUserStatus();

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
    const finalUserId = userProfile?.userId || '';
    const finalUsername = userProfile?.displayName || userProfile?.userId || referenceId || 'PUI-CANCEL-00001';

    const payload = {
      id: referenceId || 'PUI-CANCEL-00001',
      userId: finalUserId,
      username: finalUsername,
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
      category,
      reason: reason.trim(),
      priority,
      rating,
      round: userRound,
      notes: `รอบที่ ${userRound}`,
      created_at: new Date().toISOString(),
    };

    let isSuccess = false;
    let resultData: any = null;

    // 1. Try sending to backend API
    try {
      const res = await fetch('/api/cancellations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success && data.data) {
          isSuccess = true;
          resultData = data.data;
        }
      }
    } catch (apiErr) {
      console.warn('Backend API submission warning, attempting direct Google Sheet webhook fallback:', apiErr);
    }

    // 2. Direct client fallback to Google Apps Script (Guaranteed delivery)
    if (!isSuccess) {
      try {
        const gasRes = await fetch(gasWebhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(payload),
        });

        if (gasRes.ok) {
          const gasData = await gasRes.json();
          if (gasData.success) {
            isSuccess = true;
            resultData = {
              ...payload,
              id: gasData.id || referenceId,
              round: gasData.round || userRound,
              status: 'ยกเลิกสำเร็จ',
            };
          }
        }
      } catch (gasErr) {
        console.warn('Google Sheet Webhook direct submission warning:', gasErr);
      }
    }

    if (isSuccess && resultData) {
      try {
        localStorage.setItem('puijai_last_submitted_id', resultData.id);
      } catch (e) {}

      // Send automatic summary notification to LINE OA chat immediately upon submit
      sendLiffSummaryMessage({
        id: resultData.id,
        username: finalUsername,
        category: resultData.category || category,
        reason: resultData.reason || reason,
        round: resultData.round || userRound,
        notes: resultData.notes,
      }).catch(() => {});

      onSubmitSuccess({
        ...resultData,
        round: resultData.round || userRound,
        notes: resultData.notes || `รอบที่ ${resultData.round || userRound}`,
      });
    } else {
      setErrorMessage('ไม่สามารถบันทึกข้อมูลได้ กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ตแล้วลองใหม่อีกครั้ง');
    }

    setIsSubmitting(false);
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
            <img
              src="/puijai-logo.jpg"
              alt="Puijai Logo"
              className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl sm:rounded-3xl border-2 border-white/90 shadow-lg shadow-pink-900/15 object-cover ring-4 ring-white/30 hover:scale-105 transition-transform duration-300"
            />
            <span className="absolute -bottom-1 -right-1 w-4 h-4 sm:w-5 sm:h-5 bg-emerald-400 border-2 border-white rounded-full flex items-center justify-center shadow-xs" title="Puijai Online">
              <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-white rounded-full"></span>
            </span>
          </div>

          <div className="flex items-center justify-center sm:justify-start space-x-1.5 text-white/90 mb-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
            </svg>
            <span className="font-bold text-[10px] sm:text-xs tracking-[0.15em] uppercase opacity-90">
              Puijai Service Cancellation
            </span>
          </div>

          {userRound > 1 && (
            <div className="mb-2.5 inline-flex items-center space-x-1.5 px-3 py-1 bg-amber-500/20 backdrop-blur-sm border border-amber-300/40 rounded-full text-white text-xs font-bold shadow-xs">
              <span>🔁 คำขอยกเลิก: รอบที่ {userRound}</span>
              <span className="text-white/80 font-normal">| เคยยกเลิกมาแล้ว {previousSubmissionsCount} ครั้ง</span>
            </div>
          )}
          
          <h2 className="text-[22px] sm:text-[28px] font-extrabold tracking-tight leading-snug sm:leading-tight drop-shadow-sm text-white mb-2 sm:mb-3">
            <span className="inline-block">แบบฟอร์มขอยกเลิก</span> <span className="inline-block">แชทบอท "Puijai"</span>
          </h2>
          
          <p className="text-white/95 drop-shadow-sm font-medium text-[13px] sm:text-[15px] leading-relaxed opacity-95 max-w-[95%] sm:max-w-none">
            แชทบอท Puijai (น้องปุยใจ) เป็นบริการ AI เราขอขอบคุณที่คุณเปิดโอกาสลองใช้ และยินดีรับฟังข้อเสนอแนะเพื่อนำไปพัฒนาต่อ ☁️
          </p>
        </div>
      </div>

      {/* Main Form */}
      <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-pink-100 p-4 sm:p-8 shadow-xs space-y-5 sm:space-y-6">
        {/* User Identity & Reference Ticket Badge */}
        {userProfile ? (
          <div className="bg-gradient-to-r from-sky-50 to-pink-50/60 border border-sky-200/80 rounded-2xl p-3.5 space-y-2 shadow-2xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3 min-w-0">
                {userProfile.pictureUrl ? (
                  <img
                    src={userProfile.pictureUrl}
                    alt={userProfile.displayName || 'LINE User'}
                    className="w-11 h-11 rounded-full border-2 border-white shadow-xs object-cover flex-shrink-0"
                  />
                ) : (
                  <div className="w-11 h-11 rounded-full bg-sky-200 text-sky-800 flex items-center justify-center font-bold text-sm border-2 border-white shadow-xs flex-shrink-0">
                    {userProfile.displayName ? userProfile.displayName.charAt(0).toUpperCase() : 'U'}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center space-x-1.5">
                    <span className="text-[11px] text-slate-500 font-medium">ผู้ขอยกเลิก:</span>
                    <span className="text-xs font-bold text-slate-800 truncate">
                      {userProfile.displayName || 'บัญชี LINE ของคุณ'}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-600 font-mono flex items-center space-x-2 mt-0.5">
                    <span>รหัสคำขอ:</span>
                    {isLoadingId ? (
                      <span className="text-slate-400 italic inline-flex items-center space-x-1">
                        <span className="w-3 h-3 border border-pink-400 border-t-transparent rounded-full animate-spin inline-block" />
                        <span>กำลังคำนวณรหัส...</span>
                      </span>
                    ) : (
                      <span className="font-bold text-pink-600 bg-white/80 px-1.5 py-0.2 rounded border border-pink-200">
                        {referenceId || 'PUI-CANCEL-00001'}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex flex-col items-end space-y-1">
                <span className="text-[11px] font-bold px-2.5 py-1 bg-pink-100 text-pink-700 rounded-full border border-pink-200">
                  รอบที่ {userRound}
                </span>
                <span className="hidden sm:inline-flex text-[10px] font-medium text-emerald-700 items-center space-x-1">
                  <ShieldCheck className="w-3 h-3 text-emerald-600" />
                  <span>บัญชี LINE นี้</span>
                </span>
              </div>
            </div>
            {previousSubmissionsCount > 0 && previousRecord && (
              <div className="pt-2 border-t border-sky-200/50 text-[11px] text-slate-600 flex items-center justify-between">
                <span>ประวัติ: เคยยกเลิกล่าสุดรหัส <strong className="font-mono text-slate-800">{previousRecord.id}</strong></span>
                <span className="text-pink-600 font-semibold">บันทึกรอบใหม่: รอบที่ {userRound}</span>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center justify-between text-xs">
            <div className="flex items-center space-x-2 text-slate-600">
              <Sparkles className="w-4 h-4 text-pink-500 flex-shrink-0" />
              <span>
                รหัสคำขอยกเลิกบริการของคุณ:{' '}
                {isLoadingId ? (
                  <span className="text-slate-400 italic inline-flex items-center space-x-1 ml-1">
                    <span className="w-3 h-3 border border-slate-400 border-t-transparent rounded-full animate-spin" />
                    <span>กำลังคำนวณรหัส...</span>
                  </span>
                ) : (
                  <strong className="font-mono text-slate-900 bg-white px-1.5 py-0.5 rounded border border-slate-200">
                    {referenceId || 'PUI-CANCEL-00001'}
                  </strong>
                )}
              </span>
            </div>
            <span className="text-[10px] font-semibold px-2 py-0.5 bg-pink-100 text-pink-700 rounded border border-pink-200">
              รอบที่ {userRound}
            </span>
          </div>
        )}

        {errorMessage && (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-sm flex items-center space-x-3">
            <AlertTriangle className="w-5 h-5 flex-shrink-0 text-rose-500" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* 1. Reason Category Selection */}
        <div className="space-y-3">
          <h3 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-2 flex items-start space-x-2">
            <span className="w-6 h-6 rounded-full bg-pink-100 text-pink-700 text-xs flex items-center justify-center font-bold shrink-0 mt-0.5">1</span>
            <span className="min-w-0 flex-1 leading-snug">
              <span className="inline-block">หมวดหมู่เหตุผล</span><span className="inline-block">ที่ขอยกเลิก</span>
            </span>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {CATEGORIES.map((cat) => (
              <label
                key={cat.label}
                className={`flex items-start space-x-3 p-3 rounded-xl border cursor-pointer transition-all min-w-0 ${
                  category === cat.label
                    ? 'border-pink-500 bg-pink-50/70 ring-2 ring-pink-400/20 shadow-xs'
                    : 'border-slate-200 hover:border-pink-200 bg-slate-50/50'
                }`}
              >
                <input
                  type="radio"
                  name="category"
                  checked={category === cat.label}
                  onChange={() => setCategory(cat.label)}
                  className="mt-1 text-pink-600 focus:ring-pink-500 flex-shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center space-x-1.5 text-sm font-bold text-slate-800 break-words">
                    <span className="flex-shrink-0">{cat.icon}</span>
                    <span className="break-words">{cat.label}</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{cat.descriptionNode}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* 2. Detailed Reason Textarea */}
        <div className="space-y-3">
          <h3 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-2 flex items-start space-x-2">
            <span className="w-6 h-6 rounded-full bg-pink-100 text-pink-700 text-xs flex items-center justify-center font-bold shrink-0 mt-0.5">2</span>
            <span className="min-w-0 flex-1 leading-snug">
              <span className="inline-block">รายละเอียดเหตุผล</span><span className="inline-block">และข้อเสนอแนะ <span className="text-rose-500 whitespace-nowrap">*</span></span>
            </span>
          </h3>

          <div>
            <textarea
              rows={4}
              required
              placeholder="ช่วยบอกเราสักนิดว่าทำไมถึงต้องการยกเลิก หรือมีจุดไหนที่คุณอยากให้น้องปุยใจปรับปรุงเพิ่มเติม (เช่น ตอบช้า, คำตอบไม่ตรงใจ, สลับไปใช้แอปอื่น ฯลฯ)..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full p-4 rounded-xl border border-slate-300 focus:ring-2 focus:ring-pink-500 focus:border-pink-500 text-slate-900 text-sm leading-relaxed transition-all placeholder:text-slate-400"
            />
            <p className="text-xs text-slate-500 mt-1">
              ความคิดเห็นของคุณมีค่ามาก เพื่อนำไปพัฒนาการตอบคำถามของน้องปุยใจให้ดียิ่งขึ้น ☁️
            </p>
          </div>
        </div>

        {/* 3. Optional Contact Info (for follow-up if user wants) */}
        <div className="space-y-3">
          <h3 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-2 flex items-start space-x-2">
            <span className="w-6 h-6 rounded-full bg-pink-100 text-pink-700 text-xs flex items-center justify-center font-bold shrink-0 mt-0.5">3</span>
            <span className="min-w-0 flex-1 leading-snug">
              <span>ข้อมูลติดต่อเพิ่มเติม</span> <span className="text-xs font-normal text-slate-400">(ไม่บังคับระบุ)</span>
            </span>
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">เบอร์โทรศัพท์ (ถ้าสะดวกให้ติดต่อ):</label>
              <input
                type="tel"
                placeholder="08X-XXX-XXXX"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full p-2.5 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-pink-500 focus:border-pink-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">อีเมลติดต่อ (ถ้ามี):</label>
              <input
                type="email"
                placeholder="yourname@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full p-2.5 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-pink-500 focus:border-pink-500"
              />
            </div>
          </div>
        </div>

        {/* 4. Priority & Satisfaction Rating */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-2">
          {/* Priority */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
              ระดับความเร่งด่วนในการยกเลิก
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(['ต่ำ', 'กลาง', 'สูง'] as PriorityLevel[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPriority(p)}
                  className={`py-2 px-3 rounded-lg text-xs font-bold border transition-all ${
                    priority === p
                      ? p === 'สูง'
                        ? 'bg-rose-500 text-white border-rose-600'
                        : p === 'กลาง'
                        ? 'bg-sky-500 text-white border-sky-600'
                        : 'bg-emerald-500 text-white border-emerald-600'
                      : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Rating */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
              ความพึงพอใจการใช้งานที่ผ่านมา
            </label>
            <div className="flex items-center space-x-1 py-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  className="p-1 text-amber-400 hover:scale-110 transition-transform"
                >
                  <Star
                    className={`w-6 h-6 ${
                      star <= rating ? 'fill-amber-400 text-amber-400' : 'text-slate-300'
                    }`}
                  />
                </button>
              ))}
              <span className="text-xs text-slate-500 ml-2 font-medium">({rating}/5 คะแนน)</span>
            </div>
          </div>
        </div>

        {/* 5. Policy Notice */}
        <div className="bg-pink-50/60 p-4 rounded-2xl border border-pink-100 space-y-2">
          <div className="flex items-center space-x-2 text-xs font-bold text-pink-900">
            <Info className="w-4 h-4 text-pink-600 flex-shrink-0" />
            <span>ข้อตกลงและผลของการยกเลิกบริการ</span>
          </div>
          <ul className="text-xs text-slate-600 space-y-1 list-disc list-inside pl-1 leading-relaxed">
            <li>หลังจากส่งคำขอ แชทบอท Puijai จะหยุดการตอบกลับอัตโนมัติสำหรับบัญชี LINE นี้</li>
            <li>ข้อมูลข้อเสนอแนะจะถูกนำไปใช้พัฒนาปรับปรุงระบบ AI เพื่อให้ตอบโจทย์ผู้ใช้งานยิ่งขึ้น</li>
            <li>หากในอนาคตต้องการกลับมาใช้งานใหม่ สามารถเปิดใช้งานผ่าน LINE OA ได้เสมอ</li>
          </ul>
        </div>

        {/* Confirmation Checkbox */}
        <div className="pt-2">
          <label className="flex items-start space-x-3 cursor-pointer min-w-0 select-none">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded border-slate-300 text-pink-600 focus:ring-pink-500 flex-shrink-0 cursor-pointer"
            />
            <span className="text-xs sm:text-sm text-slate-700 font-medium leading-relaxed min-w-0 flex-1">
              ข้าพเจ้ายืนยันความประสงค์ที่จะยกเลิกการใช้งานแชทบอท Puijai สำหรับบัญชี LINE นี้ และส่งข้อเสนอแนะเข้าสู่ระบบ
            </span>
          </label>
        </div>

        {/* Form Actions */}
        <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-xs text-slate-500">
            * ข้อมูลจะถูกจัดเก็บลงระบบและแจ้งเตือนเข้าแชท LINE ทันที
          </div>

          <button
            type="submit"
            disabled={isSubmitting || !confirmed}
            className={`w-full sm:w-auto px-8 py-3 rounded-xl font-bold text-sm text-white flex items-center justify-center space-x-2 shadow-md transition-all ${
              confirmed && !isSubmitting
                ? 'bg-pink-600 hover:bg-pink-700 active:scale-98 shadow-pink-200'
                : 'bg-slate-300 cursor-not-allowed'
            }`}
          >
            {isSubmitting ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>กำลังบันทึกและส่งคำขอ...</span>
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                <span>ยืนยันส่งคำขอยกเลิกบริการ</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};
