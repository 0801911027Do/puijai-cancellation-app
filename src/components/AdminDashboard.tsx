import React, { useState, useEffect, useRef } from 'react';
import { Cancellation, AIAnalysisResult, CancellationStatus } from '../types';
import {
  FileSpreadsheet,
  Download,
  Upload,
  ExternalLink,
  Copy,
  Check,
  Search,
  Filter,
  RefreshCw,
  Sparkles,
  BarChart3,
  AlertTriangle,
  Star,
  CheckCircle2,
  Clock,
  Layers,
  HelpCircle,
  ChevronLeft,
  ChevronRight,
  X,
  ArrowDown,
  ArrowUp,
  ArrowUpDown
} from 'lucide-react';

interface AdminDashboardProps {
  cancellations: Cancellation[];
  onRefresh: () => void;
  onViewUserForm: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  cancellations,
  onRefresh,
  onViewUserForm,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ทั้งหมด');
  const [selectedPriority, setSelectedPriority] = useState<string>('ทั้งหมด');
  const [googleSheetUrl, setGoogleSheetUrl] = useState<string>('https://docs.google.com/spreadsheets/d/1gKkHEsunANN_5OAzVigbFxE5XFf7VRLlYiQA6RgOCIY/edit?gid=0#gid=0');
  const [copiedTSV, setCopiedTSV] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importTsvText, setImportTsvText] = useState('');
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<Cancellation | null>(null);
  const [editingStatus, setEditingStatus] = useState<Cancellation['status']>('ยกเลิกสำเร็จ');
  const [editingNotes, setEditingNotes] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiResult, setAiResult] = useState<AIAnalysisResult | null>(null);
  const [isResetting, setIsResetting] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');

  // Drag to scroll table state
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isMouseDown, setIsMouseDown] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeftState, setScrollLeftState] = useState(0);

  const handleMouseDown = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('button, input, select, a, textarea')) return;
    if (!scrollContainerRef.current) return;
    setIsMouseDown(true);
    setStartX(e.pageX - scrollContainerRef.current.offsetLeft);
    setScrollLeftState(scrollContainerRef.current.scrollLeft);
  };

  const handleMouseLeave = () => {
    setIsMouseDown(false);
    setIsDragging(false);
  };

  const handleMouseUp = () => {
    setIsMouseDown(false);
    setIsDragging(false);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isMouseDown || !scrollContainerRef.current) return;
    const x = e.pageX - scrollContainerRef.current.offsetLeft;
    const walk = (x - startX) * 1.5;
    if (Math.abs(x - startX) > 5) {
      setIsDragging(true);
      scrollContainerRef.current.scrollLeft = scrollLeftState - walk;
    }
  };

  // Enable mouse wheel horizontal scrolling on table
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      if (container.scrollWidth <= container.clientWidth) return;

      // Convert vertical scroll wheel to horizontal scroll when hovering over table
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        const isScrollDown = e.deltaY > 0;
        const canScrollRight = isScrollDown && container.scrollLeft < container.scrollWidth - container.clientWidth - 1;
        const canScrollLeft = !isScrollDown && container.scrollLeft > 1;

        if (canScrollRight || canScrollLeft) {
          e.preventDefault();
          container.scrollLeft += e.deltaY * 1.2;
        }
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      container.removeEventListener('wheel', handleWheel);
    };
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedCategory, selectedPriority, itemsPerPage, sortOrder]);

  // Filtered & Sorted List
  const filteredList = cancellations
    .filter((item) => {
      const matchesSearch =
        item.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.reason.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.email && item.email.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchesCategory =
        selectedCategory === 'ทั้งหมด' || item.category === selectedCategory;

      const matchesPriority =
        selectedPriority === 'ทั้งหมด' || item.priority === selectedPriority;

      return matchesSearch && matchesCategory && matchesPriority;
    })
    .sort((a, b) => {
      const timeA = new Date(a.created_at).getTime();
      const timeB = new Date(b.created_at).getTime();
      return sortOrder === 'desc' ? timeB - timeA : timeA - timeB;
    });

  const totalPages = Math.max(1, Math.ceil(filteredList.length / itemsPerPage));
  const paginatedList = filteredList.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Calculate Metrics
  const total = cancellations.length;
  const highPriorityCount = cancellations.filter((i) => i.priority === 'สูง').length;
  
  const categoryCounts: Record<string, number> = {};
  cancellations.forEach((i) => {
    categoryCounts[i.category] = (categoryCounts[i.category] || 0) + 1;
  });
  
  const topCategory =
    Object.entries(categoryCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'ไม่มีข้อมูล';

  const averageRating = total > 0
    ? (cancellations.reduce((acc, curr) => acc + (curr.rating || 3), 0) / total).toFixed(1)
    : '0';

  // Copy TSV for Google Sheets Paste
  const handleCopyTSV = () => {
    const headers = ['รหัสคำขอ', 'วันที่/เวลา', 'หมวดหมู่เหตุผล', 'รายละเอียดเหตุผล', 'ความสำคัญ', 'คะแนน', 'สถานะ', 'หมายเหตุ'];
    const rows = filteredList.map((item) => [
      item.id,
      new Date(item.created_at).toLocaleString('th-TH'),
      item.category,
      item.reason.replace(/\n/g, ' '),
      item.priority,
      item.rating || 3,
      item.status,
      item.notes || '-'
    ]);

    const tsvContent = [headers.join('\t'), ...rows.map((r) => r.join('\t'))].join('\n');
    navigator.clipboard.writeText(tsvContent);
    setCopiedTSV(true);
    setTimeout(() => setCopiedTSV(false), 2000);
  };

  const parseThaiDateToIso = (dateStr: string): string => {
    try {
      if (dateStr.includes('T') || dateStr.includes('-')) return new Date(dateStr).toISOString();
      const parts = dateStr.split(' ');
      const dateParts = parts[0].split('/');
      if (dateParts.length === 3) {
        let year = parseInt(dateParts[2], 10);
        if (year > 2500) year -= 543;
        const month = parseInt(dateParts[1], 10) - 1;
        const day = parseInt(dateParts[0], 10);

        let hours = 0, minutes = 0, seconds = 0;
        if (parts[1]) {
          const timeParts = parts[1].split(':');
          hours = parseInt(timeParts[0], 10) || 0;
          minutes = parseInt(timeParts[1], 10) || 0;
          seconds = parseInt(timeParts[2], 10) || 0;
        }

        return new Date(Date.UTC(year, month, day, hours, minutes, seconds)).toISOString();
      }
    } catch (e) {}
    return new Date().toISOString();
  };

  const handleImportTSV = async () => {
    if (!importTsvText.trim()) return;
    try {
      const lines = importTsvText.trim().split('\n');
      const records: Cancellation[] = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const cols = line.split('\t').map(c => c.trim());
        if (i === 0 && (cols[0].includes('รหัส') || cols[0].toLowerCase().includes('id'))) continue;

        const id = cols[0] || `PUI-CANCEL-0000${i+1}`;
        const created_at = cols[1] ? parseThaiDateToIso(cols[1]) : new Date().toISOString();
        let category = 'อื่นๆ';
        let reason = '-';
        let priority: 'สูง' | 'ต่ำ' | 'กลาง' = 'กลาง';
        let rating = 3;
        let status: CancellationStatus = 'ยกเลิกสำเร็จ';
        let notes: string | undefined = undefined;

        if (cols.length <= 9) {
          // New 8-column layout: รหัสคำขอ, วันที่/เวลา, หมวดหมู่เหตุผล, รายละเอียดเหตุผล, ความสำคัญ, คะแนน, สถานะ, หมายเหตุ
          category = cols[2] || 'อื่นๆ';
          reason = cols[3] || '-';
          priority = (cols[4] === 'สูง' || cols[4] === 'ต่ำ' || cols[4] === 'กลาง') ? cols[4] : 'กลาง';
          rating = cols[5] ? Number(cols[5]) || 3 : 3;
          if (cols[6] === 'ติดต่อดูแลแล้ว' || cols[6] === 'รอดำเนินการ' || cols[6] === 'ยกเลิกสำเร็จ') {
            status = cols[6];
          }
          notes = cols[7] || undefined;
        } else {
          // Legacy 11-column layout
          category = cols[5] || 'อื่นๆ';
          reason = cols[6] || '-';
          priority = (cols[7] === 'สูง' || cols[7] === 'ต่ำ' || cols[7] === 'กลาง') ? cols[7] : 'กลาง';
          rating = cols[8] ? Number(cols[8]) || 3 : 3;
          if (cols[9] === 'ติดต่อดูแลแล้ว' || cols[9] === 'รอดำเนินการ' || cols[9] === 'ยกเลิกสำเร็จ') {
            status = cols[9];
          }
          notes = cols[10] || undefined;
        }

        records.push({
          id,
          created_at,
          username: id,
          category,
          reason,
          priority,
          rating,
          status,
          notes
        });
      }

      const res = await fetch('/api/cancellations/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(records),
      });

      const data = await res.json();
      if (data.success) {
        setImportMessage(`นำเข้าข้อมูลจาก Google Sheets สำเร็จ ${data.data.length} รายการ`);
        setTimeout(() => {
          setIsImportModalOpen(false);
          setImportTsvText('');
          setImportMessage(null);
          onRefresh();
        }, 1200);
      } else {
        setImportMessage(`เกิดข้อผิดพลาด: ${data.error}`);
      }
    } catch (err: any) {
      setImportMessage(`เกิดข้อผิดพลาดในการประมวลผล: ${err.message}`);
    }
  };

  // Run Gemini Analysis
  const handleRunAIAnalysis = async () => {
    setIsAnalyzing(true);
    try {
      const res = await fetch('/api/analyze', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setAiResult(data.data);
      }
    } catch (err) {
      console.error('Failed AI analysis:', err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Save Edit
  const handleSaveEdit = async () => {
    if (!editingItem) return;
    try {
      await fetch(`/api/cancellations/${editingItem.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: editingStatus,
          notes: editingNotes,
        }),
      });
      setEditingItem(null);
      onRefresh();
    } catch (err) {
      console.error('Failed update:', err);
    }
  };

  // Delete Row
  const handleDeleteRow = async (id: string) => {
    if (!confirm('ยืนยันการลบรายการคำขอยกเลิกนี้ออกจากฐานข้อมูล?')) return;
    try {
      await fetch(`/api/cancellations/${id}`, { method: 'DELETE' });
      onRefresh();
    } catch (err) {
      console.error('Failed delete:', err);
    }
  };

  // Reset to Sample Data
  const handleResetData = async () => {
    if (!confirm('ต้องการล้างข้อมูลทั้งหมดในระบบใช่หรือไม่?')) return;
    setIsResetting(true);
    try {
      await fetch('/api/cancellations/reset', { method: 'POST' });
      onRefresh();
    } catch (err) {
      console.error('Failed reset:', err);
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="max-w-[1600px] mx-auto py-4 sm:py-8 px-2.5 sm:px-6 lg:px-8 space-y-4 sm:space-y-6">
      {/* Top Banner */}
      <div className="relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-4 sm:gap-5 bg-slate-900 text-white p-4 sm:p-7 rounded-2xl border border-slate-800 shadow-xl">
        {/* Background Decorative Glow Effects */}
        <div className="absolute -top-24 -right-24 w-64 h-64 bg-sky-500/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-emerald-500/15 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 space-y-2 sm:space-y-2.5">
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <span className="bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 px-2.5 py-1 rounded-full text-[11px] sm:text-xs font-bold inline-flex items-center gap-1.5 shadow-inner shrink-0">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="whitespace-nowrap">Database Center</span>
            </span>
            <span className="bg-sky-950/80 border border-sky-500/40 text-sky-300 px-2.5 py-1 rounded-full text-[11px] font-semibold inline-flex items-center gap-1 shrink-0">
              <Sparkles className="w-3 h-3 text-sky-400 shrink-0" />
              <span className="whitespace-nowrap">Realtime Connected</span>
            </span>
          </div>

          <h2 className="text-base sm:text-2xl font-black tracking-tight text-white leading-snug break-words">
            ศูนย์บันทึกคำขอยกเลิกการใช้งานปุยใจ
          </h2>
          <p className="text-slate-300 text-xs sm:text-sm leading-relaxed max-w-2xl font-normal opacity-95 break-words">
            จัดเก็บเหตุผลการยกเลิกอย่างเป็นระบบ สรุปผลวิเคราะห์ และสามารถส่งออกข้อมูลเป็นไฟล์ CSV ได้ทันที
          </p>
        </div>

        <div className="relative z-10 flex flex-wrap items-center gap-3">
          <a
            href="/api/export/csv"
            download="puijai_cancellations.csv"
            className="w-full sm:w-auto justify-center px-4 py-2.5 bg-linear-to-r from-emerald-500 via-emerald-600 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white text-xs sm:text-sm font-bold rounded-xl flex items-center space-x-2 shadow-lg shadow-emerald-900/40 hover:shadow-emerald-900/60 transition-all transform hover:-translate-y-0.5 active:translate-y-0"
          >
            <Download className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
            <span>ดาวน์โหลด CSV</span>
          </a>
        </div>
      </div>

      {/* Analytics Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500">จำนวนขอยกเลิกทั้งหมด</p>
            <p className="text-2xl font-extrabold text-slate-900 mt-1">{total} รายการ</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-700">
            <Layers className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500">เหตุผลยอดนิยม</p>
            <p className="text-sm sm:text-base font-extrabold text-rose-600 mt-1 break-words leading-tight">{topCategory}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center text-rose-600">
            <BarChart3 className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500">ระดับผลกระทบสูง (High Impact)</p>
            <p className="text-2xl font-extrabold text-amber-600 mt-1">{highPriorityCount} รายการ</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center text-amber-600">
            <AlertTriangle className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500">คะแนนเฉลี่ยความพึงพอใจ</p>
            <p className="text-2xl font-extrabold text-amber-500 mt-1 flex items-center space-x-1">
              <span>{averageRating}</span>
              <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center text-amber-500">
            <Star className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* AI Analysis Insight Drawer / Box if generated */}
      {aiResult && (
        <div className="bg-gradient-to-br from-indigo-900 to-purple-950 text-white rounded-2xl p-6 shadow-xl border border-indigo-700/50 relative">
          <button
            onClick={() => setAiResult(null)}
            className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center space-x-2 text-indigo-300 text-xs font-bold uppercase tracking-wider mb-2">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span>ผลการวิเคราะห์และข้อเสนอแนะโดย Gemini AI</span>
          </div>

          <p className="text-sm text-indigo-100 font-medium mb-4 leading-relaxed">
            {aiResult.summary}
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-indigo-800/80 text-xs">
            <div>
              <h4 className="font-bold text-amber-300 uppercase tracking-wider mb-2 flex items-center space-x-1.5">
                <AlertTriangle className="w-4 h-4" />
                <span>สาเหตุปัญหาหลัก (Top Pain Points)</span>
              </h4>
              <ul className="space-y-1.5 text-slate-200 list-disc list-inside">
                {aiResult.topIssues.map((issue, idx) => (
                  <li key={idx} className="leading-relaxed">{issue}</li>
                ))}
              </ul>
            </div>

            <div>
              <h4 className="font-bold text-emerald-300 uppercase tracking-wider mb-2 flex items-center space-x-1.5">
                <CheckCircle2 className="w-4 h-4" />
                <span>แนวทางแก้ไขและรักษาลูกค้า (Retention Strategy)</span>
              </h4>
              <ul className="space-y-1.5 text-slate-200 list-disc list-inside">
                {aiResult.retentionSuggestions.map((sug, idx) => (
                  <li key={idx} className="leading-relaxed">{sug}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Search, Filter & Controls Header */}
      <div className="bg-white p-4 rounded-2xl border border-sky-100 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            placeholder="ค้นหาตามชื่อผู้ใช้, อีเมล, หรือคำค้นในเหตุผล..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 text-xs text-slate-800 focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
          />
        </div>

        {/* Category & Priority Filters */}
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <div className="flex items-center space-x-1.5">
            <Filter className="w-3.5 h-3.5 text-slate-500" />
            <span className="font-semibold text-slate-600">หมวดหมู่:</span>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-800 font-medium"
            >
              <option value="ทั้งหมด">ทั้งหมด</option>
              <option value="สลับไปใช้บริการอื่น">สลับไปใช้บริการอื่น</option>
              <option value="ไม่ตอบโจทย์การใช้งาน">ไม่ตอบโจทย์การใช้งาน</option>
              <option value="พบปัญหาเทคนิค/บั๊ก">พบปัญหาเทคนิค/บั๊ก</option>
              <option value="ใช้งานยาก">ใช้งานยาก</option>
              <option value="เหตุผลส่วนตัว">เหตุผลส่วนตัว</option>
              <option value="อื่นๆ">อื่นๆ</option>
            </select>
          </div>

          <div className="flex items-center space-x-1.5">
            <span className="font-semibold text-slate-600">ระดับ:</span>
            <select
              value={selectedPriority}
              onChange={(e) => setSelectedPriority(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-800 font-medium"
            >
              <option value="ทั้งหมด">ทั้งหมด</option>
              <option value="สูง">สูง</option>
              <option value="กลาง">กลาง</option>
              <option value="ต่ำ">ต่ำ</option>
            </select>
          </div>

          <button
            onClick={handleResetData}
            disabled={isResetting}
            title="รีเซ็ตเป็นข้อมูลตัวอย่างเริ่มต้น"
            className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg border border-slate-200"
          >
            <RefreshCw className={`w-4 h-4 ${isResetting ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Google Sheets Formatted Data Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {/* Sheet Tab Decorator */}
        <div className="bg-slate-100 px-4 py-2 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs font-mono text-slate-600">
          <div className="flex items-center space-x-2">
            <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block shrink-0" />
            <span className="font-bold text-slate-700">ตารางบันทึกคำขอยกเลิก</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="whitespace-nowrap">แสดง {filteredList.length} จากทั้งหมด {total} รายการ</span>
          </div>
        </div>

        <div 
          ref={scrollContainerRef}
          onMouseDown={handleMouseDown}
          onMouseLeave={handleMouseLeave}
          onMouseUp={handleMouseUp}
          onMouseMove={handleMouseMove}
          className={`overflow-x-auto touch-pan-x overscroll-x-contain select-none cursor-grab active:cursor-grabbing ${
            isDragging ? 'cursor-grabbing' : ''
          }`}
        >
          <table className="w-full text-left text-xs sm:text-sm text-slate-800 border-collapse">
            <thead className="bg-slate-100/90 border-b-2 border-slate-300 text-slate-700 font-bold text-xs">
              <tr>
                <th className="py-3.5 px-3 w-12 text-center border-r border-slate-200">#</th>
                <th 
                  onClick={() => setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
                  className="py-3.5 px-3.5 border-r border-slate-200 cursor-pointer select-none hover:bg-slate-200/70 transition-colors group whitespace-nowrap w-[160px] min-w-[160px]"
                  title="คลิกเพื่อสลับการเรียงลำดับวันที่ (ล่าสุด <-> เก่าสุด)"
                >
                  <div className="flex items-center justify-between whitespace-nowrap gap-1">
                    <span className="whitespace-nowrap font-bold text-slate-800">วันที่/เวลา</span>
                    <span className="w-[68px] h-5.5 inline-flex items-center justify-center gap-1 rounded-md text-[10px] font-bold bg-sky-100 text-sky-800 border border-sky-300 group-hover:bg-sky-200 transition-colors shrink-0 whitespace-nowrap">
                      {sortOrder === 'desc' ? (
                        <>
                          <span>ล่าสุด</span>
                          <ArrowDown className="w-3 h-3 shrink-0" />
                        </>
                      ) : (
                        <>
                          <span>เก่าสุด</span>
                          <ArrowUp className="w-3 h-3 shrink-0" />
                        </>
                      )}
                    </span>
                  </div>
                </th>
                <th className="py-3.5 px-4 border-r border-slate-200 whitespace-nowrap min-w-[180px]">รหัสคำขอ / ติดต่อ</th>
                <th className="py-3.5 px-4 border-r border-slate-200 whitespace-nowrap min-w-[160px]">หมวดหมู่เหตุผล</th>
                <th className="py-3.5 px-5 border-r border-slate-200 min-w-[320px] lg:min-w-[420px]">รายละเอียดเหตุผล</th>
                <th className="py-3.5 px-3 border-r border-slate-200 text-center min-w-[90px]">ความสำคัญ</th>
                <th className="py-3.5 px-4 text-center min-w-[130px]">สถานะดำเนินการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/80 font-sans">
              {filteredList.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400 bg-white">
                    <p className="text-sm font-medium">ไม่พบข้อมูลรายการยกเลิก</p>
                  </td>
                </tr>
              ) : (
                paginatedList.map((item, index) => (
                  <tr key={item.id} className="even:bg-slate-50/50 hover:bg-sky-50/70 transition-colors">
                    {/* Index */}
                    <td className="py-3 px-3 text-center font-mono text-slate-400 border-r border-slate-200/80 text-xs">
                      {(currentPage - 1) * itemsPerPage + index + 1}
                    </td>

                    {/* Date */}
                    <td className="py-3 px-3.5 font-mono text-slate-700 border-r border-slate-200/80 whitespace-nowrap w-[160px] min-w-[160px] text-xs">
                      {new Date(item.created_at).toLocaleString('th-TH', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>

                    {/* Reference ID & Contact */}
                    <td className="py-3 px-4 border-r border-slate-200/80 min-w-[180px]">
                      <div className="font-mono font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 inline-block text-xs">
                        {item.id}
                      </div>
                      {item.username && item.username !== item.id && item.username !== '-' && (
                        <div className="text-xs font-semibold text-slate-700 mt-1 whitespace-nowrap">
                          {item.username}
                        </div>
                      )}
                      {((item.email && item.email.trim() !== '-' && item.email.trim() !== '') ||
                        (item.phone && item.phone.trim() !== '-' && item.phone.trim() !== '')) && (
                        <div className="text-xs text-slate-500 mt-0.5 space-y-0.5">
                          {item.email && item.email.trim() !== '-' && item.email.trim() !== '' && (
                            <div className="whitespace-nowrap">{item.email}</div>
                          )}
                          {item.phone && item.phone.trim() !== '-' && item.phone.trim() !== '' && (
                            <div className="whitespace-nowrap font-mono text-[11px] text-slate-600">{item.phone}</div>
                          )}
                        </div>
                      )}
                    </td>

                    {/* Category */}
                    <td className="py-3 px-4 border-r border-slate-200/80 min-w-[160px]">
                      <span className="inline-block bg-slate-100 text-slate-800 font-semibold px-2.5 py-1 rounded-md border border-slate-200 whitespace-nowrap text-xs">
                        {item.category}
                      </span>
                    </td>

                    {/* Reason */}
                    <td className="py-3 px-5 border-r border-slate-200/80 text-slate-800 min-w-[320px] lg:min-w-[420px]">
                      <p className="break-words whitespace-pre-wrap leading-relaxed text-xs sm:text-sm font-medium">{item.reason}</p>
                      {item.notes && item.notes.trim() !== '' && item.notes.trim() !== '-' && (
                        <div className="text-xs text-amber-900 bg-amber-50 px-3 py-1.5 rounded-md border border-amber-200 mt-1.5 leading-relaxed break-words whitespace-pre-wrap">
                          <span className="font-bold text-amber-950 whitespace-nowrap mr-1">หมายเหตุ admin:</span>
                          <span>{item.notes}</span>
                        </div>
                      )}
                    </td>

                    {/* Priority */}
                    <td className="py-3 px-3 border-r border-slate-200/80 text-center whitespace-nowrap">
                      <span
                        className={`inline-flex items-center justify-center font-bold px-2.5 py-1 rounded-md text-xs border ${
                          item.priority === 'สูง'
                            ? 'bg-rose-100 text-rose-800 border-rose-300 font-extrabold'
                            : item.priority === 'กลาง'
                            ? 'bg-amber-100 text-amber-900 border-amber-300 font-extrabold'
                            : 'bg-emerald-100 text-emerald-900 border-emerald-300 font-bold'
                        }`}
                      >
                        {item.priority}
                      </span>
                    </td>

                    {/* Status */}
                    <td className="py-3 px-4 text-center whitespace-nowrap">
                      <button
                        onClick={() => {
                          setEditingItem(item);
                          setEditingStatus(item.status);
                          setEditingNotes(item.notes || '');
                        }}
                        title="คลิกเพื่อปรับเปลี่ยนสถานะ"
                        className={`inline-flex items-center justify-center font-bold px-2.5 py-1 rounded-md text-xs border hover:shadow-sm hover:scale-[1.02] transition-all cursor-pointer ${
                          item.status === 'ยกเลิกสำเร็จ'
                            ? 'bg-slate-100 text-slate-800 border-slate-300'
                            : item.status === 'ติดต่อดูแลแล้ว'
                            ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                            : 'bg-amber-100 text-amber-900 border-amber-300'
                        }`}
                      >
                        {item.status}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls Footer */}
        <div className="bg-slate-50/90 border-t border-slate-200 px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
          <div className="flex items-center space-x-3 text-slate-500 font-medium">
            <span>
              แสดง {filteredList.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0} - {Math.min(currentPage * itemsPerPage, filteredList.length)} จาก {filteredList.length} รายการ
            </span>
            <span className="text-slate-300">|</span>
            <div className="flex items-center space-x-1.5">
              <span>แสดงหน้าละ:</span>
              <select
                value={itemsPerPage}
                onChange={(e) => setItemsPerPage(Number(e.target.value))}
                className="bg-white border border-slate-200 rounded-lg px-2 py-0.5 text-slate-800 font-bold focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              >
                <option value={10}>10 รายการ</option>
                <option value={25}>25 รายการ</option>
                <option value={50}>50 รายการ</option>
                <option value={100}>100 รายการ</option>
              </select>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className={`p-2 rounded-xl border flex items-center justify-center transition-all ${
                currentPage === 1
                  ? 'bg-slate-100 border-slate-200 text-slate-300 cursor-not-allowed'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100 shadow-2xs font-bold'
              }`}
              title="หน้าก่อนหน้า"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <span className="font-semibold text-slate-800 px-2.5 py-1 bg-white border border-slate-200 rounded-lg shadow-2xs">
              หน้า {currentPage} / {totalPages}
            </span>

            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className={`p-2 rounded-xl border flex items-center justify-center transition-all ${
                currentPage === totalPages
                  ? 'bg-slate-100 border-slate-200 text-slate-300 cursor-not-allowed'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100 shadow-2xs font-bold'
              }`}
              title="หน้าถัดไป"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Edit Modal */}
      {editingItem && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-slate-900 text-sm">
                อัปเดตสถานะคำขอ: {editingItem.id} ({editingItem.username})
              </h3>
              <button
                onClick={() => setEditingItem(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">สถานะดำเนินการ</label>
                <select
                  value={editingStatus}
                  onChange={(e) => setEditingStatus(e.target.value as any)}
                  className="w-full p-2.5 rounded-xl border border-slate-300 text-slate-800 text-xs"
                >
                  <option value="ยกเลิกสำเร็จ">ยกเลิกสำเร็จ</option>
                  <option value="ติดต่อดูแลแล้ว">ติดต่อดูแลแล้ว</option>
                  <option value="รอดำเนินการ">รอดำเนินการ</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">บันทึกหมายเหตุเพิ่มเติม</label>
                <textarea
                  rows={3}
                  placeholder="เช่น ติดต่อเสนอส่วนลดแล้ว หรือ โอนย้ายข้อมูลให้ลูกค้าเรียบร้อย..."
                  value={editingNotes}
                  onChange={(e) => setEditingNotes(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-slate-300 text-slate-800 text-xs"
                />
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-2 border-t">
              <button
                onClick={() => setEditingItem(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleSaveEdit}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white shadow-xs"
              >
                บันทึกการแก้ไข
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Google Sheets TSV Import Modal */}
      {isImportModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-2xl w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center space-x-2">
                <Upload className="w-5 h-5 text-sky-600" />
                <h3 className="font-bold text-slate-900 text-sm sm:text-base">
                  นำเข้าข้อมูลจากการ คัดลอก (Copy) ตารางใน Google Sheets
                </h3>
              </div>
              <button
                onClick={() => setIsImportModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              วิธีใช้งาน: คัดลอกแถวตารางข้อมูลจาก Google Sheets (Ctrl+C) แล้วนำมาวาง (Ctrl+V) ในช่องด้านล่างเพื่อนำเข้าข้อมูลจริงเข้าสู่ระบบโดยตรง
            </p>

            {importMessage && (
              <div className={`p-3 rounded-xl text-xs font-semibold ${importMessage.includes('สำเร็จ') ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'}`}>
                {importMessage}
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                วางข้อความแถวตารางที่นี่ (TSV / Tab-Separated):
              </label>
              <textarea
                rows={8}
                value={importTsvText}
                onChange={(e) => setImportTsvText(e.target.value)}
                placeholder="ตัวอย่าง: PUI-CANCEL-1001&#9;8/8/2569 6:34:51&#9;somchai_dev&#9;somchai@example.com..."
                className="w-full p-3 rounded-xl border border-slate-300 text-xs font-mono text-slate-800 focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
              />
            </div>

            <div className="flex items-center justify-between pt-2 border-t text-xs">
              <span className="text-slate-500">ตรวจสอบความถูกต้องด้วย Zod Schema ก่อนบันทึก</span>
              <div className="flex space-x-2">
                <button
                  type="button"
                  onClick={() => setIsImportModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  onClick={handleImportTSV}
                  disabled={!importTsvText.trim()}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-sky-600 hover:bg-sky-700 disabled:bg-slate-300 text-white shadow-xs transition-colors cursor-pointer"
                >
                  นำเข้าข้อมูลลงในระบบ
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
