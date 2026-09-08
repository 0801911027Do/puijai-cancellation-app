var SPREADSHEET_ID = "1gKkHEsunANN_5OAzVigbFxE5XFf7VRLlYiQA6RgOCIY";
var SHEET_NAME = "รายการคำขอยกเลิก";
var TARGET_SHEET_GID = 1550119891;

var LINE_CHANNEL_ACCESS_TOKEN =
  "+utUzwkcIwuHsGVo53U96hyXxeGp2emZRJdsWTljU8OjqQndppvkwzhp0qZQzmPR2WX4z1cTRMyFaiR4PtgBZKxHwIzmDqmnbgbYYGYZhwqOUjE3o3xYg80i3gAuM3rt3RlrKSueVkZXx+d2q4i46AdB04t89/1O/w1cDnyilFU=";
var LINE_CHANNEL_SECRET = "ecfa78211764f52532229da7d432da62";
var LIFF_URL = "https://liff.line.me/2011043750-SsHmvV2G";

function getPuijaiSheet(ss) {
  if (!ss) {
    ss =
      SpreadsheetApp.getActiveSpreadsheet() ||
      SpreadsheetApp.openById(SPREADSHEET_ID);
  }

  var sheets = ss.getSheets();
  for (var g = 0; g < sheets.length; g++) {
    if (sheets[g].getSheetId() === TARGET_SHEET_GID) {
      return sheets[g];
    }
  }

  var target = ss.getSheetByName(SHEET_NAME);
  if (target) return target;

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

  return (
    bestSheet || (sheets.length > 0 ? sheets[0] : ss.insertSheet(SHEET_NAME))
  );
}

/**
 * แปลงวันที่ให้อยู่ในรูปแบบอ่านง่ายของไทย
 */
function formatCellDate(val) {
  if (!val) return "";
  if (val instanceof Date) {
    try {
      return Utilities.formatDate(val, "Asia/Bangkok", "d/M/yyyy HH:mm:ss");
    } catch (e) {
      return val.toLocaleString("th-TH");
    }
  }
  return String(val);
}

/**
 * 1. ฟังก์ชันรับข้อมูล POST จาก LIFF หรือ LINE Webhook
 */
