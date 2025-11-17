/**
 * Google Apps Script - Email API
 * Fungsi untuk mengirim email melalui HTTP request
 */

// Konfigurasi API
const CONFIG = {
  API_KEY: 'apkey', // Ganti dengan API key yang aman
  MAX_RECIPIENTS: 50, // Maksimal penerima per request
  RATE_LIMIT: 500, // Maksimal request per jam
  ALLOWED_DOMAINS: ['gmail.com', 'zonahelm.com', 'classy.id'], // Domain yang diizinkan (opsional)
  LOG_SPREADSHEET_ID: '<ID-SPREADSHEET>', // Spreadsheet untuk logging
  ENABLE_SPREADSHEET_LOG: true, // Enable/disable logging ke spreadsheet
};

/**
 * Main API handler - processes all incoming requests
 */
function doPost(e) {
  const startTime = new Date();
  let requestData = {};
  
  try {
    // Handle preflight OPTIONS request
    if (e.parameter && e.parameter.method === 'OPTIONS') {
      return ContentService
        .createTextOutput('')
        .setMimeType(ContentService.MimeType.TEXT);
    }

    // Parse request body
    try {
      requestData = JSON.parse(e.postData.contents);
    } catch (parseError) {
      return createErrorResponse(400, 'Invalid JSON in request body', parseError.toString());
    }

    // Route to appropriate handler based on endpoint
    const endpoint = requestData.endpoint || 'send-email';
    
    switch (endpoint) {
      case 'send-email':
        return handleSendEmail(requestData, startTime);
      
      case 'bulk-email':
        return handleBulkEmail(requestData, startTime);
      
      case 'get-templates':
        return handleGetEmailTemplates(requestData);
      
      case 'get-history':
        return handleGetEmailHistory(requestData);
      
      case 'health-check':
        return handleHealthCheck();
      
      default:
        return createErrorResponse(404, 'Endpoint not found', `Available endpoints: send-email, bulk-email, get-templates, get-history, health-check`);
    }

  } catch (error) {
    logApiRequest('API Error', `Unhandled error: ${error.toString()}`, 'ERROR');
    return createErrorResponse(500, 'Internal server error', error.toString());
  }
}

/**
 * Handle single email sending
 */
function handleSendEmail(requestData, startTime) {
  try {
    // Log API request
    logApiRequest('POST', '/send-email', 'PROCESSING', 'Send email request received', {
      request_size: JSON.stringify(requestData).length,
      has_attachments: !!(requestData.attachments && requestData.attachments.length > 0)
    });
    
    // Validasi API Key
    if (!validateApiKey(requestData)) {
      logApiRequest('POST', '/send-email', 401, 'Invalid API key');
      return createErrorResponse(401, 'Invalid API key', 'Please provide a valid API key');
    }
    
    // Validasi rate limiting
    if (!checkRateLimit()) {
      logApiRequest('POST', '/send-email', 429, 'Rate limit exceeded');
      return createErrorResponse(429, 'Rate limit exceeded', `Maximum ${CONFIG.RATE_LIMIT} requests per day`);
    }
    
    // Validasi input
    const validation = validateEmailData(requestData);
    if (!validation.isValid) {
      logApiRequest('POST', '/send-email', 400, validation.message);
      return createErrorResponse(400, 'Validation failed', validation.message);
    }
    
    // Kirim email
    const result = sendEmail(requestData);
    const processingTime = new Date() - startTime;
    
    if (result.success) {
      // Log successful email
      logEmailSent(
        requestData.to, 
        requestData.subject, 
        result.messageId,
        {
          from_name: requestData.from_name || 'API Mailer',
          cc: requestData.cc || '',
          bcc: requestData.bcc || '',
          has_attachments: !!(requestData.attachments && requestData.attachments.length > 0),
          ip: getClientIP()
        }
      );
      
      // Log successful API request
      logApiRequest('POST', '/send-email', 200, 'Email sent successfully', {
        response_time: processingTime + 'ms',
        message_id: result.messageId,
        recipients_count: Array.isArray(requestData.to) ? requestData.to.length : 1
      });
      
      const response = {
        success: true,
        data: {
          messageId: result.messageId,
          timestamp: new Date().toISOString(),
          recipients: requestData.to,
          processing_time_ms: processingTime
        },
        meta: {
          endpoint: 'send-email',
          timestamp: new Date().toISOString(),
          version: '1.0.0'
        }
      };

      return createSuccessResponse(response);
    } else {
      // Log email sending error
      logError(new Error(result.error), 'Email sending failed', {
        to: requestData.to,
        subject: requestData.subject
      });
      
      logApiRequest('POST', '/send-email', 500, result.error);
      return createErrorResponse(500, 'Email sending failed', result.error);
    }
    
  } catch (error) {
    console.error('Error in handleSendEmail:', error);
    
    // Log general error
    logError(error, 'handleSendEmail function', {
      request_data: requestData
    });
    
    logApiRequest('POST', '/send-email', 500, 'Internal server error');
    return createErrorResponse(500, 'Internal server error', error.toString());
  }
}

