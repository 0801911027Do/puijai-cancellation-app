import fs from 'fs';
import path from 'path';
import { Cancellation } from '../src/types.js';

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'cancellations.json');

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

  if (existingId || userHistoryCount > 0) {
    return {
      assignedId: existingId || `PUI-CANCEL-${String(Math.max(maxSeq + 1, 1)).padStart(5, '0')}`,
      isExistingUser: true,
      round: userHistoryCount + 1,
      totalHistory: userHistoryCount,
    };
  }

  const nextSeq = Math.max(maxSeq + 1, 1);
  const newId = `PUI-CANCEL-${String(nextSeq).padStart(5, '0')}`;
  return {
    assignedId: newId,
    isExistingUser: false,
    round: 1,
    totalHistory: 0,
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
  const nextId = data.id && data.id.startsWith('PUI-CANCEL-') ? data.id : getNextCancellationIdSync();
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
        signal: AbortSignal.timeout(5000)
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