function doPost(e) {
  var lock = LockService.getScriptLock();
  var hasLock = lock.tryLock(15000);
  if (!hasLock) {
    return ContentService.createTextOutput(
      JSON.stringify({
        success: false,
        error: "ระบบกำลังประมวลผลคำขอก่อนหน้า กรุณาลองใหม่อีกครั้ง",
      }),
    ).setMimeType(ContentService.MimeType.JSON);
  }

  try {
    var ss =
      SpreadsheetApp.getActiveSpreadsheet() ||
      SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = getPuijaiSheet(ss);

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
    if (
      data &&
      data.events &&
      Array.isArray(data.events) &&
      data.events.length > 0
    ) {
      handleLineWebhookEvents(data.events, sheet);
      return ContentService.createTextOutput(
        JSON.stringify({ success: true, message: "LINE Webhook Processed" }),
      ).setMimeType(ContentService.MimeType.JSON);
    }

    // ตรวจสอบว่าเป็นคำสั่งลบข้อมูลของผู้ใช้หรือไม่ (action: 'deleteUser')
    if (data && data.action === "deleteUser") {
      var deletedRowsCount = deleteUserRows(sheet, data.userId, data.username, data.id);
      return ContentService.createTextOutput(
        JSON.stringify({
          success: true,
          message: "ลบข้อมูลของผู้ใช้ใน Google Sheets เรียบร้อยแล้ว",
          deletedCount: deletedRowsCount,
        }),
      ).setMimeType(ContentService.MimeType.JSON);
    }

    // ตรวจสอบว่ามีข้อมูลจริงส่งมาหรือไม่
    if (!data || Object.keys(data).length === 0) {
      return ContentService.createTextOutput(
        JSON.stringify({
          success: false,
          error: "ไม่พบข้อมูลที่ส่งมาจากแบบฟอร์ม (No data provided)",
        }),
      ).setMimeType(ContentService.MimeType.JSON);
    }

    var allRows = sheet.getDataRange().getValues();
    var maxSeqNum = 0;
    var userExistingId = null;
    var userHistoryCount = 0;

    var incomingReason = String(data.reason || "").trim();
    var incomingCategory = String(data.category || "").trim();

    // 1. ดึงข้อมูลระบุตัวตนของผู้ใช้ LINE (userId จาก LIFF หรือ client key)
    var incomingUserId = (data.userId || "").toString().trim();
    var incomingUsername = (data.username || "").toString().trim();
    var userKey =
      incomingUserId ||
      (incomingUsername && !incomingUsername.startsWith("PUI-CANCEL-")
        ? incomingUsername
        : "");
    if (!userKey && data.id && String(data.id).startsWith("PUI-CANCEL-")) {
      userKey = String(data.id).trim();
    }

    // 2. ป้องกันการกดส่งซ้ำเฉพาะกรณีผู้ใช้คนเดิมกดส่งซ้ำติดกันในเสี้ยววินาที (< 15 วินาที)
    if (allRows.length > 1) {
      var lastRow = allRows[allRows.length - 1];
      var lastId = String(lastRow[0] || "").trim();
      var lastDate = lastRow[1];
      var lastCategory = String(lastRow[2] || "").trim();
      var lastReason = String(lastRow[3] || "").trim();
      var lastNotes = String(lastRow[7] || "").trim().toLowerCase();

      var isSameUser = false;
      if (incomingUserId && lastNotes.indexOf(incomingUserId.toLowerCase()) !== -1) {
        isSameUser = true;
      } else if (incomingUsername && lastNotes.indexOf(incomingUsername.toLowerCase()) !== -1) {
        isSameUser = true;
      }

      var isRecentDuplicate = false;
      if (isSameUser && incomingReason && lastReason === incomingReason && lastCategory === incomingCategory) {
        try {
          var lastTime = lastDate instanceof Date ? lastDate.getTime() : new Date(lastDate).getTime();
          if (!isNaN(lastTime) && (Date.now() - lastTime < 15000)) {
            isRecentDuplicate = true;
          }
        } catch (e) {}
      }

      if (isRecentDuplicate) {
        return ContentService.createTextOutput(
          JSON.stringify({
            success: true,
            message: "ข้อมูลนี้ถูกบันทึกไปแล้ว (Prevented rapid double-click)",
            id: lastId,
            isDuplicatePrevented: true,
          }),
        ).setMimeType(ContentService.MimeType.JSON);
      }
    }

    var searchKeys = [];
    if (incomingUserId) searchKeys.push(incomingUserId.toLowerCase());
    if (incomingUsername && !incomingUsername.startsWith("PUI-CANCEL-"))
      searchKeys.push(incomingUsername.toLowerCase());
    if (data.id && String(data.id).startsWith("PUI-CANCEL-"))
      searchKeys.push(String(data.id).trim().toLowerCase());

    for (var r = 1; r < allRows.length; r++) {
      var cellId = String(allRows[r][0] || "").trim();
      var cellNotes = String(allRows[r][7] || "")
        .trim()
        .toLowerCase();
      var cellIdLower = cellId.toLowerCase();

      if (cellId) {
        var match = cellId.match(/PUI-CANCEL-(\d+)/i);
        if (match) {
          var num = parseInt(match[1], 10);
          if (!isNaN(num) && num > maxSeqNum && num < 90000) {
            maxSeqNum = num;
          }
        }
      }

      if (searchKeys.length > 0) {
        var isMatch = false;
        for (var sk = 0; sk < searchKeys.length; sk++) {
          var key = searchKeys[sk];
          if (
            key &&
            (cellNotes.indexOf(key) !== -1 ||
              cellIdLower === key ||
              cellIdLower.indexOf(key) !== -1)
          ) {
            isMatch = true;
            break;
          }
        }
        if (isMatch) {
          userHistoryCount++;
          if (!userExistingId && cellId) {
            userExistingId = cellId;
          }
        }
      }
    }

    // สร้างรหัสคำขอใหม่เสมอ ไม่ล็อกกับ userExistingId
    var nextNum = Math.max(maxSeqNum + 1, 1);
    var finalId = "PUI-CANCEL-" + ("00000" + nextNum).slice(-5);

    var createdAt = data.created_at
      ? formatCellDate(new Date(data.created_at))
      : formatCellDate(new Date());
    var category = data.category || "อื่นๆ";
    var reason = data.reason || "-";
    var priority = data.priority || "กลาง";
    var rating = data.rating || 3;
    var status = data.status || "ยกเลิกสำเร็จ";

    // บันทึกหมายเหตุ: จดจำชื่อโปรไฟล์ LINE และ LINE UID ชัดเจน (ไม่มีคำว่า "รอบที่")
    var noteParts = [];
    if (
      incomingUsername &&
      !incomingUsername.startsWith("PUI-CANCEL-") &&
      incomingUsername !== "LINE-DEVICE-01"
    ) {
      noteParts.push("LINE: " + incomingUsername);
    }
    if (incomingUserId && incomingUserId !== incomingUsername) {
      noteParts.push("[UID:" + incomingUserId + "]");
    } else if (userKey && noteParts.length === 0) {
      noteParts.push("[UID:" + userKey + "]");
    }
    var finalNotes = noteParts.join(" ");

    // บันทึกแถวใหม่ลงในตาราง Google Sheet
    sheet.appendRow([
      finalId,
      createdAt,
      category,
      reason,
      priority,
      rating,
      status,
      finalNotes,
    ]);

    return ContentService.createTextOutput(
      JSON.stringify({
        success: true,
        message: "บันทึกข้อมูลลงใน Google Sheet เรียบร้อยแล้ว",
        id: finalId,
        nextId: "PUI-CANCEL-" + ("00000" + (nextNum + 1)).slice(-5),
        round: userHistoryCount + 1,
        currentRound: userHistoryCount + 2,
      }),
    ).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(
      JSON.stringify({
        success: false,
        error: err.toString(),
      }),
    ).setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

/**
 * 2. ฟังก์ชันดึงข้อมูล GET
 */
function doGet(e) {
  try {
    var ss =
      SpreadsheetApp.getActiveSpreadsheet() ||
      SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = getPuijaiSheet(ss);
    var data = sheet.getDataRange().getValues();

    // 0. รีเซ็ตระบบและล้างข้อมูลทั้งหมดเพื่อเริ่มรันใหม่
    if (
      e &&
      e.parameter &&
      (e.parameter.action === "reset" || e.parameter.action === "clearAll")
    ) {
      sheet.clear();
      setupSheetHeaders(sheet);
      return ContentService.createTextOutput(
        JSON.stringify({
          success: true,
          message:
            "รีเซ็ตข้อมูลและล้างตารางทั้งหมดเรียบร้อยแล้ว พร้อมเริ่มรันใหม่ตั้งแต่ PUI-CANCEL-00001",
          nextId: "PUI-CANCEL-00001",
        }),
      ).setMimeType(ContentService.MimeType.JSON);
    }

    // 0.1 ลบข้อมูลของผู้ใช้ (deleteUser)
    if (e && e.parameter && e.parameter.action === "deleteUser") {
      var delCount = deleteUserRows(
        sheet,
        e.parameter.userId,
        e.parameter.username,
        e.parameter.id,
      );
      return ContentService.createTextOutput(
        JSON.stringify({
          success: true,
          message: "ลบข้อมูลของผู้ใช้ใน Google Sheets เรียบร้อยแล้ว",
          deletedCount: delCount,
        }),
      ).setMimeType(ContentService.MimeType.JSON);
    }

    // 1. คำนวณรหัสของผู้ใช้ LINE (nextId / checkUser)
    if (
      e &&
      e.parameter &&
      (e.parameter.action === "nextId" || e.parameter.action === "checkUser")
    ) {
      var rawUserId = String(e.parameter.userId || "")
        .trim()
        .toLowerCase();
      var rawUsername = String(e.parameter.username || "")
        .trim()
        .toLowerCase();
      var rawId = String(e.parameter.id || "")
        .trim()
        .toLowerCase();

      var searchKeys = [];
      [rawUserId, rawUsername, rawId].forEach(function (k) {
        if (k && k !== "pui-cancel-00001" && k !== "line-device-01") {
          searchKeys.push(k);
          var stripped = k
            .replace(/^\[uid:/i, "")
            .replace(/\[|\]/g, "")
            .trim();
          if (stripped && searchKeys.indexOf(stripped) === -1)
            searchKeys.push(stripped);
        }
      });

      var foundUserId = null;
      var foundCount = 0;
      var maxSeq = 0;

      for (var r = 1; r < data.length; r++) {
        var cellId = String(data[r][0] || "").trim();
        var cellNotes = String(data[r][7] || "")
          .trim()
          .toLowerCase();
        var cellIdLower = cellId.toLowerCase();

        var match = cellId.match(/PUI-CANCEL-(\d+)/i);
        if (match) {
          var num = parseInt(match[1], 10);
          if (!isNaN(num) && num > maxSeq && num < 90000) {
            maxSeq = num;
          }
        }

        if (searchKeys.length > 0) {
          var isRowMatch = false;
          for (var sk = 0; sk < searchKeys.length; sk++) {
            var key = searchKeys[sk];
            if (
              key &&
              (cellNotes.indexOf(key) !== -1 ||
                cellIdLower === key ||
                cellIdLower.indexOf(key) !== -1)
            ) {
              isRowMatch = true;
              break;
            }
          }
          if (isRowMatch) {
            foundCount++;
            if (!foundUserId && cellId) {
              foundUserId = cellId;
            }
          }
        }
      }

      // คืนค่ารหัสคำขอถัดไปที่เป็นรหัสใหม่เสมอ (ไม่ล็อกกับ foundUserId)
      var nextNumber = Math.max(maxSeq + 1, 1);
      var nextId = "PUI-CANCEL-" + ("00000" + nextNumber).slice(-5);

      if (foundCount > 0) {
        return ContentService.createTextOutput(
          JSON.stringify({
            success: true,
            nextId: nextId,
            isExistingUser: true,
            totalHistory: foundCount,
            currentRound: foundCount + 1,
            maxSeq: maxSeq,
          }),
        ).setMimeType(ContentService.MimeType.JSON);
      }

      return ContentService.createTextOutput(
        JSON.stringify({
          success: true,
          nextId: nextId,
          isExistingUser: false,
          totalHistory: 0,
          maxSeq: maxSeq,
        }),
      ).setMimeType(ContentService.MimeType.JSON);
    }

    var result = [];

    // อ่านข้อมูลคำขอ
    if (data.length > 1) {
      for (var i = 1; i < data.length; i++) {
        var row = data[i];
        if (!row[0] && !row[1] && !row[2]) continue;

        var rowNotes = String(row[7] || "");
        var cleanNotes = rowNotes.split(" [UID:")[0].trim();
        var parsedUser = "";
        if (rowNotes.indexOf("LINE: ") !== -1) {
          parsedUser = rowNotes.split("LINE: ")[1].split(" [UID:")[0].trim();
        } else if (rowNotes.indexOf("ผู้ใช้: ") !== -1) {
          parsedUser = rowNotes.split("ผู้ใช้: ")[1].split(" [UID:")[0].trim();
        } else {
          parsedUser = String(row[0] || "");
        }

        result.push({
          id: String(row[0] || ""),
          created_at: formatCellDate(row[1]),
          category: String(row[2] || "อื่นๆ"),
          reason: String(row[3] || "-"),
          priority: String(row[4] || "กลาง"),
          rating: Number(row[5]) || 3,
          status: String(row[6] || "ยกเลิกสำเร็จ"),
          notes: cleanNotes || rowNotes,
          username: parsedUser,
        });
      }
    }

    // ตรวจสอบสถานะสำหรับการปิดกั้นแชทบอทตอบคำถาม
    if (e && e.parameter && e.parameter.action === "checkBotReply") {
      var checkId = (
        e.parameter.username ||
        e.parameter.userId ||
        e.parameter.id ||
        ""
      )
        .toString()
        .trim()
        .toLowerCase();
      var isCancelled = false;
      var foundRecord = null;
      for (var k = 0; k < result.length; k++) {
        var recId = String(result[k].id || "")
          .trim()
          .toLowerCase();
        var recUser = String(result[k].username || "")
          .trim()
          .toLowerCase();
        var rowNotesRaw = (
          data[k + 1] && data[k + 1][7] ? String(data[k + 1][7]) : ""
        )
          .trim()
          .toLowerCase();
        if (
          checkId &&
          (recId === checkId ||
            recUser === checkId ||
            rowNotesRaw.indexOf(checkId) !== -1)
        ) {
          isCancelled = true;
          foundRecord = result[k];
          break;
        }
      }
      return ContentService.createTextOutput(
        JSON.stringify({
          success: true,
          shouldReply: !isCancelled,
          isCancelled: isCancelled,
          message: isCancelled
            ? "บริการแชทบอท Puijai สำหรับคำขอนี้ถูกยกเลิกแล้ว แชทบอทจะไม่ตอบสนองต่อ"
            : "บัญชีพร้อมใช้งานปกติ",
          record: foundRecord,
        }),
      ).setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(
      JSON.stringify({
        success: true,
        sheetName: sheet.getName(),
        count: result.length,
        data: result,
      }),
    ).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(
      JSON.stringify({
        success: false,
        error: err.toString(),
      }),
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * 3. ฟังก์ชันสร้าง Header ของตารางและจัดสไตล์
 */
function setupSheetHeaders(sheet) {
  if (!sheet) {
    var ss =
      SpreadsheetApp.getActiveSpreadsheet() ||
      SpreadsheetApp.openById(SPREADSHEET_ID);
    sheet = ss.getSheetByName(SHEET_NAME) || ss.getActiveSheet();
  }

  var headers = [
    "รหัสคำขอ",
    "วันที่/เวลา",
    "หมวดหมู่เหตุผล",
    "รายละเอียดเหตุผล",
    "ความสำคัญ",
    "คะแนน",
    "สถานะ",
    "หมายเหตุ",
  ];

  var headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setValues([headers]);
  headerRange.setFontWeight("bold");
  headerRange.setBackground("#0d9488"); // สีเขียว Teal
  headerRange.setFontColor("#ffffff"); // ตัวอักษรสีขาว
  sheet.setFrozenRows(1);
}

/**
 * 4. ฟังก์ชันระบบจัดการ LINE OA Webhook (100% Full Integration)
 */

// 4.1 ดึงโปรไฟล์ผู้ใช้งานจาก LINE Messaging API
function getLineUserProfile(userId) {
  if (!userId) return null;
  try {
    var res = UrlFetchApp.fetch(
      "https://api.line.me/v2/bot/profile/" + userId,
      {
        method: "get",
        headers: { Authorization: "Bearer " + LINE_CHANNEL_ACCESS_TOKEN },
        muteHttpExceptions: true,
      },
    );
    if (res.getResponseCode() === 200) {
      return JSON.parse(res.getContentText());
    }
  } catch (err) {
    Logger.log("getLineUserProfile Error: " + err);
  }
  return null;
}

// 4.2 ค้นหาประวัติคำขอยกเลิกของผู้ใช้ใน Google Sheet
function findUserCancellationRecord(sheet, userId, displayName) {
  var allRows = sheet.getDataRange().getValues();
  if (allRows.length <= 1) return null;

  var searchKeys = [];
  if (userId) searchKeys.push(String(userId).trim().toLowerCase());
  if (displayName) searchKeys.push(String(displayName).trim().toLowerCase());

  for (var r = allRows.length - 1; r >= 1; r--) {
    var row = allRows[r];
    var cellId = String(row[0] || "")
      .trim()
      .toLowerCase();
    var cellNotes = String(row[7] || "")
      .trim()
      .toLowerCase();

    for (var k = 0; k < searchKeys.length; k++) {
      var key = searchKeys[k];
      if (
        key &&
        (cellNotes.indexOf(key) !== -1 ||
          cellId === key ||
          cellId.indexOf(key) !== -1)
      ) {
        return {
          id: String(row[0] || ""),
          date: formatCellDate(row[1]),
          category: String(row[2] || "อื่นๆ"),
          reason: String(row[3] || "-"),
          priority: String(row[4] || "กลาง"),
          rating: Number(row[5]) || 3,
          status: String(row[6] || "ยกเลิกสำเร็จ"),
          notes: String(row[7] || "").trim(),
        };
      }
    }
  }
  return null;
}

// 4.3 จัดการ Webhook Events ทั้งหมดที่ส่งมาจาก LINE
function handleLineWebhookEvents(events, sheet) {
  for (var i = 0; i < events.length; i++) {
    var event = events[i];
    var replyToken = event.replyToken;
    if (!replyToken || replyToken === "00000000000000000000000000000000")
      continue;

    var userId = (event.source && event.source.userId) || "";
    var profile = getLineUserProfile(userId);
    var displayName =
      profile && profile.displayName ? profile.displayName : "ผู้ใช้งาน";

    var userText = "";
    if (
      event.type === "message" &&
      event.message &&
      event.message.type === "text"
    ) {
      userText = String(event.message.text || "").trim();
    }
    var postbackData = "";
    if (event.type === "postback" && event.postback && event.postback.data) {
      postbackData = String(event.postback.data || "").trim();
    }

    var cancellation = findUserCancellationRecord(sheet, userId, displayName);

    var isDeleteIntent =
      postbackData === "action=delete_all_data" ||
      postbackData === "delete_all_data" ||
      userText === "ลบข้อมูลแชทและข้อความแชททั้งหมด" ||
      userText.indexOf("ลบข้อมูลแชทและข้อความแชททั้งหมด") !== -1 ||
      userText.indexOf("ลบข้อมูลแชททั้งหมด") !== -1;

    var isCheckConfirmed =
      userText.indexOf("กรอกแบบประเมิน") !== -1 ||
      userText.indexOf("กรอกแล้ว") !== -1 ||
      userText.indexOf("ยืนยัน") !== -1 ||
      postbackData === "check_cancellation";

    var isCancelIntent =
      userText.indexOf("ยกเลิก") !== -1 ||
      userText.toLowerCase().indexOf("cancel") !== -1 ||
      event.type === "follow";

    if (isDeleteIntent) {
      deleteUserRows(sheet, userId, displayName);
      sendDeletionCompletedFlex(replyToken, displayName);
    } else if (isCheckConfirmed) {
      if (cancellation) {
        sendSuccessConfirmationFlex(replyToken, displayName, cancellation);
      } else {
        sendNotSubmittedAlertFlex(replyToken, displayName);
      }
    } else if (isCancelIntent) {
      if (cancellation) {
        sendAlreadyCancelledFlex(replyToken, displayName, cancellation);
      } else {
        sendCancellationPromptFlex(replyToken, displayName);
      }
    } else {
      if (cancellation) {
        Logger.log("User already cancelled: silent mode active for " + userId);
      }
    }
  }
}

// 4.4 Flex Message 1: ยืนยันยกเลิกสำเร็จเรียบร้อย (เขียว Teal สวยหรู)
function sendSuccessConfirmationFlex(replyToken, displayName, cancellation) {
  var messages = [
    {
      type: "flex",
      altText: "✅ บันทึกคำขอยกเลิกบริการ Puijai สำเร็จเรียบร้อย",
      contents: {
        type: "bubble",
        size: "mega",
        header: {
          type: "box",
          layout: "vertical",
          backgroundColor: "#0d9488",
          paddingAll: "16px",
          contents: [
            {
              type: "text",
              text: "✅ บันทึกคำขอยกเลิกสำเร็จ",
              weight: "bold",
              color: "#ffffff",
              size: "md",
            },
            {
              type: "text",
              text: "Puijai Cancellation Service",
              size: "xs",
              color: "#ccfbf1",
              margin: "xs",
            },
          ],
        },
        body: {
          type: "box",
          layout: "vertical",
          spacing: "md",
          contents: [
            {
              type: "text",
              text: "สวัสดีครับคุณ " + displayName + " ☁️",
              weight: "bold",
              size: "md",
              color: "#0f172a",
            },
            {
              type: "text",
              text: "ระบบตรวจพบและบันทึกคำขอยกเลิกบริการของคุณเข้าสู่ระบบเรียบร้อยแล้วครับ โดยมีรายละเอียดดังนี้:",
              wrap: true,
              size: "sm",
              color: "#475569",
            },
            {
              type: "box",
              layout: "vertical",
              margin: "md",
              spacing: "sm",
              backgroundColor: "#f8fafc",
              paddingAll: "12px",
              cornerRadius: "8px",
              borderColor: "#e2e8f0",
              borderWidth: "1px",
              contents: [
                {
                  type: "box",
                  layout: "baseline",
                  contents: [
                    {
                      type: "text",
                      text: "รหัสคำขอ:",
                      size: "xs",
                      color: "#64748b",
                      flex: 3,
                    },
                    {
                      type: "text",
                      text: cancellation.id,
                      size: "xs",
                      weight: "bold",
                      color: "#0d9488",
                      flex: 5,
                    },
                  ],
                },
                {
                  type: "box",
                  layout: "baseline",
                  contents: [
                    {
                      type: "text",
                      text: "วันที่ขอยกเลิก:",
                      size: "xs",
                      color: "#64748b",
                      flex: 3,
                    },
                    {
                      type: "text",
                      text: cancellation.date,
                      size: "xs",
                      weight: "bold",
                      color: "#0f172a",
                      flex: 5,
                    },
                  ],
                },
                {
                  type: "box",
                  layout: "baseline",
                  contents: [
                    {
                      type: "text",
                      text: "สถานะ:",
                      size: "xs",
                      color: "#64748b",
                      flex: 3,
                    },
                    {
                      type: "text",
                      text: cancellation.status,
                      size: "xs",
                      weight: "bold",
                      color: "#16a34a",
                      flex: 5,
                    },
                  ],
                },
              ],
            },
            {
              type: "text",
              text: "🌿 แชทบอท Puijai ได้ระงับการตอบกลับอัตโนมัติสำหรับบัญชีของคุณเรียบร้อยแล้ว ขอบคุณที่เคยไว้วางใจใช้บริการปุยใจเสมอมาครับ",
              wrap: true,
              size: "xs",
              color: "#64748b",
            },
          ],
        },
        footer: {
          type: "box",
          layout: "vertical",
          spacing: "sm",
          contents: [
            {
              type: "button",
              action: {
                type: "uri",
                label: "ดูรายละเอียดคำขอ / ยื่นเรื่องใหม่",
                uri: LIFF_URL,
              },
              style: "secondary",
              height: "sm",
            },
            {
              type: "button",
              action: {
                type: "postback",
                label: "🗑️ ลบข้อมูลแชทและข้อความทั้งหมด",
                data: "action=delete_all_data",
                displayText: "ลบข้อมูลแชทและข้อความแชททั้งหมด",
              },
              style: "primary",
              color: "#e11d48",
              height: "sm",
            },
          ],
        },
      },
    },
  ];
  sendLineMessages(replyToken, messages);
}

// 4.5 Flex Message 2: แจ้งเตือนยังไม่พบคำขอในระบบ
function sendNotSubmittedAlertFlex(replyToken, displayName) {
  var messages = [
    {
      type: "flex",
      altText: "⚠️ ยังไม่พบคำขอยกเลิกในระบบ - กรุณาส่งแบบประเมินก่อน",
      contents: {
        type: "bubble",
        size: "mega",
        header: {
          type: "box",
          layout: "vertical",
          backgroundColor: "#ea580c",
          paddingAll: "16px",
          contents: [
            {
              type: "text",
              text: "⚠️ ยังไม่พบคำขอยกเลิกในระบบ",
              weight: "bold",
              color: "#ffffff",
              size: "md",
            },
            {
              type: "text",
              text: "Puijai Cancellation Service",
              size: "xs",
              color: "#ffedd5",
              margin: "xs",
            },
          ],
        },
        body: {
          type: "box",
          layout: "vertical",
          spacing: "md",
          contents: [
            {
              type: "text",
              text: "เรียนคุณ " + displayName + " ☁️",
              weight: "bold",
              size: "md",
              color: "#0f172a",
            },
            {
              type: "text",
              text: "ระบบยังไม่พบคำขอยกเลิกที่สำเร็จภายใต้ชื่อโปรไฟล์ LINE ของคุณ กรุณาตรวจสอบชื่อและกดส่งแบบประเมินให้เรียบร้อยก่อนนะครับ",
              wrap: true,
              size: "sm",
              color: "#475569",
            },
            {
              type: "box",
              layout: "vertical",
              margin: "md",
              spacing: "xs",
              backgroundColor: "#fff7ed",
              paddingAll: "12px",
              cornerRadius: "8px",
              borderColor: "#fed7aa",
              borderWidth: "1px",
              contents: [
                {
                  type: "text",
                  text: "💡 ขั้นตอนการยกเลิกบริการ:",
                  weight: "bold",
                  size: "xs",
                  color: "#9a3412",
                },
                {
                  type: "text",
                  text: "1. กดปุ่ม 'เปิดแบบประเมิน' ด้านล่าง",
                  size: "xs",
                  color: "#c2410c",
                },
                {
                  type: "text",
                  text: "2. กรอกเหตุผลและกดยืนยันการยกเลิก",
                  size: "xs",
                  color: "#c2410c",
                },
                {
                  type: "text",
                  text: "3. ระบบจะบันทึกข้อมูลและปิดบอทให้ทันที",
                  size: "xs",
                  color: "#c2410c",
                },
              ],
            },
          ],
        },
        footer: {
          type: "box",
          layout: "vertical",
          spacing: "sm",
          contents: [
            {
              type: "button",
              action: {
                type: "uri",
                label: "📋 เปิดแบบประเมินยกเลิกบริการ",
                uri: LIFF_URL,
              },
              style: "primary",
              color: "#0d9488",
              height: "sm",
            },
            {
              type: "button",
              action: {
                type: "message",
                label: "✅ กรอกแบบประเมินแล้ว",
                text: "กรอกแบบประเมินยกเลิกการใช้งานแล้ว",
              },
              style: "secondary",
              height: "sm",
            },
          ],
        },
      },
    },
  ];
  sendLineMessages(replyToken, messages);
}

// 4.6 Flex Message 3: การ์ดเชิญชวนเปิดแบบประเมินยกเลิก
function sendCancellationPromptFlex(replyToken, displayName) {
  var messages = [
    {
      type: "flex",
      altText: "แบบฟอร์มขอยกเลิกการใช้งานแชทบอท Puijai",
      contents: {
        type: "bubble",
        size: "mega",
        header: {
          type: "box",
          layout: "vertical",
          backgroundColor: "#0284c7",
          paddingAll: "16px",
          contents: [
            {
              type: "text",
              text: "ศูนย์ขอยกเลิกบริการปุยใจ ☁️",
              weight: "bold",
              color: "#ffffff",
              size: "md",
            },
            {
              type: "text",
              text: "Puijai Cancellation Service",
              size: "xs",
              color: "#e0f2fe",
              margin: "xs",
            },
          ],
        },
        body: {
          type: "box",
          layout: "vertical",
          spacing: "md",
          contents: [
            {
              type: "text",
              text: "สวัสดีครับคุณ " + displayName + " 🌿",
              weight: "bold",
              size: "md",
              color: "#0f172a",
            },
            {
              type: "text",
              text: "หากคุณต้องการยื่นขอยกเลิกบริการแชทบอท Puijai และส่งประเมินข้อเสนอแนะ สามารถกดปุ่มด้านล่างเพื่อดำเนินการได้ทันทีครับ",
              wrap: true,
              size: "sm",
              color: "#475569",
            },
          ],
        },
        footer: {
          type: "box",
          layout: "vertical",
          spacing: "sm",
          contents: [
            {
              type: "button",
              action: {
                type: "uri",
                label: "📋 เปิดแบบประเมิน",
                uri: LIFF_URL,
              },
              style: "primary",
              color: "#0d9488",
              height: "sm",
            },
            {
              type: "button",
              action: {
                type: "message",
                label: "✅ กรอกแบบประเมินแล้ว",
                text: "กรอกแบบประเมินยกเลิกการใช้งานแล้ว",
              },
              style: "secondary",
              height: "sm",
            },
          ],
        },
      },
    },
  ];
  sendLineMessages(replyToken, messages);
}

// 4.7 Flex Message 4: แจ้งเตือนกรณีเคยยกเลิกไปแล้ว
function sendAlreadyCancelledFlex(replyToken, displayName, cancellation) {
  var messages = [
    {
      type: "flex",
      altText: "สถานะบัญชีของคุณ: ยกเลิกบริการเรียบร้อยแล้ว",
      contents: {
        type: "bubble",
        size: "mega",
        header: {
          type: "box",
          layout: "vertical",
          backgroundColor: "#475569",
          paddingAll: "16px",
          contents: [
            {
              type: "text",
              text: "สถานะบัญชี: ยกเลิกบริการแล้ว",
              weight: "bold",
              color: "#ffffff",
              size: "md",
            },
          ],
        },
        body: {
          type: "box",
          layout: "vertical",
          spacing: "md",
          contents: [
            {
              type: "text",
              text: "เรียนคุณ " + displayName + " ☁️",
              weight: "bold",
              size: "md",
              color: "#0f172a",
            },
            {
              type: "text",
              text:
                "บัญชี LINE ของคุณได้ส่งคำขอยกเลิกบริการเรียบร้อยแล้ว (" +
                cancellation.id +
                ") ระบบได้ปิดการตอบกลับอัตโนมัติแล้วครับ",
              wrap: true,
              size: "sm",
              color: "#475569",
            },
          ],
        },
        footer: {
          type: "box",
          layout: "vertical",
          spacing: "sm",
          contents: [
            {
              type: "button",
              action: {
                type: "uri",
                label: "ดูรายละเอียดคำขอ / ยื่นเรื่องใหม่",
                uri: LIFF_URL,
              },
              style: "secondary",
              height: "sm",
            },
          ],
        },
      },
    },
  ];
  sendLineMessages(replyToken, messages);
}

// 4.8 ฟังก์ชันส่งข้อความตอบกลับไปยัง LINE Messaging API
function sendLineMessages(replyToken, messages) {
  if (!replyToken || !messages || messages.length === 0) return;
  try {
    var payload = {
      replyToken: replyToken,
      messages: messages,
    };
    var res = UrlFetchApp.fetch("https://api.line.me/v2/bot/message/reply", {
      method: "post",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + LINE_CHANNEL_ACCESS_TOKEN,
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    });
    Logger.log("LINE Reply Response: " + res.getResponseCode());
  } catch (err) {
    Logger.log("sendLineMessages Error: " + err);
  }
}

// 4.9 Flex Message 5: ยืนยันลบข้อมูลสำเร็จพร้อมคำแนะนำ 4 ขั้นตอนบนมือถือ
function sendDeletionCompletedFlex(replyToken, displayName) {
  var messages = [
    {
      type: "flex",
      altText: "🗑️ ลบข้อมูลในระบบเรียบร้อยแล้ว",
      contents: {
        type: "bubble",
        size: "mega",
        header: {
          type: "box",
          layout: "vertical",
          backgroundColor: "#e11d48",
          paddingAll: "16px",
          contents: [
            {
              type: "text",
              text: "🗑️ ลบข้อมูลในระบบเรียบร้อย",
              weight: "bold",
              color: "#ffffff",
              size: "md",
            },
            {
              type: "text",
              text: "Puijai Data Privacy & Deletion",
              size: "xs",
              color: "#ffe4e6",
              margin: "xs",
            },
          ],
        },
        body: {
          type: "box",
          layout: "vertical",
          spacing: "md",
          contents: [
            {
              type: "text",
              text: "เรียนคุณ " + displayName + " 🔒",
              weight: "bold",
              size: "md",
              color: "#0f172a",
            },
            {
              type: "text",
              text: "ระบบได้ลบประวัติคำขอยกเลิกและข้อมูลของคุณออกจากฐานข้อมูลและ Google Sheets เรียบร้อยแล้วครับ",
              wrap: true,
              size: "sm",
              color: "#475569",
            },
            {
              type: "box",
              layout: "vertical",
              backgroundColor: "#fff1f2",
              paddingAll: "12px",
              cornerRadius: "8px",
              borderColor: "#fecdd3",
              borderWidth: "1px",
              spacing: "xs",
              contents: [
                {
                  type: "text",
                  text: "📱 ขั้นตอนลบข้อมูลแชทบนมือถือของคุณ:",
                  weight: "bold",
                  size: "xs",
                  color: "#be123c",
                },
                {
                  type: "text",
                  text: "1. แตะเมนู ☰ (มุมขวาบนของห้องแชทนี้)",
                  size: "xs",
                  color: "#9f1239",
                },
                {
                  type: "text",
                  text: "2. เลือก 'ตั้งค่าอื่นๆ' (Other Settings)",
                  size: "xs",
                  color: "#9f1239",
                },
                {
                  type: "text",
                  text: "3. เลือก 'ลบข้อมูล'",
                  size: "xs",
                  color: "#9f1239",
                },
                {
                  type: "text",
                  text: "4. กด 'ลบข้อมูลแชทและข้อความแชททั้งหมด'",
                  size: "xs",
                  weight: "bold",
                  color: "#e11d48",
                },
              ],
            },
          ],
        },
        footer: {
          type: "box",
          layout: "vertical",
          spacing: "sm",
          contents: [
            {
              type: "button",
              action: {
                type: "uri",
                label: "📋 ศูนย์บริการยกเลิกปุยใจ",
                uri: LIFF_URL,
              },
              style: "secondary",
              height: "sm",
            },
          ],
        },
      },
    },
  ];
  sendLineMessages(replyToken, messages);
}

// 4.10 ฟังก์ชันลบแถวข้อมูลของผู้ใช้ใน Google Sheets
function deleteUserRows(sheet, userId, displayName, id) {
  var delKeys = [];
  [userId, displayName, id].forEach(function (k) {
    if (k && k !== "line-device-01" && k !== "ผู้ใช้ทดสอบ") {
      var lower = String(k).trim().toLowerCase();
      delKeys.push(lower);
      var stripped = lower.replace(/^\[uid:/i, "").replace(/\[|\]/g, "").trim();
      if (stripped && delKeys.indexOf(stripped) === -1) delKeys.push(stripped);
    }
  });

  if (delKeys.length === 0) return 0;

  var currentRows = sheet.getDataRange().getValues();
  var deletedCount = 0;
  for (var dr = currentRows.length - 1; dr >= 1; dr--) {
    var rowCellId = String(currentRows[dr][0] || "").trim().toLowerCase();
    var rowCellNotes = String(currentRows[dr][7] || "").trim().toLowerCase();
    var isMatch = false;

    for (var dk = 0; dk < delKeys.length; dk++) {
      var key = delKeys[dk];
      if (
        key &&
        (rowCellNotes.indexOf(key) !== -1 ||
          rowCellId === key ||
          rowCellId.indexOf(key) !== -1)
      ) {
        isMatch = true;
        break;
      }
    }

    if (isMatch) {
      sheet.deleteRow(dr + 1);
      deletedCount++;
    }
  }
  return deletedCount;
}

/**
 * 5. ฟังก์ชันจัดลำดับรหัสคำขอใหม่ให้ต่อเนื่อง
 */
function fixSheetSequenceNumbers() {
  var ss =
    SpreadsheetApp.getActiveSpreadsheet() ||
    SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = getPuijaiSheet(ss);
  var data = sheet.getDataRange().getValues();

  if (data.length <= 1) return;

  for (var i = 1; i < data.length; i++) {
    var fixedId = "PUI-CANCEL-" + ("00000" + i).slice(-5);
    sheet.getRange(i + 1, 1).setValue(fixedId);
  }

  Logger.log("จัดลำดับรหัสคำขอใหม่เรียบร้อยแล้ว");
}

/**
 * 6. ฟังก์ชันล้างข้อมูลในตารางทั้งหมดเพื่อรีเซ็ต
 */
function resetSheetData() {
  var ss =
    SpreadsheetApp.getActiveSpreadsheet() ||
    SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = getPuijaiSheet(ss);

  sheet.clear();
  setupSheetHeaders(sheet);

  Logger.log("✅ ล้างข้อมูลและรีเซ็ตแผ่นงานเรียบร้อยแล้ว!");
  Logger.log("🚀 พร้อมเริ่มรันใหม่ตั้งแต่รหัส: PUI-CANCEL-00001");
}