/**
 * Handle bulk email sending
 */
function handleBulkEmail(requestData, startTime) {
  try {
    logApiRequest('POST', '/bulk-email', 'PROCESSING', 'Bulk email request received');
    
    if (!validateApiKey(requestData)) {
      return createErrorResponse(401, 'Invalid API key', 'Please provide a valid API key');
    }
    
    if (!requestData.emails || !Array.isArray(requestData.emails)) {
      return createErrorResponse(400, 'Invalid bulk email data', 'Field "emails" must be an array');
    }
    
    if (requestData.emails.length > 10) {
      return createErrorResponse(400, 'Too many emails', 'Maximum 10 emails per bulk request');
    }
    
    const results = [];
    let successCount = 0;
    let failureCount = 0;
    
    for (const emailData of requestData.emails) {
      const validation = validateEmailData(emailData);
      if (!validation.isValid) {
        results.push({
          email: emailData,
          success: false,
          error: validation.message
        });
        failureCount++;
        continue;
      }
      
      const result = sendEmail(emailData);
      if (result.success) {
        logEmailSent(emailData.to, emailData.subject, result.messageId);
        results.push({
          email: emailData,
          success: true,
          messageId: result.messageId
        });
        successCount++;
      } else {
        results.push({
          email: emailData,
          success: false,
          error: result.error
        });
        failureCount++;
      }
    }
    
    const processingTime = new Date() - startTime;
    const response = {
      success: true,
      data: {
        results: results,
        summary: {
          total: requestData.emails.length,
          successful: successCount,
          failed: failureCount
        },
        processing_time_ms: processingTime
      },
      meta: {
        endpoint: 'bulk-email',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
      }
    };

    logApiRequest('POST', '/bulk-email', 200, `Bulk email completed: ${successCount}/${requestData.emails.length} successful`);
    return createSuccessResponse(response);
    
  } catch (error) {
    logError(error, 'handleBulkEmail function');
    return createErrorResponse(500, 'Internal server error', error.toString());
  }
}

/**
 * Handle GET requests - API Documentation & Management
 */
