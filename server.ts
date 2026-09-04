import 'dotenv/config';
import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { z } from 'zod';
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
} from './server/db.js';
import { analyzeCancellationsWithGemini } from './server/gemini.js';

const CancellationItemSchema = z.object({
  id: z.string(),
  created_at: z.string(),
  username: z.string().min(1),
  email: z.string().optional(),
  phone: z.string().optional(),
  category: z.string(),
  reason: z.string().min(1),
  priority: z.enum(['สูง', 'กลาง', 'ต่ำ']),
  rating: z.number().optional().default(3),
  status: z.enum(['ยกเลิกสำเร็จ', 'ติดต่อดูแลแล้ว', 'รอดำเนินการ']),
  notes: z.string().optional()
});

const ImportBatchSchema = z.array(CancellationItemSchema);

async function startServer() {
  const app = express();
  const PORT = 3000;

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

  app.get('/api/cancellations/next-id', async (req, res) => {
    try {
      const userId = String(req.query.userId || '').trim();
      const username = String(req.query.username || '').trim();
      const userInfo = await getUserCancellationInfo(userId, username);
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

  app.post('/api/cancellations', async (req, res) => {
    try {
      const { id, userId, username, reason, category, priority, email, phone, rating, round, notes } = req.body;

      if (!reason) {
        return res.status(400).json({ success: false, error: 'กรุณากรอกเหตุผลการยกเลิก' });
      }

      const cleanUserId = String(userId || '').trim();
      const cleanUsername = String(username || '').trim() || cleanUserId;
      let finalId = id && String(id).startsWith('PUI-CANCEL-') ? String(id).trim() : '';
      let finalRound = round && Number(round) > 0 ? Number(round) : 1;

      // 1. POST to GAS first — GAS is the Single Source of Truth for ID + round
      const gasWebhookUrl = process.env.GOOGLE_SHEETS_WEBHOOK_URL || 'https://script.google.com/macros/s/AKfycbzekm0u18dOk_iVIdA92e_TwcxXaudq5B4i_vK68bxA-hoHbsYpygaAi5Hc45ArFMlv/exec';
      try {
        const gasRes = await fetch(gasWebhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: cleanUserId,
            username: cleanUsername,
            reason: String(reason).trim(),
            category: category || 'อื่นๆ',
            priority: priority || 'กลาง',
            rating: rating ? Number(rating) : 3,
            round: finalRound,
            created_at: new Date().toISOString(),
          }),
          redirect: 'follow',
          signal: AbortSignal.timeout(8000),
        });
        if (gasRes.ok) {
          const gasData = await gasRes.json();
          if (gasData.success && gasData.id) {
            finalId = gasData.id;
            finalRound = gasData.round || finalRound;
            console.log('GAS Authoritative ID:', finalId, 'Round:', finalRound);
          }
        }
      } catch (err: any) {
        console.error('GAS Webhook push warning:', err?.message || err);
      }

      // 2. Fallback: compute locally if GAS didn't return an ID
      if (!finalId) {
        const userInfo = await getUserCancellationInfo(cleanUserId, cleanUsername);
        finalId = userInfo.assignedId;
        finalRound = userInfo.round;
      }
        
      const roundText = `รอบที่ ${finalRound}`;
      const finalNotes = notes
        ? (notes.includes('รอบที่') ? roundText : `${notes} (${roundText})`)
        : roundText;

      // 3. Save to local store as backup
      const saved = saveCancellation({
        id: finalId,
        username: cleanUsername || finalId,
        reason: String(reason).trim(),
        category: category || 'อื่นๆ',
        priority: priority || 'กลาง',
        email: email ? String(email).trim() : undefined,
        phone: phone ? String(phone).trim() : undefined,
        rating: rating ? Number(rating) : 3,
        notes: finalNotes,
      });

      res.json({ success: true, data: { ...saved, round: finalRound } });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.put('/api/cancellations/:id', (req, res) => {
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
  });

  app.delete('/api/cancellations/:id', (req, res) => {
    try {
      const { id } = req.params;
      const success = deleteCancellation(id);
      res.json({ success });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/cancellations/reset', (req, res) => {
    try {
      const reset = resetToSampleData();
      res.json({ success: true, data: reset });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/cancellations/import', (req, res) => {
    try {
      const parsed = ImportBatchSchema.parse(req.body);
      const imported = importBatchCancellations(parsed);
      res.json({ success: true, data: imported });
    } catch (err: any) {
      res.status(400).json({ success: false, error: 'ข้อมูลที่ส่งมาไม่ถูกต้องตาม Zod Schema: ' + err.message });
    }
  });

  app.post('/api/analyze', async (req, res) => {
    try {
      const list = getAllCancellations();
      const analysis = await analyzeCancellationsWithGemini(list);
      res.json({ success: true, data: analysis });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

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

  // Vite development middleware or static production serving
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
