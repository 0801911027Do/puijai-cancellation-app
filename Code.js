/**
 * ============================================================================
 * Google Apps Script สำหรับระบบยกเลิกการใช้งานปุยใจ (Puijai Cancellation App)
 * ============================================================================
 * 
 * วิธีการติดตั้ง/อัปเดต:
 * 1. เปิด Google Sheet ของคุณ (https://docs.google.com/spreadsheets/d/1gKkHEsunANN_5OAzVigbFxE5XFf7VRLlYiQA6RgOCIY)
 * 2. ไปที่เมนู "ส่วนขยาย" (Extensions) > "Apps Script"
 * 3. ลบโค้ดเดิมทั้งหมด แล้วคัดลอกโค้ดนี้ไปวางแทนที่
 * 4. กดปุ่ม "ทำให้ใช้งานได้" (Deploy) > "การจัดการการทำให้ใช้งานได้" (Manage deployments)
 * 5. กดไอคอนดินสอแก้ไข (Edit) > เลือกเวอร์ชัน "เวอร์ชันใหม่" (New version) > กด "ทำให้ใช้งานได้" (Deploy)
 */

var SPREADSHEET_ID = '1gKkHEsunANN_5OAzVigbFxE5XFf7VRLlYiQA6RgOCIY';
var SHEET_NAME = 'รายการคำขอยกเลิก';
var TARGET_SHEET_GID = 1550119891; // แผ่นงาน GID 1550119891 ที่ระบุโดยตรง

/**
 * ฟังก์ชันค้นหาชีตข้อมูลที่ถูกต้องอัตโนมัติ
 * 1. ค้นหาจาก GID 1550119891 โดยตรงเป็นลำดับแรก
 * 2. ค้นหาจากชื่อ 'รายการคำขอยกเลิก'
 * 3. ค้นหาแผ่นงานที่มีข้อมูลมากที่สุด
 */
function getPuijaiSheet(ss) {
  if (!ss) {
    ss = SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.openById(SPREADSHEET_ID);
  }
  
  var sheets = ss.getSheets();

  // 1. ค้นหาแผ่นงานตาม GID: 1550119891 โดยตรง
  for (var g = 0; g < sheets.length; g++) {
    if (sheets[g].getSheetId() === TARGET_SHEET_GID) {
      return sheets[g];
    }
  }

  // 2. ค้นหาแผ่นงานตามชื่อ
  var target = ss.getSheetByName(SHEET_NAME);
  if (target) return target;

  // 3. ค้นหาแผ่นงานที่มีแถวข้อมูลมากที่สุด
  var bestSheet = null;
  var maxRows = 0;
  for (var s = 0; s < sheets.length; s++) {
    var cur = sheets[s];
    var lastR = cur.getLastRow();
    if (lastR > maxRows) {
      maxRows = lastR;
      bestSheet = cur;
    }
  }

  return bestSheet || (sheets.length > 0 ? sheets[0] : ss.insertSheet(SHEET_NAME));
}

/**
 * ฟังก์ชันจัดรูปแบบวันที่ให้เป็นไทยอ่านง่าย
 */
function formatCellDate(val) {
  if (!val) return '';
  if (val instanceof Date) {
    try {
      return Utilities.formatDate(val, "Asia/Bangkok", "d/M/yyyy HH:mm:ss");
    } catch (e) {
      return val.toLocaleString('th-TH');
    }
  }
  return String(val);
}

/**
 * 1. ฟังก์ชันรับข้อมูล POST (บันทึกข้อมูลคำขอยกเลิกใหม่ลง Google Sheet)
 */
