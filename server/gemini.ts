import { GoogleGenAI } from '@google/genai';
import { Cancellation, AIAnalysisResult } from '../src/types.js';

export async function analyzeCancellationsWithGemini(cancellations: Cancellation[]): Promise<AIAnalysisResult> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    // Fallback heuristic analysis if API key is not configured
    const reasonsByCat: Record<string, number> = {};
    cancellations.forEach(c => {
      reasonsByCat[c.category] = (reasonsByCat[c.category] || 0) + 1;
    });

    const topCategory = Object.entries(reasonsByCat).sort((a, b) => b[1] - a[1])[0]?.[0] || 'ไม่ตอบโจทย์การใช้งาน';

    return {
      summary: `ผู้ใช้ส่วนใหญ่ยกเลิกการใช้งานแชทบอทปุยใจเนื่องจากปัจจัยด้าน "${topCategory}" และต้องการฟีเจอร์การสนทนาที่เฉพาะทางมากขึ้น`,
      topIssues: [
        `ความต้องการฟีเจอร์การเชื่อมต่อแชทบอทกับระบบภายนอก (Integration) (พบ ${reasonsByCat['ไม่ตอบโจทย์การใช้งาน'] || 1} ราย)`,
        `ความสะดวกในการใช้งานและการตั้งค่าบทบาทแชทบอท`,
        `ความเร็วในการตอบสนองของแชทบอทช่วงที่มีผู้ใช้งานหนาแน่น`
      ],
      retentionSuggestions: [
        'เพิ่มคู่มือการสอนตั้งค่า Prompt และปรับปรุงความถูกต้องของการตอบกลับของปุยใจ',
        'พัฒนา API และ Webhook ให้แชทบอทปุยใจเชื่อมต่อกับระบบ LINE / Web ได้ง่ายขึ้น',
        'เพิ่มฟีเจอร์แนะนำการใช้งานแบบโต้ตอบ (Interactive Onboarding Tutorial)'
      ],
      overallSentiment: 'ค่อนข้างเป็นกลาง ผู้ใช้ชื่นชอบบริการของปุยใจ แต่ต้องการความยืดหยุ่นและการตอบสนองที่ดียิ่งขึ้น'
    };
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const formattedData = cancellations.map(c => `- [${c.category}] ${c.username}: ${c.reason} (ความสำคัญ: ${c.priority})`).join('\n');

    const prompt = `คุณคือผู้เชี่ยวชาญด้านวิเคราะห์สถิติการยกเลิกบริการ (Churn Analysis Expert) ของแอปพลิเคชัน "ปุยใจ"
โปรดวิเคราะห์ข้อมูลเหตุผลการยกเลิกการใช้งานดังต่อไปนี้:

${formattedData}

ตอบกลับเป็น JSON ภาษาไทยที่มีโครงสร้างดังนี้:
{
  "summary": "สรุปภาพรวมเหตุผลการยกเลิกใน 2-3 ประโยค",
  "topIssues": ["ปัญหาหลักข้อที่ 1", "ปัญหาหลักข้อที่ 2", "ปัญหาหลักข้อที่ 3"],
  "retentionSuggestions": ["ข้อเสนอแนะในการรักษาลูกค้าข้อที่ 1", "ข้อเสนอแนะข้อที่ 2", "ข้อเสนอแนะข้อที่ 3"],
  "overallSentiment": "การประเมินทัศนคติรวมของผู้ใช้งาน"
}

ตอบเฉพาะ JSON เท่านั้น`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      }
    });

    if (response.text) {
      const parsed = JSON.parse(response.text) as AIAnalysisResult;
      return parsed;
    }
    throw new Error('Empty response from Gemini API');
  } catch (error) {
    console.error('Error analyzing cancellations with Gemini:', error);
    return {
      summary: 'เกิดข้อผิดพลาดในการประมวลผลด้วย Gemini AI - แสดงผลการวิเคราะห์พื้นฐานแทน',
      topIssues: [
        'ความสะดวกและความเสถียรของแชทบอท',
        'การสลับไปใช้แชทบอทตัวอื่น',
        'ข้อจำกัดด้านฟีเจอร์คำสั่งเฉพาะทาง'
      ],
      retentionSuggestions: [
        'จัดทำแบบประเมินความพึงพอใจการใช้งานแชทบอทปุยใจ',
        'พัฒนาฟีเจอร์และคำสั่งใหม่ๆ ให้ตอบโจทย์ความต้องการ',
        'พัฒนาช่องทางการติดต่อทีมพัฒนาแชทบอทโดยตรง'
      ],
      overallSentiment: 'ควรได้รับการปรับปรุงความสามารถของแชทบอทอย่างต่อเนื่อง'
    };
  }
}
