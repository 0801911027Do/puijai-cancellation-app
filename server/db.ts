import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Cancellation } from '../src/types.js';

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'cancellations.json');
const PDPA_LOGS_FILE = path.join(DATA_DIR, 'pdpa_audit_logs.json');

let memoryStore: Cancellation[] = [];

function ensureDirExists() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  } catch (e) {
    // Ignore read-only filesystem errors on Vercel
  }
}

function safeWriteFileSync(data: Cancellation[]) {
  memoryStore = data;
  try {
    ensureDirExists();
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err: any) {
    try {
      const tmpPath = path.join('/tmp', 'cancellations.json');
      fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (e) {
      // Memory store is already updated
    }
  }
}

export function getAllCancellations(): Cancellation[] {
  let fileRecords: Cancellation[] = [];
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf-8');
      fileRecords = JSON.parse(raw) as Cancellation[];
      memoryStore = fileRecords;
    } else if (fs.existsSync('/tmp/cancellations.json')) {
      const raw = fs.readFileSync('/tmp/cancellations.json', 'utf-8');
      fileRecords = JSON.parse(raw) as Cancellation[];
      memoryStore = fileRecords;
    }
  } catch (err) {
    console.error('Error reading cancellations store:', err);
  }

  const combinedMap = new Map<string, Cancellation>();
  for (const item of fileRecords) {
    if (item && item.id) {
      combinedMap.set(item.id, item);
    }
  }

  return Array.from(combinedMap.values()).filter(
    item => item.username !== 'ผู้ใช้ทดสอบ' && item.email !== 'test@example.com'
  );
}

export async function getUserCancellationInfo(userIdentifier?: string, altIdentifier?: string): Promise<{
  assignedId: string;
  isExistingUser: boolean;
  round: number;
  totalHistory: number;
}> {
  const current = await fetchFromGoogleSheets().catch(() => getAllCancellations());
  
  const rawKeys = [userIdentifier, altIdentifier]
    .filter(Boolean)
    .map(k => String(k).trim().toLowerCase());

  const searchKeys = new Set<string>();
  for (const k of rawKeys) {
    if (k && k !== 'line-device-01') {
      searchKeys.add(k);
      // Strip brackets like [UID:xxx] or [xxx]
      const stripped = k.replace(/^\[uid:/i, '').replace(/\[|\]/g, '').trim();
      if (stripped) searchKeys.add(stripped);
    }
  }

  let existingId: string | null = null;
  let userHistoryCount = 0;
  let maxSeq = 0;

  for (const item of current) {
    if (item && item.id) {
      const match = String(item.id).match(/PUI-CANCEL-(\d+)/i);
      if (match) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num) && num > maxSeq && num < 90000) {
          maxSeq = num;
        }
      }

      if (searchKeys.size > 0) {
        const itemUser = String(item.username || '').trim().toLowerCase();
        const itemUserId = String((item as any).userId || '').trim().toLowerCase();
        const itemNotes = String(item.notes || '').trim().toLowerCase();
        const itemId = String(item.id || '').trim().toLowerCase();

        let isMatch = false;
        for (const key of searchKeys) {
          if (
            itemUser === key ||
            itemUser.includes(key) ||
            itemUserId === key ||
            itemUserId.includes(key) ||
            itemNotes.includes(key) ||
            itemId === key
          ) {
            isMatch = true;
            break;
          }
        }

        if (isMatch) {
          userHistoryCount++;
          if (!existingId) {
            existingId = item.id;
          }
        }
      }
    }
  }

  const nextSeq = Math.max(maxSeq + 1, 1);
  const newId = `PUI-CANCEL-${String(nextSeq).padStart(5, '0')}`;

  return {
    assignedId: newId,
    isExistingUser: userHistoryCount > 0,
    round: userHistoryCount + 1,
    totalHistory: userHistoryCount,
  };
}

export async function getNextCancellationId(userIdentifier?: string): Promise<string> {
  const info = await getUserCancellationInfo(userIdentifier);
  return info.assignedId;
}

export function getNextCancellationIdSync(): string {
  const current = getAllCancellations();
  let maxSeq = 0;
  for (const item of current) {
    if (item && item.id) {
      const match = String(item.id).match(/PUI-CANCEL-(\d+)/i);
      if (match) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num) && num > maxSeq && num < 90000) {
          maxSeq = num;
        }
      }
    }
  }
  const nextSeq = Math.max(maxSeq + 1, 1);
  return `PUI-CANCEL-${String(nextSeq).padStart(5, '0')}`;
}