function doPost(e) {
  // ใช้ LockService ป้องกันคำขอซ้อนพร้อมกันในเวลาเดียวกัน (Concurrency & Race condition protection)
  var lock = LockService.getScriptLock();
  var hasLock = lock.tryLock(15000);
  if (!hasLock) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: 'ระบบกำลังประมวลผลคำขอก่อนหน้า กรุณาลองใหม่อีกครั้ง'
    })).setMimeType(ContentService.MimeType.JSON);
  }

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = getPuijaiSheet(ss);
    
    // ถ้ายังไม่มีแถว Header ให้สร้างหัวตารางอัตโนมัติ
    if (sheet.getLastRow() === 0) {
      setupSheetHeaders(sheet);
    }
    
    var data = null;
    if (e && e.postData && e.postData.contents) {
      try {
        data = JSON.parse(e.postData.contents);
      } catch (parseErr) {
        data = e.parameter || null;
      }
    } else if (e && e.parameter && Object.keys(e.parameter).length > 0) {
      data = e.parameter;
    }
    
    // ตรวจสอบว่าเป็น LINE Webhook Event หรือไม่
    if (data && data.events && data.events.length > 0) {
      var event = data.events[0];
      if (event.replyToken) {
        replyLineLiffButton(event.replyToken);
        return ContentService.createTextOutput(JSON.stringify({ success: true, message: 'LINE Webhook Replied' }))
          .setMimeType(ContentService.MimeType.JSON);
      }
    }

    // ตรวจสอบว่ามีข้อมูลจริงส่งมาหรือไม่
    if (!data || Object.keys(data).length === 0) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        error: 'ไม่พบข้อมูลที่ส่งมาจากแบบฟอร์ม (No data provided)'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // อ่านข้อมูลทั้งหมดในชีต
    var allRows = sheet.getDataRange().getValues();
    var maxSeqNum = 0;
    var userExistingId = null;
    var userHistoryCount = 0;
    
    var incomingReason = String(data.reason || '').trim();
    var incomingCategory = String(data.category || '').trim();
    
    // 1. ตรวจสอบป้องกันการกดส่งซ้ำหรือคำขอซ้อนกันในเสี้ยววินาที (Deduplication Check)
    if (allRows.length > 1) {
      var lastRow = allRows[allRows.length - 1];
      var lastId = String(lastRow[0] || '').trim();
      var lastCategory = String(lastRow[2] || '').trim();
      var lastReason = String(lastRow[3] || '').trim();
      
      // ถ้าข้อมูลแถวล่าสุดที่เพิ่งบันทึกไปตรงกับที่ส่งเข้ามา ให้ตอบกลับสำเร็จทันที ไม่เพิ่มแถวเบิ้ลซ้ำ!
      if (incomingReason && lastReason === incomingReason && lastCategory === incomingCategory) {
        return ContentService.createTextOutput(JSON.stringify({
          success: true,
          message: 'ข้อมูลนี้ถูกบันทึกไปแล้ว (Prevented duplicate row)',
          id: lastId,
          isDuplicatePrevented: true
        })).setMimeType(ContentService.MimeType.JSON);
      }
    }
    
    // ดึงข้อมูลระบุตัวตนของผู้ใช้ LINE (userId จาก LIFF หรือ client key)
    var incomingUserId = (data.userId || '').toString().trim();
    var incomingUsername = (data.username || '').toString().trim();
    var userKey = incomingUserId || (incomingUsername && !incomingUsername.startsWith('PUI-CANCEL-') ? incomingUsername : '');
    if (!userKey && data.id && String(data.id).startsWith('PUI-CANCEL-')) {
      userKey = String(data.id).trim();
    }

    for (var r = 1; r < allRows.length; r++) {
      var cellId = String(allRows[r][0] || '').trim();
      var cellNotes = String(allRows[r][7] || '').trim();
      
      // หาค่าลำดับสูงสุดในตาราง (00001, 00002, 00003...)
      if (cellId) {
        var match = cellId.match(/PUI-CANCEL-(\d+)/i);
        if (match) {
          var num = parseInt(match[1], 10);
          if (!isNaN(num) && num > maxSeqNum && num < 90000) {
            maxSeqNum = num;
          }
        }
      }

      // ตรวจสอบว่าผู้ใช้ LINE คนนี้เคยมีประวัติอยู่ในตารางแล้วหรือไม่
      if (userKey) {
        if (cellNotes.indexOf(userKey) !== -1 || cellId === userKey) {
          userHistoryCount++;
          if (!userExistingId && cellId) {
            userExistingId = cellId; // ล็อกรหัสเดิมของผู้ใช้ LINE คนนี้!
          }
        }
      }
    }

    var finalId = '';
    var finalRound = 1;

    if (userExistingId) {
      // 1. ผู้ใช้ LINE คนเดิม -> ล็อกรหัสเดิม (PUI-CANCEL-XXXXX) และเพิ่มรอบเป็น รอบที่ 2, รอบที่ 3...
      finalId = userExistingId;
      finalRound = userHistoryCount + 1;
    } else {
      // 2. ผู้ใช้ LINE คนใหม่ -> รันรหัสถัดไปอัตโนมัติ (เริ่มจาก PUI-CANCEL-00001, 00002, 00003...)
      var nextNum = Math.max(maxSeqNum + 1, 1);
      finalId = 'PUI-CANCEL-' + ('00000' + nextNum).slice(-5);
      finalRound = 1;
    }
    
    var createdAt = data.created_at ? formatCellDate(new Date(data.created_at)) : formatCellDate(new Date());
    var category = data.category || 'อื่นๆ';
    var reason = data.reason || '-';
    var priority = data.priority || 'กลาง';
    var rating = data.rating || 3;
    var status = data.status || 'ยกเลิกสำเร็จ';
    
    // บันทึกหมายเหตุ: แสดง "รอบที่ X" พร้อมจดจำ LINE UID ไว้ในระบบเพื่ออ้างอิงรอบถัดไป
    var roundLabel = 'รอบที่ ' + finalRound;
    var finalNotes = userKey ? (roundLabel + ' [UID:' + userKey + ']') : roundLabel;
    
    // บันทึกแถวใหม่ลงในตาราง Google Sheet (1 แถวต่อ 1 คำขอเท่านั้น)
    sheet.appendRow([
      finalId,
      createdAt,
      category,
      reason,
      priority,
      rating,
      status,
      finalNotes
    ]);
    
    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      message: 'บันทึกข้อมูลลงใน Google Sheet เรียบร้อยแล้ว',
      id: finalId,
      round: finalRound
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