function doGet(e) {
  const path = e.parameter.path || '';
  
  try {
    switch (path) {
      case 'health':
        logApiRequest('GET', '/health', 200, 'Health check successful');
        const healthStatus = {
          success: true,
          data: {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            version: '1.0.0',
            services: {
              gmail_api: 'connected',
              google_sheets: 'connected',
              google_drive: 'connected'
            },
            uptime: 'running'
          },
          meta: {
            endpoint: 'health-check',
            timestamp: new Date().toISOString(),
            version: '1.0.0'
          }
        };
        return createSuccessResponse(healthStatus);
      
      case 'usage':
        logApiRequest('GET', '/usage', 200, 'Usage statistics requested');
        const usageStats = {
          success: true,
          data: {
            requests_today: getRequestCount(),
            rate_limit: CONFIG.RATE_LIMIT,
            max_recipients: CONFIG.MAX_RECIPIENTS,
            log_statistics: getLogStatistics()
          },
          meta: {
            endpoint: 'usage',
            timestamp: new Date().toISOString(),
            version: '1.0.0'
          }
        };
        return createSuccessResponse(usageStats);
      
      case 'logs':
        if (!validateApiKeyFromParams(e)) {
          logApiRequest('GET', '/logs', 401, 'Invalid API key for logs access');
          return createErrorResponse(401, 'Invalid API key', 'API key required for logs access');
        }
        
        const logStats = getLogStatistics();
        logApiRequest('GET', '/logs', 200, 'Log statistics requested');
        const logsResponse = {
          success: true,
          data: logStats,
          meta: {
            endpoint: 'logs',
            timestamp: new Date().toISOString(),
            version: '1.0.0'
          }
        };
        return createSuccessResponse(logsResponse);
      
      case 'clear-logs':
        if (!validateApiKeyFromParams(e)) {
          logApiRequest('GET', '/clear-logs', 401, 'Invalid API key for log clearing');
          return createErrorResponse(401, 'Invalid API key', 'API key required for log management');
        }
        
        const daysToKeep = parseInt(e.parameter.days) || 30;
        const clearResult = clearOldLogs(daysToKeep);
        logApiRequest('GET', '/clear-logs', 200, `Cleared logs older than ${daysToKeep} days`);
        const clearResponse = {
          success: true,
          data: clearResult,
          meta: {
            endpoint: 'clear-logs',
            timestamp: new Date().toISOString(),
            version: '1.0.0'
          }
        };
        return createSuccessResponse(clearResponse);
      
      default:
        // API Documentation
        const apiDoc = {
          success: true,
          data: {
            api: 'Email Sending API',
            version: '1.0.0',
            timestamp: new Date().toISOString(),
            documentation: {
              base_url: ScriptApp.getService().getUrl(),
              endpoints: {
                'POST /': 'Main API endpoint',
                'GET /': 'API documentation'
              },
              available_endpoints: [
                'send-email',
                'bulk-email',
                'get-templates',
                'get-history',
                'health-check'
              ]
            }
          },
          meta: {
            endpoint: 'documentation',
            timestamp: new Date().toISOString(),
            version: '1.0.0'
          }
        };
        
        if (path) {
          logApiRequest('GET', `/${path}`, 404, 'Endpoint not found');
          return createErrorResponse(404, 'Endpoint not found', `Path "${path}" not available`);
        }
        
        return createSuccessResponse(apiDoc);
    }
  } catch (error) {
    logError(error, 'doGet function', { path: path });
    return createErrorResponse(500, 'Internal server error', error.toString());
  }
}

/**
 * Validate API key from GET parameters
 */
function validateApiKeyFromParams(e) {
  const apiKey = e.parameter.api_key;
  return apiKey === CONFIG.API_KEY;
}

/**
 * Validasi API Key dengan support multiple methods
 */
function validateApiKey(requestData) {
  // Try to get API key from multiple sources
  const apiKey = requestData.api_key;
  return apiKey === CONFIG.API_KEY;
}

/**
 * Validasi data email
 */
function validateEmailData(data) {
  // Required fields
  if (!data.to || !data.subject || !data.body) {
    return {
      isValid: false,
      message: 'Missing required fields: to, subject, body'
    };
  }
  
  // Validasi email addresses
  const recipients = Array.isArray(data.to) ? data.to : [data.to];
  
  if (recipients.length > CONFIG.MAX_RECIPIENTS) {
    return {
      isValid: false,
      message: `Too many recipients. Maximum: ${CONFIG.MAX_RECIPIENTS}`
    };
  }
  
  for (const email of recipients) {
    if (!isValidEmail(email)) {
      return {
        isValid: false,
        message: `Invalid email address: ${email}`
      };
    }
  }
  
  // Validasi CC dan BCC jika ada
  if (data.cc) {
    const ccList = Array.isArray(data.cc) ? data.cc : [data.cc];
    for (const email of ccList) {
      if (!isValidEmail(email)) {
        return {
          isValid: false,
          message: `Invalid CC email address: ${email}`
        };
      }
    }
  }
  
  if (data.bcc) {
    const bccList = Array.isArray(data.bcc) ? data.bcc : [data.bcc];
    for (const email of bccList) {
      if (!isValidEmail(email)) {
        return {
          isValid: false,
          message: `Invalid BCC email address: ${email}`
        };
      }
    }
  }
  
  return { isValid: true, message: 'Valid' };
}

