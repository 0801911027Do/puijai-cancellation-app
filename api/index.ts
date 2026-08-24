import express from 'express';
import 'dotenv/config';
import {
  getAllCancellations,
  saveCancellation,
  updateCancellationStatus,
  deleteCancellation,
  resetToSampleData,
  importBatchCancellations,
  fetchFromGoogleSheets,
  getNextCancellationId,
  getUserCancellationInfo
} from '../server/db.js';
import { analyzeCancellationsWithGemini } from '../server/gemini.js';

const app = express();
app.use(express.json());

// Admin Authentication API
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  const adminPassword = process.env.ADMIN_PASSWORD || 'PuiJaiAdmin#2026';

  if (password === adminPassword) {
    res.json({ success: true, message: 'เข้าสู่ระบบสำเร็จ' });
  } else {
    res.status(401).json({ success: false, error: 'รหัสผ่านไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง' });
  }
});

// API Routes
app.get('/api/cancellations', async (req, res) => {
  try {
    const list = await fetchFromGoogleSheets();
    res.json({ success: true, data: list });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/cancellations/sync-sheets', async (req, res) => {
  try {
    const list = await fetchFromGoogleSheets();
    res.json({ success: true, data: list });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/cancellations/next-id', async (req, res) => {
  try {
    const userKey = String(req.query.username || req.query.userId || '').trim();
    const userInfo = await getUserCancellationInfo(userKey);
    res.json({
      success: true,
      nextId: userInfo.assignedId,
      isExistingUser: userInfo.isExistingUser,
      currentRound: userInfo.round,
      totalHistory: userInfo.totalHistory
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Bot Webhook Interceptor: Checks if bot should stop responding to user
app.get('/api/bot/should-reply', async (req, res) => {
  try {
    const username = String(req.query.username || req.query.userId || '').trim().toLowerCase();
    if (!username) {
      return res.json({ shouldReply: true, isCancelled: false });
    }
    const list = await fetchFromGoogleSheets().catch(() => getAllCancellations());
    const cancelledRecord = list.find(c => String(c.username).trim().toLowerCase() === username);
    
    if (cancelledRecord) {
      return res.json({
        shouldReply: false,
        isCancelled: true,
        message: 'บริการแชทบอท Puijai สำหรับบัญชีนี้ถูกยกเลิกเรียบร้อยแล้ว บอทจะไม่ตอบสนองแชทต่อ',
        cancelledAt: cancelledRecord.created_at,
        record: cancelledRecord
      });
    }

    res.json({ shouldReply: true, isCancelled: false });
  } catch (err: any) {
    res.json({ shouldReply: true, isCancelled: false });
  }
});

app.get('/api/cancellations/check', async (req, res) => {
  try {
    const username = String(req.query.username || req.query.userId || '').trim().toLowerCase();
    if (!username) {
      return res.json({ success: true, exists: false, count: 0, nextRound: 1, assignedId: 'PUI-CANCEL-00001' });
    }
    const userInfo = await getUserCancellationInfo(username);

    res.json({
      success: true,
      exists: userInfo.isExistingUser,
      count: userInfo.totalHistory,
      nextRound: userInfo.round,
      assignedId: userInfo.assignedId
    });
  } catch (err: any) {
    res.json({ success: false, exists: false, count: 0, nextRound: 1, assignedId: 'PUI-CANCEL-00001' });
  }
});

app.post('/api/cancellations', async (req, res) => {
  try {
    const { id, username, reason, category, priority, email, phone, rating, round, notes } = req.body;

    if (!reason) {
      return res.status(400).json({ success: false, error: 'กรุณากรอกเหตุผลการยกเลิก' });
    }

    const assignedUsername = username && String(username).trim() && String(username).trim() !== 'PUI-CANCEL-00001'
      ? String(username).trim()
      : '';

    // Lock reference ID and calculate round for this specific LINE user
    const userInfo = await getUserCancellationInfo(assignedUsername);
    const finalId = (userInfo.isExistingUser && userInfo.assignedId)
      ? userInfo.assignedId
      : (id && String(id).startsWith('PUI-CANCEL-') ? String(id).trim() : userInfo.assignedId);
      
    const finalRound = round && Number(round) > 0 ? Number(round) : userInfo.round;
    const roundText = `รอบที่ ${finalRound}`;
    const finalNotes = notes ? `${notes} (${roundText})` : roundText;

    const saved = saveCancellation({
      id: finalId,
      username: assignedUsername || finalId,
      reason: String(reason).trim(),
      category: category || 'อื่นๆ',
      priority: priority || 'กลาง',
      email: email ? String(email).trim() : undefined,
      phone: phone ? String(phone).trim() : undefined,
      rating: rating ? Number(rating) : 3,
      notes: finalNotes,
    });

    // Auto-push directly to Google Apps Script Webhook
    try {
      const gasWebhookUrl = process.env.GOOGLE_SHEETS_WEBHOOK_URL || 'https://script.google.com/macros/s/AKfycbzekm0u18dOk_iVIdA92e_TwcxXaudq5B4i_vK68bxA-hoHbsYpygaAi5Hc45ArFMlv/exec';
      const gasRes = await fetch(gasWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...saved,
          round: finalRound,
          username: assignedUsername || finalId
        }),
        redirect: 'follow',
        signal: AbortSignal.timeout(8000),
      });
      const gasText = await gasRes.text();
      console.log('Google Sheets Webhook Sync Success:', gasRes.status, gasText);
    } catch (pushErr: any) {
      console.error('Webhook push warning (continuing to respond):', pushErr?.message || pushErr);
    }

    res.json({ success: true, data: { ...saved, round: finalRound } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

const handleUpdateStatus = (req: express.Request, res: express.Response) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;
    const updated = updateCancellationStatus(id, status, notes);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'ไม่พบรายการที่ต้องการแก้ไข' });
    }
    res.json({ success: true, data: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
};

app.put('/api/cancellations/:id', handleUpdateStatus);
app.patch('/api/cancellations/:id/status', handleUpdateStatus);

app.delete('/api/cancellations/:id', (req, res) => {
  try {
    const { id } = req.params;
    const deleted = deleteCancellation(id);
    if (!deleted) {
      return res.status(404).json({ success: false, error: 'ไม่พบรายการ' });
    }
    res.json({ success: true, data: deleted });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

const handleReset = (req: express.Request, res: express.Response) => {
  try {
    const list = resetToSampleData();
    res.json({ success: true, data: list });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
};

app.post('/api/cancellations/reset', handleReset);
app.post('/api/cancellations/reset-samples', handleReset);

const handleImport = (req: express.Request, res: express.Response) => {
  try {
    const records = Array.isArray(req.body) ? req.body : req.body?.records;
    if (!Array.isArray(records)) {
      return res.status(400).json({ success: false, error: 'รูปแบบข้อมูลไม่ถูกต้อง' });
    }
    const imported = importBatchCancellations(records);
    res.json({ success: true, data: imported });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
};

app.post('/api/cancellations/import', handleImport);
app.post('/api/cancellations/batch-import', handleImport);

const handleAnalyze = async (req: express.Request, res: express.Response) => {
  try {
    const cancellations = await fetchFromGoogleSheets();
    const result = await analyzeCancellationsWithGemini(cancellations);
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'เกิดข้อผิดพลาดในการวิเคราะห์ด้วย AI' });
  }
};

app.post('/api/analyze', handleAnalyze);
app.post('/api/analyze-gemini', handleAnalyze);

// Export CSV for Google Sheets
app.get('/api/export/csv', (req, res) => {
  try {
    const list = getAllCancellations();
    const headers = ['รหัสคำขอ', 'วันที่/เวลา', 'หมวดหมู่เหตุผล', 'รายละเอียดเหตุผล', 'ระดับความสำคัญ', 'คะแนนบริการ', 'สถานะ', 'หมายเหตุ'];
    
    const rows = list.map(item => [
      `"${item.id}"`,
      `"${new Date(item.created_at).toLocaleString('th-TH')}"`,
      `"${item.category.replace(/"/g, '""')}"`,
      `"${item.reason.replace(/"/g, '""')}"`,
      `"${item.priority}"`,
      `"${item.rating || 3}"`,
      `"${item.status}"`,
      `"${(item.notes || '-').replace(/"/g, '""')}"`
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="puijai_cancellations.csv"');
    res.send(csvContent);
  } catch (err: any) {
    res.status(500).send('Error generating CSV');
  }
});

export default app;