/**
 * 2. ฟังก์ชันดึงข้อมูล GET (ส่งคืนข้อมูลทั้งหมดในรูปแบบ JSON)
 */
function doGet(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = getPuijaiSheet(ss);
    var data = sheet.getDataRange().getValues();
    
    // 1. Endpoint คำนวณรหัสและรอบของผู้ใช้ LINE (nextId / checkUser)
    if (e && e.parameter && (e.parameter.action === 'nextId' || e.parameter.action === 'checkUser')) {
      var checkUser = String(e.parameter.userId || e.parameter.username || '').trim();
      var foundUserId = null;
      var foundCount = 0;
      var maxSeq = 0;

      for (var r = 1; r < data.length; r++) {
        var cellId = String(data[r][0] || '').trim();
        var cellNotes = String(data[r][7] || '').trim();

        var match = cellId.match(/PUI-CANCEL-(\d+)/i);
        if (match) {
          var num = parseInt(match[1], 10);
          if (!isNaN(num) && num > maxSeq && num < 90000) {
            maxSeq = num;
          }
        }

        if (checkUser && checkUser !== 'PUI-CANCEL-00001') {
          if (cellNotes.indexOf(checkUser) !== -1 || cellId === checkUser) {
            foundCount++;
            if (!foundUserId && cellId) {
              foundUserId = cellId;
            }
          }
        }
      }

      if (foundUserId) {
        return ContentService.createTextOutput(JSON.stringify({
          success: true,
          nextId: foundUserId,
          isExistingUser: true,
          currentRound: foundCount + 1,
          totalHistory: foundCount
        })).setMimeType(ContentService.MimeType.JSON);
      }

      var nextNumber = Math.max(maxSeq + 1, 1);
      var nextId = 'PUI-CANCEL-' + ('00000' + nextNumber).slice(-5);
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        nextId: nextId,
        isExistingUser: false,
        currentRound: 1,
        totalHistory: 0,
        maxSeq: maxSeq
      })).setMimeType(ContentService.MimeType.JSON);
    }

    var result = [];
    
    // เริ่มอ่านจากแถวที่ 2 (เว้นแถว Header)
    if (data.length > 1) {
      for (var i = 1; i < data.length; i++) {
        var row = data[i];
        if (!row[0] && !row[1] && !row[2]) continue; // ข้ามแถวว่าง
        
        var rowNotes = String(row[7] || '');
        var cleanNotes = rowNotes.split(' [UID:')[0].trim();
        var parsedUser = '';
        if (rowNotes.indexOf('LINE: ') !== -1) {
          parsedUser = rowNotes.split('LINE: ')[1].trim();
        } else if (rowNotes.indexOf('ผู้ใช้: ') !== -1) {
          parsedUser = rowNotes.split('ผู้ใช้: ')[1].trim();
        } else {
          parsedUser = String(row[0] || '');
        }

        result.push({
          id: String(row[0] || ''),
          created_at: formatCellDate(row[1]),
          category: String(row[2] || 'อื่นๆ'),
          reason: String(row[3] || '-'),
          priority: String(row[4] || 'กลาง'),
          rating: Number(row[5]) || 3,
          status: String(row[6] || 'ยกเลิกสำเร็จ'),
          notes: cleanNotes || rowNotes,
          username: parsedUser
        });
      }
    }
    
    // ตรวจสอบสถานะสำหรับการปิดกั้นแชทบอทตอบคำถาม
    if (e && e.parameter && e.parameter.action === 'checkBotReply') {
      var checkId = (e.parameter.username || e.parameter.userId || e.parameter.id || '').toString().trim().toLowerCase();
      var isCancelled = false;
      var foundRecord = null;
      for (var k = 0; k < result.length; k++) {
        if (String(result[k].id).trim().toLowerCase() === checkId || String(result[k].username || '').trim().toLowerCase() === checkId) {
          isCancelled = true;
          foundRecord = result[k];
          break;
        }
      }
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        shouldReply: !isCancelled,
        isCancelled: isCancelled,
        message: isCancelled ? 'บริการแชทบอท Puijai สำหรับคำขอนี้ถูกยกเลิกแล้ว แชทบอทจะไม่ตอบสนองต่อ' : 'บัญชีพร้อมใช้งานปกติ',
        record: foundRecord
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      sheetName: sheet.getName(),
      count: result.length,
      data: result
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * 3. ฟังก์ชันสร้าง Header ของตารางและจัดสไตล์
 */
function setupSheetHeaders(sheet) {
  if (!sheet) {
    var ss = SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.openById(SPREADSHEET_ID);
    sheet = ss.getSheetByName(SHEET_NAME) || ss.getActiveSheet();
  }
  
  var headers = [
    'รหัสคำขอ',
    'วันที่/เวลา',
    'หมวดหมู่เหตุผล',
    'รายละเอียดเหตุผล',
    'ความสำคัญ',
    'คะแนน',
    'สถานะ',
    'หมายเหตุ'
  ];
  
  var headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setValues([headers]);
  headerRange.setFontWeight('bold');
  headerRange.setBackground('#0d9488'); // สีเขียว Teal
  headerRange.setFontColor('#ffffff'); // ตัวอักษรสีขาว
  sheet.setFrozenRows(1); // ล็อกแถวแรก
}

/**
 * 4. ฟังก์ชันส่งตอบกลับ Flex Message การเปิดแบบฟอร์ม LIFF ไปยัง LINE OA แชทอัตโนมัติ
 */
function replyLineLiffButton(replyToken) {
  var liffUrl = 'https://liff.line.me/2011043750-SsHmvV2G';
  var CHANNEL_ACCESS_TOKEN = 'YOUR_LINE_CHANNEL_ACCESS_TOKEN';
  
  var payload = {
    replyToken: replyToken,
    messages: [{
      type: 'flex',
      altText: 'แบบฟอร์มขอยกเลิกการใช้งานแชทบอท Puijai',
      contents: {
        type: 'bubble',
        header: {
          type: 'box',
          layout: 'vertical',
          contents: [{
            type: 'text',
            text: 'Puijai Cancellation Service',
            weight: 'bold',
            color: '#ffffff',
            size: 'md'
          }],
          backgroundColor: '#0284c7'
        },
        body: {
          type: 'box',
          layout: 'vertical',
          spacing: 'md',
          contents: [
            {
              type: 'text',
              text: 'ศูนย์ขอยกเลิกการใช้งานแชทบอท',
              weight: 'bold',
              size: 'lg',
              color: '#0f172a'
            },
            {
              type: 'text',
              text: 'หากคุณต้องการยื่นขอยกเลิกบริการแชทบอท Puijai และส่งประเมินข้อเสนอแนะ สามารถกดปุ่มด้านล่างเพื่อดำเนินการได้ทันทีครับ',
              wrap: true,
              size: 'sm',
              color: '#475569'
            }
          ]
        },
        footer: {
          type: 'box',
          layout: 'vertical',
          contents: [{
            type: 'button',
            action: {
              type: 'uri',
              label: 'เปิดแบบฟอร์มขอยกเลิก',
              uri: liffUrl
            },
            style: 'primary',
            color: '#0d9488'
          }]
        }
      }
    }]
  };

  try {
    UrlFetchApp.fetch('https://api.line.me/v2/bot/message/reply', {
      method: 'post',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + CHANNEL_ACCESS_TOKEN
      },
      payload: JSON.stringify(payload)
    });
  } catch (e) {
    Logger.log('LINE Reply Error: ' + e);
  }
}