/**
 * Fungsi untuk mengirim email
 */
function sendEmail(data) {
  try {
    const options = {
      to: Array.isArray(data.to) ? data.to.join(',') : data.to,
      subject: data.subject,
      htmlBody: data.html_body || data.body,
      name: data.from_name || 'API Mailer'
    };
    
    // Tambahkan CC jika ada
    if (data.cc) {
      options.cc = Array.isArray(data.cc) ? data.cc.join(',') : data.cc;
    }
    
    // Tambahkan BCC jika ada
    if (data.bcc) {
      options.bcc = Array.isArray(data.bcc) ? data.bcc.join(',') : data.bcc;
    }
    
    // Tambahkan reply-to jika ada
    if (data.reply_to) {
      options.replyTo = data.reply_to;
    }
    
    // Tambahkan attachments jika ada
    if (data.attachments && Array.isArray(data.attachments)) {
      options.attachments = processAttachments(data.attachments);
    }
    
    // Kirim email
    GmailApp.sendEmail(options.to, options.subject, '', options);
    
    // Log pengiriman
    logEmailSent(options.to, options.subject);
    
    return {
      success: true,
      messageId: generateMessageId()
    };
    
  } catch (error) {
    console.error('Error sending email:', error);
    return {
      success: false,
      error: error.toString()
    };
  }
}

/**
 * Process attachments
 */
function processAttachments(attachments) {
  const processedAttachments = [];
  
  for (const attachment of attachments) {
    try {
      if (attachment.drive_file_id) {
        // Attachment dari Google Drive
        const file = DriveApp.getFileById(attachment.drive_file_id);
        processedAttachments.push(file.getBlob());
      } else if (attachment.base64_data && attachment.filename) {
        // Attachment dari base64 data
        const blob = Utilities.newBlob(
          Utilities.base64Decode(attachment.base64_data),
          attachment.mime_type || 'application/octet-stream',
          attachment.filename
        );
        processedAttachments.push(blob);
      }
    } catch (error) {
      console.error('Error processing attachment:', error);
    }
  }
  
  return processedAttachments;
}

/**
 * Rate limiting check
 */
function checkRateLimit() {
  const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const key = `rate_limit_${today}`;
  
  const properties = PropertiesService.getScriptProperties();
  const currentCount = parseInt(properties.getProperty(key) || '0');
  
  if (currentCount >= CONFIG.RATE_LIMIT) {
    return false;
  }
  
  properties.setProperty(key, (currentCount + 1).toString());
  return true;
}

/**
 * Get request count for today
 */
function getRequestCount() {
  const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const key = `rate_limit_${today}`;
  
  const properties = PropertiesService.getScriptProperties();
  return parseInt(properties.getProperty(key) || '0');
}

/**
 * Log email sent
 */
function logEmailSent(to, subject, messageId = null, additionalData = {}) {
  const timestamp = new Date().toISOString();
  const logData = {
    timestamp: timestamp,
    to: to,
    subject: subject,
    messageId: messageId,
    status: 'sent',
    ...additionalData
  };
  
  console.log('Email sent:', JSON.stringify(logData));
  
  // Simpan ke spreadsheet log
  if (CONFIG.ENABLE_SPREADSHEET_LOG) {
    saveToLogSheet(logData, 'email_log');
  }
}

/**
 * Log API request
 */
function logApiRequest(method, endpoint, status, message, additionalData = {}) {
  const timestamp = new Date().toISOString();
  const logData = {
    timestamp: timestamp,
    method: method,
    endpoint: endpoint,
    status: status,
    message: message,
    ip: getClientIP(),
    user_agent: getUserAgent(),
    ...additionalData
  };
  
  console.log('API Request:', JSON.stringify(logData));
  
  // Simpan ke spreadsheet log
  if (CONFIG.ENABLE_SPREADSHEET_LOG) {
    saveToLogSheet(logData, 'api_log');
  }
}

