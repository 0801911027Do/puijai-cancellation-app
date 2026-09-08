export type PriorityLevel = 'สูง' | 'กลาง' | 'ต่ำ';

export type CancellationCategory =
  | 'สลับไปใช้บริการอื่น'
  | 'ไม่ตอบโจทย์การใช้งาน'
  | 'พบปัญหาเทคนิค/บั๊ก'
  | 'ใช้งานยาก'
  | 'เหตุผลส่วนตัว'
  | 'อื่นๆ';

export type CancellationStatus = 'ยกเลิกสำเร็จ' | 'รอดำเนินการ' | 'ติดต่อดูแลแล้ว';

export interface Cancellation {
  id: string;
  username: string;
  email?: string;
  phone?: string;
  category: CancellationCategory | string;
  reason: string;
  priority: PriorityLevel;
  rating?: number; // 1-5 rating
  status: CancellationStatus;
  created_at: string; // ISO date string
  notes?: string;
  round?: number;
  roundLabel?: string;
}

export interface CancellationAnalytics {
  total: number;
  categoryCount: Record<string, number>;
  priorityCount: Record<string, number>;
  statusCount: Record<string, number>;
  todayCount: number;
}

export interface AIAnalysisResult {
  summary: string;
  topIssues: string[];
  retentionSuggestions: string[];
  overallSentiment: string;
}