export function saveCancellation(data: Omit<Cancellation, 'id' | 'created_at' | 'status'> & { id?: string }): Cancellation {
  const current = getAllCancellations();
  const idAlreadyTaken = Boolean(data.id && current.some(c => c.id === data.id));
  const nextId = (data.id && data.id.startsWith('PUI-CANCEL-') && !idAlreadyTaken) ? data.id : getNextCancellationIdSync();
  const newRecord: Cancellation = {
    ...data,
    id: nextId,
    username: data.username || nextId,
    status: 'ยกเลิกสำเร็จ',
    created_at: new Date().toISOString(),
  };

  const updated = [newRecord, ...current.filter(c => c.id !== nextId)];
  safeWriteFileSync(updated);
  return newRecord;
}

export function updateCancellationStatus(id: string, status: Cancellation['status'], notes?: string): Cancellation | null {
  const current = getAllCancellations();
  const index = current.findIndex(item => item.id === id);
  if (index === -1) return null;

  current[index].status = status;
  if (notes !== undefined) {
    current[index].notes = notes;
  }

  ensureDirExists();
  fs.writeFileSync(DB_FILE, JSON.stringify(current, null, 2), 'utf-8');
  return current[index];
}

export function deleteCancellation(id: string): boolean {
  const current = getAllCancellations();
  const filtered = current.filter(item => item.id !== id);
  if (filtered.length === current.length) return false;

  ensureDirExists();
  fs.writeFileSync(DB_FILE, JSON.stringify(filtered, null, 2), 'utf-8');
  return true;
}