/**
 * Log error
 */
function logError(error, context = '', additionalData = {}) {
  const timestamp = new Date().toISOString();
  const logData = {
    timestamp: timestamp,
    error: error.toString(),
    context: context,
    stack: error.stack || '',
    ...additionalData
  };
  
  console.error('Error logged:', JSON.stringify(logData));
  
  // Simpan ke spreadsheet log
  if (CONFIG.ENABLE_SPREADSHEET_LOG) {
    saveToLogSheet(logData, 'error_log');
  }
}

/**
 * Simpan data ke spreadsheet log
 */
function saveToLogSheet(data, sheetName) {
  try {
    const spreadsheet = SpreadsheetApp.openById(CONFIG.LOG_SPREADSHEET_ID);
    let sheet = spreadsheet.getSheetByName(sheetName);
    
    // Buat sheet jika belum ada
    if (!sheet) {
      sheet = createLogSheet(spreadsheet, sheetName);
    }
    
    // Konversi data ke array untuk row
    const row = convertDataToRow(data, sheetName);
    
    // Tambahkan row ke sheet
    sheet.appendRow(row);
    
    // Auto-resize columns jika perlu
    autoResizeColumns(sheet);
    
  } catch (error) {
    console.error('Error saving to log sheet:', error);
    // Jangan throw error agar tidak mengganggu proses utama
  }
}

/**
 * Buat sheet log baru dengan headers
 */
function createLogSheet(spreadsheet, sheetName) {
  const sheet = spreadsheet.insertSheet(sheetName);
  
  let headers = [];
  
  switch (sheetName) {
    case 'email_log':
      headers = [
        'Timestamp', 'To', 'Subject', 'Message ID', 'Status', 
        'From Name', 'CC', 'BCC', 'Has Attachments', 'Request IP'
      ];
      break;
      
    case 'api_log':
      headers = [
        'Timestamp', 'Method', 'Endpoint', 'Status', 'Message', 
        'IP Address', 'User Agent', 'Response Time', 'Request Size'
      ];
      break;
      
    case 'error_log':
      headers = [
        'Timestamp', 'Error', 'Context', 'Stack Trace', 
        'IP Address', 'User Agent', 'Additional Info'
      ];
      break;
      
    default:
      headers = ['Timestamp', 'Data'];
  }
  
  // Set headers
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  
  // Format header row
  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setFontWeight('bold');
  headerRange.setBackground('#f0f0f0');
  
  return sheet;
}

/**
 * Konversi data object ke array untuk spreadsheet row
 */
function convertDataToRow(data, sheetName) {
  switch (sheetName) {
    case 'email_log':
      return [
        data.timestamp || '',
        data.to || '',
        data.subject || '',
        data.messageId || '',
        data.status || '',
        data.from_name || '',
        data.cc || '',
        data.bcc || '',
        data.has_attachments ? 'Yes' : 'No',
        data.ip || ''
      ];
      
    case 'api_log':
      return [
        data.timestamp || '',
        data.method || '',
        data.endpoint || '',
        data.status || '',
        data.message || '',
        data.ip || '',
        data.user_agent || '',
        data.response_time || '',
        data.request_size || ''
      ];
      
    case 'error_log':
      return [
        data.timestamp || '',
        data.error || '',
        data.context || '',
        data.stack || '',
        data.ip || '',
        data.user_agent || '',
        JSON.stringify(data.additional_info || {})
      ];
      
    default:
      return [data.timestamp || '', JSON.stringify(data)];
  }
}

/**
 * Auto resize columns
 */
function autoResizeColumns(sheet) {
  const lastColumn = sheet.getLastColumn();
  for (let i = 1; i <= lastColumn; i++) {
    sheet.autoResizeColumn(i);
  }
}

/**
 * Get client IP (limited in Apps Script)
 */
function getClientIP() {
  // Apps Script tidak bisa mendapatkan real client IP
  // Hanya bisa mendapatkan Google's proxy IP
  return 'N/A';
}

