import React, { useState } from 'react';
import { Cancellation } from '../types';
import { CheckCircle2, FileText, Calendar, Tag, MessageCircle, UserCheck } from 'lucide-react';
import { closeLiffWindow, sendLiffSummaryMessage, getCachedLiffProfile } from '../lib/liff';

interface ThankYouViewProps {
  cancellationData: Cancellation;
  onResetForm: () => void;
  onViewAdmin: () => void;
}

export const ThankYouView: React.FC<ThankYouViewProps> = ({
  cancellationData,
  onResetForm,
  onViewAdmin,
}) => {
  const handleReturnToLine = () => {
    closeLiffWindow();
  };

  return (
    <div className="max-w-xl mx-auto py-12 px-4">
      <div className="bg-white rounded-3xl border border-slate-200 p-8 shadow-xl text-center space-y-6">
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
              {cancellationData.notes && cancellationData.notes.includes('รอบที่') && (
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-pink-100 text-pink-700 border border-pink-200 whitespace-nowrap shrink-0 shadow-2xs">
                  {cancellationData.notes.match(/รอบที่\s*\d+/)?.[0] || 'รอบที่ 1'}
                </span>
              )}
              <span className="font-mono font-bold text-slate-800 bg-white px-2.5 py-0.5 rounded-lg border border-slate-200 whitespace-nowrap shrink-0 shadow-2xs text-xs sm:text-sm tracking-tight">
                {cancellationData.id}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-800 font-medium">
            <div className="flex items-center space-x-1.5 min-w-0">
              <Calendar className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <span className="truncate">{new Date(cancellationData.created_at).toLocaleString('th-TH')}</span>
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

        {/* Action Buttons */}
        <div className="pt-4 flex items-center justify-center">
          <button
            type="button"
            onClick={handleReturnToLine}
            className="w-full sm:w-auto px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm flex items-center justify-center space-x-2 shadow-md shadow-emerald-900/20 transition-all cursor-pointer"
          >
            <MessageCircle className="w-4 h-4" />
            <span>กลับไปยังแชท LINE</span>
          </button>
        </div>
      </div>
    </div>
  );
};
