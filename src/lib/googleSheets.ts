import { Cancellation } from '../types';

export interface SheetInfo {
  spreadsheetId: string;
  spreadsheetUrl: string;
  title: string;
}

/**
 * Creates a new Google Spreadsheet in the authenticated user's Google Drive
 * and writes initial headers and cancellation records.
 */
export async function createCancellationSpreadsheet(
  accessToken: string,
  title: string = 'ปุยใจ (Puijai) - รายการคำขอยกเลิกบริการ',
  records: Cancellation[] = []
): Promise<SheetInfo> {
  const headers = [
    'รหัสคำขอ (ID)',
    'วันที่-เวลา (Date)',
    'หมวดหมู่เหตุผล (Category)',
    'รายละเอียดเหตุผล (Reason)',
    'ระดับความสำคัญ (Priority)',
    'สถานะ (Status)'
  ];

  const rows = records.map((r) => [
    r.id,
    new Date(r.created_at || Date.now()).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }),
    r.category || '-',
    r.reason || '-',
    r.priority || 'กลาง',
    r.status || 'ยกเลิกสำเร็จ'
  ]);

  const body = {
    properties: {
      title: title
    },
    sheets: [
      {
        properties: {
          title: 'รายการคำขอยกเลิก',
          gridProperties: {
            frozenRowCount: 1
          }
        },
        data: [
          {
            startRow: 0,
            startColumn: 0,
            rowData: [
              {
                values: headers.map((h) => ({
                  userEnteredValue: { stringValue: h },
                  userEnteredFormat: {
                    textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
                    backgroundColor: { red: 0.88, green: 0.22, blue: 0.33 } // Rose/Red header
                  }
                }))
              },
              ...rows.map((row) => ({
                values: row.map((val) => ({
                  userEnteredValue: { stringValue: String(val) }
                }))
              }))
            ]
          }
        ]
      }
    ]
  };

  const response = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errData = await response.json();
    throw new Error(errData.error?.message || 'Failed to create Google Spreadsheet');
  }

  const data = await response.json();
  return {
    spreadsheetId: data.spreadsheetId,
    spreadsheetUrl: data.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${data.spreadsheetId}`,
    title: data.properties?.title || title
  };
}

/**
 * Appends a new cancellation record row to an existing Google Spreadsheet
 */
export async function appendCancellationRecord(
  accessToken: string,
  spreadsheetId: string,
  record: Cancellation
): Promise<void> {
  const row = [
    record.id,
    new Date(record.created_at || Date.now()).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }),
    record.category || '-',
    record.reason || '-',
    record.priority || 'กลาง',
    record.status || 'ยกเลิกสำเร็จ'
  ];

  const range = 'รายการคำขอยกเลิก!A:F';
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        values: [row]
      })
    }
  );

  if (!response.ok) {
    const errData = await response.json();
    throw new Error(errData.error?.message || 'Failed to append row to Google Spreadsheet');
  }
}

/**
 * Reads values from a Google Spreadsheet
 */
export async function readSpreadsheetValues(
  accessToken: string,
  spreadsheetId: string,
  range: string = 'A1:I100'
): Promise<string[][]> {
  try {
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    );

    if (!response.ok) {
      const errData = await response.json();
      const msg = errData.error?.message || '';
      if (msg.includes('insufficient authentication scopes') || msg.includes('insufficient permissions')) {
        throw new Error('สิทธิ์การเข้าถึง Google Sheets ไม่เพียงพอ กรุณากดปุ่ม "Sign in with Google" ใหม่และติ๊กยินยอมสิทธิ์ Google Sheets & Drive');
      }
      
      // If range error (e.g. sheet tab doesn't exist), try generic A1:Z50
      if (range.includes('!') && !range.startsWith('A1')) {
        return await readSpreadsheetValues(accessToken, spreadsheetId, 'A1:Z50');
      }

      throw new Error(msg || 'ไม่สามารถอ่านข้อมูลจาก Google Spreadsheet ได้');
    }

    const data = await response.json();
    return data.values || [];
  } catch (err: any) {
    throw err;
  }
}