/**
 * Get user agent (limited in Apps Script)
 */
function getUserAgent() {
  // Apps Script tidak bisa mendapatkan user agent dari HTTP request
  return 'N/A';
}

/**
 * Get log statistics
 */
function getLogStatistics() {
  try {
    const spreadsheet = SpreadsheetApp.openById(CONFIG.LOG_SPREADSHEET_ID);
    
    const stats = {
      email_log: 0,
      api_log: 0,
      error_log: 0,
      last_updated: new Date().toISOString()
    };
    
    // Count rows in each sheet
    const sheets = ['email_log', 'api_log', 'error_log'];
    
    for (const sheetName of sheets) {
      const sheet = spreadsheet.getSheetByName(sheetName);
      if (sheet) {
        stats[sheetName] = Math.max(0, sheet.getLastRow() - 1); // -1 untuk header
      }
    }
    
    return stats;
    
  } catch (error) {
    console.error('Error getting log statistics:', error);
    return { error: 'Unable to get statistics' };
  }
}

/**
 * Clear old logs (untuk maintenance)
 */
function clearOldLogs(daysToKeep = 30) {
  try {
    const spreadsheet = SpreadsheetApp.openById(CONFIG.LOG_SPREADSHEET_ID);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    
    const sheets = ['email_log', 'api_log', 'error_log'];
    let totalDeleted = 0;
    
    for (const sheetName of sheets) {
      const sheet = spreadsheet.getSheetByName(sheetName);
      if (!sheet) continue;
      
      const data = sheet.getDataRange().getValues();
      const headers = data[0];
      
      // Find rows to delete (older than cutoff date)
      const rowsToDelete = [];
      
      for (let i = 1; i < data.length; i++) {
        const timestamp = new Date(data[i][0]); // Assuming timestamp is in first column
        if (timestamp < cutoffDate) {
          rowsToDelete.push(i + 1); // +1 because sheet rows are 1-indexed
        }
      }
      
      // Delete rows from bottom to top to maintain indices
      rowsToDelete.reverse().forEach(rowIndex => {
        sheet.deleteRow(rowIndex);
        totalDeleted++;
      });
    }
    
    console.log(`Cleared ${totalDeleted} old log entries`);
    return { deleted: totalDeleted };
    
  } catch (error) {
    console.error('Error clearing old logs:', error);
    return { error: 'Unable to clear logs' };
  }
}

/**
 * Utility functions
 */
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function getHeaderValue(e, headerName) {
  if (e.parameter && e.parameter.headers) {
    const headers = JSON.parse(e.parameter.headers);
    return headers[headerName];
  }
  return null;
}

function generateMessageId() {
  return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create standardized success response
 */
function createSuccessResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data, null, 2))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Create standardized error response
 */
function createErrorResponse(statusCode, message, details = null) {
  const errorResponse = {
    success: false,
    error: {
      code: statusCode,
      message: message,
      details: details,
      timestamp: new Date().toISOString()
    },
    meta: {
      version: '1.0.0'
    }
  };

  logApiRequest('Error Response', `${statusCode}: ${message}`, 'ERROR');

  return ContentService
    .createTextOutput(JSON.stringify(errorResponse, null, 2))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Legacy function for backward compatibility
 */
function createResponse(statusCode, success, message, data) {
  if (success) {
    const response = {
      success: true,
      data: {
        ...data,
        status: statusCode,
        message: message
      },
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0.0'
      }
    };
    return createSuccessResponse(response);
  } else {
    return createErrorResponse(statusCode, message, data);
  }
}

/**
 * Fungsi untuk setup awal (jalankan sekali)
 */
function setupAPI() {
  console.log('Setting up Email API...');
  
  try {
    // Reset rate limit counter
    const properties = PropertiesService.getScriptProperties();
    const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
    properties.setProperty(`rate_limit_${today}`, '0');
    
    // Setup log spreadsheet
    if (CONFIG.ENABLE_SPREADSHEET_LOG) {
      setupLogSpreadsheet();
    }
    
    console.log('API setup completed');
    console.log('Deploy as web app to get the endpoint URL');
    
  } catch (error) {
    console.error('Error during setup:', error);
    logError(error, 'API setup');
  }
}