export function deleteUserCancellations(userKey: string | string[]): { success: boolean; deletedCount: number } {
  const current = getAllCancellations();
  const rawKeys = Array.isArray(userKey) ? userKey : [userKey];
  const keys = new Set<string>();
  
  for (const k of rawKeys) {
    if (k) {
      const lower = String(k).trim().toLowerCase();
      if (lower && lower !== 'line-device-01') {
        keys.add(lower);
        const stripped = lower.replace(/^\[uid:/i, '').replace(/\[|\]/g, '').trim();
        if (stripped) keys.add(stripped);
      }
    }
  }

  if (keys.size === 0) {
    return { success: false, deletedCount: 0 };
  }

  const remaining: Cancellation[] = [];
  let deletedCount = 0;

  for (const item of current) {
    const itemUser = String(item.username || '').trim().toLowerCase();
    const itemUserId = String((item as any).userId || '').trim().toLowerCase();
    const itemNotes = String(item.notes || '').trim().toLowerCase();
    const itemId = String(item.id || '').trim().toLowerCase();

    let matched = false;
    for (const k of keys) {
      if (
        itemUser === k ||
        itemUser.includes(k) ||
        itemUserId === k ||
        itemUserId.includes(k) ||
        itemNotes.includes(k) ||
        itemId === k
      ) {
        matched = true;
        break;
      }
    }

    if (matched) {
      deletedCount++;
    } else {
      remaining.push(item);
    }
  }

  if (deletedCount > 0) {
    safeWriteFileSync(remaining);
    gasCacheData = gasCacheData.filter(item => {
      const itemUser = String(item.username || '').trim().toLowerCase();
      const itemUserId = String((item as any).userId || '').trim().toLowerCase();
      const itemNotes = String(item.notes || '').trim().toLowerCase();
      const itemId = String(item.id || '').trim().toLowerCase();
      return !Array.from(keys).some(k => 
        itemUser === k || itemUser.includes(k) || itemUserId === k || itemNotes.includes(k) || itemId === k
      );
    });
  }

  return { success: true, deletedCount };
}

export function resetToSampleData(): Cancellation[] {
  ensureDirExists();
  fs.writeFileSync(DB_FILE, JSON.stringify([], null, 2), 'utf-8');
  return [];
}

export function importBatchCancellations(records: Cancellation[]): Cancellation[] {
  ensureDirExists();
  fs.writeFileSync(DB_FILE, JSON.stringify(records, null, 2), 'utf-8');
  return records;
}

let gasCacheData: Cancellation[] = [];
let gasCacheTimestamp = 0;
const GAS_CACHE_TTL_MS = 25 * 1000; // 25 seconds cache TTL
let gasFetchPromise: Promise<Cancellation[]> | null = null;

export async function fetchFromGoogleSheets(forceFresh = false): Promise<Cancellation[]> {
  const now = Date.now();
  const localList = getAllCancellations();

  // If cache is fresh and not forced, return INSTANTLY (0ms)
  if (!forceFresh && gasCacheData.length > 0 && (now - gasCacheTimestamp < GAS_CACHE_TTL_MS)) {
    return gasCacheData;
  }

  // If already fetching, return current cache or reuse promise (Deduplication)
  if (gasFetchPromise) {
    if (gasCacheData.length > 0) return gasCacheData;
    return gasFetchPromise;
  }

  const webhookUrl = process.env.GOOGLE_SHEETS_WEBHOOK_URL || 'https://script.google.com/macros/s/AKfycbzekm0u18dOk_iVIdA92e_TwcxXaudq5B4i_vK68bxA-hoHbsYpygaAi5Hc45ArFMlv/exec';

  gasFetchPromise = (async () => {
    try {
      const response = await fetch(webhookUrl, { 
        redirect: 'follow',
        signal: AbortSignal.timeout(8000)
      });
      if (response.ok) {
        const json = await response.json();
        if (json.success && Array.isArray(json.data)) {
          const filteredData = json.data.filter((item: Cancellation) => 
            item.username !== 'ผู้ใช้ทดสอบ' && 
            item.email !== 'test@example.com' &&
            item.id !== 'PUI-CANCEL-1530' &&
            item.id !== 'PUI-CANCEL-9336'
          );

          // Merge local records and Google Sheets records, avoiding duplicates by id
          const combinedMap = new Map<string, Cancellation>();
          for (const item of [...localList, ...filteredData]) {
            if (item && item.id) {
              combinedMap.set(item.id, item);
            }
          }
          const result = Array.from(combinedMap.values()).sort((a, b) => 
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          );
          gasCacheData = result;
          gasCacheTimestamp = Date.now();
          return result;
        }
      }
    } catch (err) {
      console.error('Failed fetching live data from Google Sheets Webhook:', err);
    } finally {
      gasFetchPromise = null;
    }
    return gasCacheData.length > 0 ? gasCacheData : localList;
  })();

  if (gasCacheData.length > 0) {
    return gasCacheData;
  }

  return gasFetchPromise;
}

export interface PdpaAuditLog {
  receiptId: string;
  timestamp: string;
  rightType: string;
  userHash: string;
  ipHash: string;
  deletedRecordsCount: number;
  status: 'COMPLETED' | 'FAILED';
  actionDetails: string;
  channel: string;
  legalReference: string;
}

let pdpaAuditMemoryStore: PdpaAuditLog[] = [];

export function getPdpaAuditLogs(): PdpaAuditLog[] {
  try {
    if (fs.existsSync(PDPA_LOGS_FILE)) {
      const raw = fs.readFileSync(PDPA_LOGS_FILE, 'utf-8');
      pdpaAuditMemoryStore = JSON.parse(raw);
    } else if (fs.existsSync('/tmp/pdpa_audit_logs.json')) {
      const raw = fs.readFileSync('/tmp/pdpa_audit_logs.json', 'utf-8');
      pdpaAuditMemoryStore = JSON.parse(raw);
    }
  } catch (err) {
    console.error('Error reading PDPA audit logs:', err);
  }
  return pdpaAuditMemoryStore.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

export function recordPdpaErasureAudit(params: {
  userIdOrName: string;
  ipAddress?: string;
  deletedCount: number;
  channel?: string;
  status?: 'COMPLETED' | 'FAILED';
}): PdpaAuditLog {
  const userHash = crypto
    .createHash('sha256')
    .update(String(params.userIdOrName || 'anonymous').trim().toLowerCase())
    .digest('hex');

  const ipHash = crypto
    .createHash('sha256')
    .update(String(params.ipAddress || '127.0.0.1').trim())
    .digest('hex')
    .substring(0, 16);

  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
  const receiptId = `PDPA-DEL-${dateStr}-${randomSuffix}`;

  const entry: PdpaAuditLog = {
    receiptId,
    timestamp: new Date().toISOString(),
    rightType: 'Right to Erasure (สิทธิในการขอให้ลบหรือทำลายข้อมูลส่วนบุคคล)',
    userHash: `HASH-${userHash.substring(0, 24)}...`,
    ipHash: `IP-${ipHash}`,
    deletedRecordsCount: params.deletedCount,
    status: params.status || 'COMPLETED',
    actionDetails: 'Hard delete executed across database, application cache, and Google Sheets',
    channel: params.channel || 'LINE_LIFF_PORTAL',
    legalReference: 'มาตรา 33 พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562'
  };

  const logs = getPdpaAuditLogs();
  logs.unshift(entry);
  pdpaAuditMemoryStore = logs;

  try {
    ensureDirExists();
    fs.writeFileSync(PDPA_LOGS_FILE, JSON.stringify(logs, null, 2), 'utf-8');
  } catch (err) {
    try {
      fs.writeFileSync('/tmp/pdpa_audit_logs.json', JSON.stringify(logs, null, 2), 'utf-8');
    } catch (e) {}
  }

  return entry;
}