/**
 * 5. ฟังก์ชันช่วยปรับแก้รอบใน Google Sheet ทั้งหมดอัตโนมัติ
 * - แถวไหนที่รหัสอ้างอิงเดียวกัน (เช่น PUI-CANCEL-00001 แถวที่ 2) จะเปลี่ยนเป็น "รอบที่ 2", แถวที่ 3 เป็น "รอบที่ 3"
 * วิธีใช้: ในหน้า Apps Script ให้เลือกฟังก์ชัน 'fixSheetRounds' ด้านบน แล้วกดปุ่ม "เรียกใช้ (Run)"
 */
function fixSheetRounds() {
  var ss = SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = getPuijaiSheet(ss);
  var data = sheet.getDataRange().getValues();
  
  if (data.length <= 1) {
    Logger.log('ไม่มีข้อมูลแถวในตาราง');
    return;
  }

  var idCountMap = {};
  var updatedCount = 0;
  
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var rowId = String(row[0] || '').trim();
    if (!rowId) continue;
    
    // นับจำนวนครั้งที่พบรหัสอ้างอิงนี้
    if (!idCountMap[rowId.toUpperCase()]) {
      idCountMap[rowId.toUpperCase()] = 1;
    } else {
      idCountMap[rowId.toUpperCase()]++;
    }
    
    var currentRound = idCountMap[rowId.toUpperCase()];
    var updatedNote = 'รอบที่ ' + currentRound;
    
    var oldNote = String(row[7] || '').trim();
    if (oldNote.indexOf('[UID:') !== -1) {
      var uidPart = oldNote.split('[UID:')[1];
      updatedNote += ' [UID:' + uidPart;
    }
    
    // บันทึกค่ารอบใหม่ลงในคอลัมน์ H (แถวที่ i + 1, คอลัมน์ที่ 8)
    sheet.getRange(i + 1, 8).setValue(updatedNote);
    updatedCount++;
  }
  
  Logger.log('อัปเดตหมายเหตุรอบตามรหัสอ้างอิงสำเร็จแล้ว ' + updatedCount + ' แถว');
}