/**
 * Setup log spreadsheet dengan sheets yang diperlukan
 */
function setupLogSpreadsheet() {
  try {
    const spreadsheet = SpreadsheetApp.openById(CONFIG.LOG_SPREADSHEET_ID);
    
    // Buat sheets yang diperlukan
    const requiredSheets = ['email_log', 'api_log', 'error_log'];
    
    for (const sheetName of requiredSheets) {
      let sheet = spreadsheet.getSheetByName(sheetName);
      if (!sheet) {
        sheet = createLogSheet(spreadsheet, sheetName);
        console.log(`Created sheet: ${sheetName}`);
      }
    }
    
    // Buat summary sheet
    createSummarySheet(spreadsheet);
    
    console.log('Log spreadsheet setup completed');
    
  } catch (error) {
    console.error('Error setting up log spreadsheet:', error);
    throw error;
  }
}

/**
 * Buat summary sheet untuk dashboard
 */
function createSummarySheet(spreadsheet) {
  let summarySheet = spreadsheet.getSheetByName('Summary');
  
  if (!summarySheet) {
    summarySheet = spreadsheet.insertSheet('Summary', 0); // Insert at beginning
  } else {
    summarySheet.clear(); // Clear existing content
  }
  
  // Setup summary data
  const summaryData = [
    ['Email API - Log Summary', '', '', ''],
    ['', '', '', ''],
    ['Metric', 'Count', 'Last Updated', 'Status'],
    ['Total Emails Sent', '=COUNTA(email_log!A:A)-1', '=NOW()', 'Active'],
    ['Total API Requests', '=COUNTA(api_log!A:A)-1', '=NOW()', 'Active'],
    ['Total Errors', '=COUNTA(error_log!A:A)-1', '=NOW()', 'Monitoring'],
    ['', '', '', ''],
    ['Recent Activity (Last 24h)', '', '', ''],
    ['Recent Emails', '=COUNTIFS(email_log!A:A,">="&TODAY(),email_log!A:A,"<"&TODAY()+1)', '', ''],
    ['Recent Errors', '=COUNTIFS(error_log!A:A,">="&TODAY(),error_log!A:A,"<"&TODAY()+1)', '', ''],
    ['', '', '', ''],
    ['Configuration', '', '', ''],
    ['Rate Limit', CONFIG.RATE_LIMIT + ' requests/day', '', ''],
    ['Max Recipients', CONFIG.MAX_RECIPIENTS + ' per request', '', ''],
    ['Logging Enabled', CONFIG.ENABLE_SPREADSHEET_LOG ? 'Yes' : 'No', '', '']
  ];
  
  // Write data
  summarySheet.getRange(1, 1, summaryData.length, 4).setValues(summaryData);
  
  // Format header
  summarySheet.getRange(1, 1, 1, 4).merge();
  summarySheet.getRange(1, 1).setFontSize(16).setFontWeight('bold');
  
  // Format metric headers
  summarySheet.getRange(3, 1, 1, 4).setFontWeight('bold').setBackground('#e6f3ff');
  summarySheet.getRange(8, 1, 1, 4).setFontWeight('bold').setBackground('#fff2e6');
  summarySheet.getRange(12, 1, 1, 4).setFontWeight('bold').setBackground('#f0f8f0');
  
  // Auto resize columns
  autoResizeColumns(summarySheet);
}

/**
 * Fungsi test untuk development
 */
function testAPI() {
  const testData = {
    api_key: CONFIG.API_KEY,
    to: 'test@example.com',
    subject: 'Test Email from API',
    body: 'This is a test email sent from Google Apps Script API.',
    from_name: 'Test Sender'
  };
  
  const mockEvent = {
    postData: {
      contents: JSON.stringify(testData)
    },
    parameter: {}
  };
  
  const result = doPost(mockEvent);
  console.log('Test result:', result.getContent());
}
