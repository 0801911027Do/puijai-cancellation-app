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
  deleteUserCancellations,
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

  // Full LINE OA Webhook Endpoint
  app.post('/api/line/webhook', async (req, res) => {
    try {
      const events = req.body?.events || [];
      const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN || '+utUzwkcIwuHsGVo53U96hyXxeGp2emZRJdsWTljU8OjqQndppvkwzhp0qZQzmPR2WX4z1cTRMyFaiR4PtgBZKxHwIzmDqmnbgbYYGYZhwqOUjE3o3xYg80i3gAuM3rt3RlrKSueVkZXx+d2q4i46AdB04t89/1O/w1cDnyilFU=';
      const liffUrl = 'https://liff.line.me/2011043750-SsHmvV2G';

      if (!Array.isArray(events) || events.length === 0) {
        return res.status(200).json({ success: true, message: 'No events' });
      }

      const cancellations = await fetchFromGoogleSheets().catch(() => getAllCancellations());

      for (const event of events) {
        const replyToken = event.replyToken;
        if (!replyToken || replyToken === '00000000000000000000000000000000') continue;

        const userId = event.source?.userId || '';
        let displayName = 'ผู้ใช้งาน';

        if (userId) {
          try {
            const profileRes = await fetch(`https://api.line.me/v2/bot/profile/${userId}`, {
              headers: { Authorization: `Bearer ${channelAccessToken}` }
            });
            if (profileRes.ok) {
              const pData = await profileRes.json() as any;
              if (pData.displayName) displayName = pData.displayName;
            }
          } catch (e) {}
        }

        const searchKeys = [userId.toLowerCase(), displayName.toLowerCase()].filter(Boolean);
        const matched = cancellations.find(c => {
          const cUser = String(c.username || '').toLowerCase();
          const cNotes = String(c.notes || '').toLowerCase();
          const cId = String(c.id || '').toLowerCase();
          return searchKeys.some(k => cUser === k || cUser.includes(k) || cNotes.includes(k) || cId === k);
        });

        const userText = event.type === 'message' && event.message?.type === 'text' ? String(event.message.text).trim() : '';
        const postbackData = event.type === 'postback' ? String(event.postback?.data || '').trim() : '';

        const isDeleteIntent = (
          postbackData === 'action=delete_all_data' ||
          postbackData === 'delete_all_data' ||
          userText === 'ลบข้อมูลแชทและข้อความแชททั้งหมด' ||
          userText.includes('ลบข้อมูลแชทและข้อความแชททั้งหมด') ||
          userText.includes('ลบข้อมูลแชททั้งหมด')
        );

        const isCheckConfirmed = (
          userText.includes('กรอกแบบประเมิน') ||
          userText.includes('กรอกแล้ว') ||
          userText.includes('ยืนยัน') ||
          postbackData === 'check_cancellation'
        );

        const isCancelIntent = (
          userText.includes('ยกเลิก') ||
          userText.toLowerCase().includes('cancel') ||
          event.type === 'follow'
        );

        let replyMessages: any[] = [];

        if (isDeleteIntent) {
          // Trigger deletion in local store and forward to GAS
          deleteUserCancellations([userId, displayName]);
          const gasWebhookUrl = process.env.GOOGLE_SHEETS_WEBHOOK_URL || 'https://script.google.com/macros/s/AKfycbzekm0u18dOk_iVIdA92e_TwcxXaudq5B4i_vK68bxA-hoHbsYpygaAi5Hc45ArFMlv/exec';
          try {
            fetch(gasWebhookUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                action: 'deleteUser',
                userId: userId || '',
                username: displayName || ''
              }),
              redirect: 'follow',
              signal: AbortSignal.timeout(6000)
            }).catch(() => {});
          } catch (e) {}

          replyMessages = [{
            type: 'flex',
            altText: '🗑️ ลบข้อมูลในระบบเรียบร้อยแล้ว',
            contents: {
              type: 'bubble',
              size: 'mega',
              header: {
                type: 'box',
                layout: 'vertical',
                backgroundColor: '#e11d48',
                paddingAll: '16px',
                contents: [
                  { type: 'text', text: '🗑️ ลบข้อมูลในระบบเรียบร้อย', weight: 'bold', color: '#ffffff', size: 'md' },
                  { type: 'text', text: 'Puijai Data Privacy & Deletion', size: 'xs', color: '#ffe4e6', margin: 'xs' }
                ]
              },
              body: {
                type: 'box',
                layout: 'vertical',
                spacing: 'md',
                contents: [
                  { type: 'text', text: `เรียนคุณ ${displayName} 🔒`, weight: 'bold', size: 'md', color: '#0f172a' },
                  { type: 'text', text: 'ระบบได้ลบประวัติคำขอยกเลิกและข้อมูลของคุณออกจากฐานข้อมูลและ Google Sheets เรียบร้อยแล้วครับ', wrap: true, size: 'sm', color: '#475569' },
                  {
                    type: 'box',
                    layout: 'vertical',
                    backgroundColor: '#fff1f2',
                    paddingAll: '12px',
                    cornerRadius: '8px',
                    borderColor: '#fecdd3',
                    borderWidth: '1px',
                    spacing: 'xs',
                    contents: [
                      { type: 'text', text: '📱 ขั้นตอนลบข้อมูลแชทบนมือถือของคุณ:', weight: 'bold', size: 'xs', color: '#be123c' },
                      { type: 'text', text: '1. แตะเมนู ☰ (มุมขวาบนของห้องแชทนี้)', size: 'xs', color: '#9f1239' },
                      { type: 'text', text: '2. เลือก "ตั้งค่าอื่นๆ" (Other Settings)', size: 'xs', color: '#9f1239' },
                      { type: 'text', text: '3. เลือก "ลบข้อมูล"', size: 'xs', color: '#9f1239' },
                      { type: 'text', text: '4. กด "ลบข้อมูลแชทและข้อความแชททั้งหมด"', size: 'xs', weight: 'bold', color: '#e11d48' }
                    ]
                  }
                ]
              },
              footer: {
                type: 'box',
                layout: 'vertical',
                spacing: 'sm',
                contents: [
                  { type: 'button', action: { type: 'uri', label: '📋 ศูนย์บริการยกเลิกปุยใจ', uri: liffUrl }, style: 'secondary', height: 'sm' }
                ]
              }
            }
          }];
        } else if (isCheckConfirmed) {
          if (matched) {
            replyMessages = [{
              type: 'flex',
              altText: '✅ บันทึกคำขอยกเลิกบริการ Puijai สำเร็จเรียบร้อย',
              contents: {
                type: 'bubble',
                size: 'mega',
                header: {
                  type: 'box',
                  layout: 'vertical',
                  backgroundColor: '#0d9488',
                  paddingAll: '16px',
                  contents: [
                    { type: 'text', text: '✅ บันทึกคำขอยกเลิกสำเร็จ', weight: 'bold', color: '#ffffff', size: 'md' },
                    { type: 'text', text: 'Puijai Cancellation Service', size: 'xs', color: '#ccfbf1', margin: 'xs' }
                  ]
                },
                body: {
                  type: 'box',
                  layout: 'vertical',
                  spacing: 'md',
                  contents: [
                    { type: 'text', text: `สวัสดีครับคุณ ${displayName} ☁️`, weight: 'bold', size: 'md', color: '#0f172a' },
                    { type: 'text', text: 'ระบบตรวจพบและบันทึกคำขอยกเลิกบริการของคุณเข้าสู่ระบบเรียบร้อยแล้วครับ โดยมีรายละเอียดดังนี้:', wrap: true, size: 'sm', color: '#475569' },
                    {
                      type: 'box',
                      layout: 'vertical',
                      margin: 'md',
                      spacing: 'sm',
                      backgroundColor: '#f8fafc',
                      paddingAll: '12px',
                      cornerRadius: '8px',
                      borderColor: '#e2e8f0',
                      borderWidth: '1px',
                      contents: [
                        { type: 'box', layout: 'baseline', contents: [{ type: 'text', text: 'รหัสคำขอ:', size: 'xs', color: '#64748b', flex: 3 }, { type: 'text', text: matched.id, size: 'xs', weight: 'bold', color: '#0d9488', flex: 5 }] },
                        { type: 'box', layout: 'baseline', contents: [{ type: 'text', text: 'วันที่ขอยกเลิก:', size: 'xs', color: '#64748b', flex: 3 }, { type: 'text', text: matched.created_at || new Date().toLocaleString('th-TH'), size: 'xs', weight: 'bold', color: '#0f172a', flex: 5 }] },
                        { type: 'box', layout: 'baseline', contents: [{ type: 'text', text: 'สถานะ:', size: 'xs', color: '#64748b', flex: 3 }, { type: 'text', text: matched.status || 'ยกเลิกสำเร็จ', size: 'xs', weight: 'bold', color: '#16a34a', flex: 5 }] }
                      ]
                    },
                    { type: 'text', text: '🌿 แชทบอท Puijai ได้ระงับการตอบกลับอัตโนมัติสำหรับบัญชีของคุณเรียบร้อยแล้ว ขอบคุณที่เคยไว้วางใจใช้บริการปุยใจเสมอมาครับ', wrap: true, size: 'xs', color: '#64748b' }
                  ]
                },
                footer: {
                  type: 'box',
                  layout: 'vertical',
                  spacing: 'sm',
                  contents: [
                    { type: 'button', action: { type: 'uri', label: 'ดูรายละเอียดคำขอ / ยื่นเรื่องใหม่', uri: liffUrl }, style: 'secondary', height: 'sm' },
                    {
                      type: 'button',
                      action: {
                        type: 'postback',
                        label: '🗑️ ลบข้อมูลแชทและข้อความทั้งหมด',
                        data: 'action=delete_all_data',
                        displayText: 'ลบข้อมูลแชทและข้อความแชททั้งหมด'
                      },
                      style: 'primary',
                      color: '#e11d48',
                      height: 'sm'
                    }
                  ]
                }
              }
            }];
          } else {
            replyMessages = [{
              type: 'flex',
              altText: '⚠️ ยังไม่พบคำขอยกเลิกในระบบ',
              contents: {
                type: 'bubble',
                size: 'mega',
                header: {
                  type: 'box',
                  layout: 'vertical',
                  backgroundColor: '#ea580c',
                  paddingAll: '16px',
                  contents: [
                    { type: 'text', text: '⚠️ ยังไม่พบคำขอยกเลิกในระบบ', weight: 'bold', color: '#ffffff', size: 'md' },
                    { type: 'text', text: 'กรุณากรอกและส่งแบบประเมินก่อนกดยืนยัน', size: 'xs', color: '#ffedd5', margin: 'xs' }
                  ]
                },
                body: {
                  type: 'box',
                  layout: 'vertical',
                  spacing: 'md',
                  contents: [
                    { type: 'text', text: `เรียนคุณ ${displayName} 🌿`, weight: 'bold', size: 'md', color: '#0f172a' },
                    { type: 'text', text: 'ระบบยังไม่พบคำขอยกเลิกที่สำเร็จภายใต้ชื่อโปรไฟล์ LINE ของคุณ กรุณาตรวจสอบชื่อและกดส่งแบบประเมินให้เรียบร้อยก่อนนะครับ', wrap: true, size: 'sm', color: '#475569' },
                    {
                      type: 'box',
                      layout: 'vertical',
                      backgroundColor: '#fff7ed',
                      paddingAll: '10px',
                      cornerRadius: '6px',
                      contents: [
                        { type: 'text', text: '💡 ขั้นตอนง่ายๆ ใน 1 นาที:', weight: 'bold', size: 'xs', color: '#c2410c' },
                        { type: 'text', text: '1. กดปุ่ม "📋 เปิดแบบประเมิน" ด้านล่าง\n2. เลือกเหตุผลและกดปุ่มสีเขียว "ยืนยันส่งคำขอยกเลิก"\n3. กลับมากดปุ่ม "✅ กรอกแบบประเมินแล้ว" อีกครั้ง', wrap: true, size: 'xs', color: '#9a3412', margin: 'xs' }
                      ]
                    }
                  ]
                },
                footer: {
                  type: 'box',
                  layout: 'vertical',
                  spacing: 'sm',
                  contents: [
                    { type: 'button', action: { type: 'uri', label: '📋 เปิดแบบประเมิน', uri: liffUrl }, style: 'primary', color: '#0d9488', height: 'sm' },
                    { type: 'button', action: { type: 'message', label: '✅ กรอกแบบประเมินแล้ว', text: 'กรอกแบบประเมินยกเลิกการใช้งานแล้ว' }, style: 'secondary', height: 'sm' }
                  ]
                }
              }
            }];
          }
        } else if (isCancelIntent) {
          replyMessages = [{
            type: 'flex',
            altText: 'ศูนย์ขอยกเลิกบริการปุยใจ ☁️',
            contents: {
              type: 'bubble',
              size: 'mega',
              header: {
                type: 'box',
                layout: 'vertical',
                backgroundColor: '#0284c7',
                paddingAll: '16px',
                contents: [
                  { type: 'text', text: 'ศูนย์ขอยกเลิกบริการปุยใจ ☁️', weight: 'bold', color: '#ffffff', size: 'md' },
                  { type: 'text', text: 'Puijai Cancellation Service', size: 'xs', color: '#e0f2fe', margin: 'xs' }
                ]
              },
              body: {
                type: 'box',
                layout: 'vertical',
                spacing: 'md',
                contents: [
                  { type: 'text', text: `สวัสดีครับคุณ ${displayName} 🌿`, weight: 'bold', size: 'md', color: '#0f172a' },
                  { type: 'text', text: 'หากคุณต้องการยื่นขอยกเลิกบริการแชทบอท Puijai และส่งประเมินข้อเสนอแนะ สามารถกดปุ่มด้านล่างเพื่อดำเนินการได้ทันทีครับ', wrap: true, size: 'sm', color: '#475569' }
                ]
              },
              footer: {
                type: 'box',
                layout: 'vertical',
                spacing: 'sm',
                contents: [
                  { type: 'button', action: { type: 'uri', label: '📋 เปิดแบบประเมิน', uri: liffUrl }, style: 'primary', color: '#0d9488', height: 'sm' },
                  { type: 'button', action: { type: 'message', label: '✅ กรอกแบบประเมินแล้ว', text: 'กรอกแบบประเมินยกเลิกการใช้งานแล้ว' }, style: 'secondary', height: 'sm' }
                ]
              }
            }
          }];
        }

        if (replyMessages.length > 0) {
          await fetch('https://api.line.me/v2/bot/message/reply', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${channelAccessToken}`
            },
            body: JSON.stringify({ replyToken, messages: replyMessages })
          });
        }
      }

      res.status(200).json({ success: true });
    } catch (err: any) {
      console.error('LINE Webhook Error:', err);
      res.status(200).json({ success: false, error: err.message });
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
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
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

      let gasNextId = '';

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
            gasNextId = gasData.nextId || '';
            console.log('GAS Authoritative ID:', finalId, 'Round:', finalRound, 'NextID:', gasNextId);
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

      const finalNotes = notes ? String(notes).trim() : (cleanUsername ? `LINE: ${cleanUsername}` : '');

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

      res.json({ success: true, data: { ...saved, round: finalRound, nextId: gasNextId } });
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

  app.post('/api/cancellations/delete-user', async (req, res) => {
    try {
      const { userId, username, id } = req.body || {};
      const searchKeys = [userId, username, id].filter(Boolean).map(s => String(s).trim());
      if (searchKeys.length === 0) {
        return res.status(400).json({ success: false, error: 'กรุณาระบุข้อมูลผู้ใช้ที่ต้องการลบ' });
      }

      // 1. Delete from local DB / memory store
      const localResult = deleteUserCancellations(searchKeys);

      // 2. Forward delete request to Google Apps Script
      const gasWebhookUrl = process.env.GOOGLE_SHEETS_WEBHOOK_URL || 'https://script.google.com/macros/s/AKfycbzekm0u18dOk_iVIdA92e_TwcxXaudq5B4i_vK68bxA-hoHbsYpygaAi5Hc45ArFMlv/exec';
      let gasDeleted = false;
      try {
        const gasRes = await fetch(gasWebhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'deleteUser',
            userId: userId || '',
            username: username || '',
            id: id || ''
          }),
          redirect: 'follow',
          signal: AbortSignal.timeout(8000)
        });
        if (gasRes.ok) {
          const gasJson = await gasRes.json();
          gasDeleted = gasJson.success;
        }
      } catch (gasErr: any) {
        console.error('GAS deleteUser notification warning:', gasErr?.message || gasErr);
      }

      res.json({
        success: true,
        message: 'ลบข้อมูลของผู้ใช้เรียบร้อยแล้ว',
        deletedCount: localResult.deletedCount,
        gasDeleted
      });
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
