// api/index.js (هذا هو ملف Backend الرئيسي في Vercel)

const { google } = require('googleapis');
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors'); // لإدارة طلبات CORS من Flutter

// قم بتعريف اسم ورقة العمل وأسماء الأعمدة
const SPREADSHEET_ID = '1Xsi-KuFaMJdPFn3zCsURSiQWlAUV7lwivTwrqSDXmCU'; // *** هام: استبدل هذا بمعرف Google Sheet الخاص بك ***
const SHEET_NAME = 'Sheet1'; // *** هام: تأكد من أن هذا يتطابق مع اسم ورقة عملك (مثلاً: Sheet1) ***
const COL_ACTIVATION_KEY = 'activation_key'; // العمود A
const COL_DEVICE_ID = 'device_id';       // العمود B
const COL_ACTIVATION_DATE = 'activation_date'; // العمود C

// إعداد عميل Google API
const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY), // جلب المفتاح من متغيرات البيئة
  scopes: ['https://www.googleapis.com/auth/spreadsheets'], // نطاق الوصول المطلوب لجداول البيانات
});

const sheets = google.sheets({ version: 'v4', auth });

const app = express();
app.use(bodyParser.json());
app.use(cors()); // تفعيل CORS للسماح لطلبات Flutter

// دالة مساعدة لإنشاء رد JSON موحد
function createJsonResponse(success, message) {
  return { success, message };
}

// API Endpoint للتحقق من التفعيل
app.post('/activate', async (req, res) => {
  try {
    const { activation_key, device_id } = req.body;

    // التحقق من وجود مفتاح التفعيل ومعرف الجهاز في الطلب
    if (!activation_key || !device_id) {
      return res.status(400).json(createJsonResponse(false, "Invalid request: activation_key and device_id are required."));
    }

    // قراءة البيانات من ورقة العمل
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A:C`, // قراءة الأعمدة A, B, C
    });

    const values = response.data.values;
    if (!values || values.length === 0) {
      return res.status(404).json(createJsonResponse(false, "Activation failed: No data found in sheet."));
    }

    let found = false;
    let rowIndex = -1;
    let storedDeviceId = '';

    // البحث عن المفتاح وتحديد الصف
    // نفترض أن الصف الأول هو رؤوس الأعمدة
    for (let i = 0; i < values.length; i++) {
      const row = values[i];
      const currentKey = row[0]; // العمود A (index 0)

      if (currentKey === activation_key) {
        found = true;
        rowIndex = i + 1; // رقم الصف في الشيت (يبدأ من 1)
        storedDeviceId = row[1] || ''; // العمود B (index 1)
        break;
      }
    }

    if (!found) {
      return res.status(404).json(createJsonResponse(false, "Activation failed: Invalid activation key."));
    }

    // منطق التحقق من التفعيل
    if (storedDeviceId === "") {
      // المفتاح لم يتم تفعيله بعد - ربطه بالجهاز الحالي
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_NAME}!B${rowIndex}`, // تحديث العمود B للصف المحدد
        valueInputOption: 'RAW',
        resource: {
          values: [[device_id]],
        },
      });
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_NAME}!C${rowIndex}`, // تحديث العمود C (تاريخ التفعيل)
        valueInputOption: 'RAW',
        resource: {
          values: [[new Date().toLocaleString()]], // تنسيق التاريخ والوقت
        },
      });
      return res.status(200).json(createJsonResponse(true, "Activation successful: Key activated for this device."));
    } else if (storedDeviceId === device_id) {
      // المفتاح مفعل مسبقاً على نفس الجهاز
      return res.status(200).json(createJsonResponse(true, "Activation successful: Key already activated on this device."));
    } else {
      // المفتاح مفعل على جهاز آخر
      return res.status(403).json(createJsonResponse(false, "Activation failed: Key already activated on another device."));
    }

  } catch (error) {
    console.error('Error in /activate endpoint:', error);
    return res.status(500).json(createJsonResponse(false, "Internal server error: " + error.message));
  }
});

// Handle all other routes by returning a 404
app.use((req, res) => {
    res.status(404).json({ success: false, message: 'API endpoint not found.' });
});

// تصدير التطبيق ليتمكن Vercel من استخدامه
module.exports = app;
