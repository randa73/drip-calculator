// api/index-ping.js
// Vercel cron job — pings Google Indexing API every 40 minutes
// Sends email via Resend when Google confirms indexing

const https = require('https');

const URL_TO_INDEX = 'https://drip-calculator-alpha.vercel.app/';
const NOTIFY_EMAIL = 'armando.martellini@gmail.com';

function getAccessToken(credentials) {
  return new Promise((resolve, reject) => {
    const now     = Math.floor(Date.now() / 1000);
    const header  = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({
      iss:   credentials.client_email,
      scope: 'https://www.googleapis.com/auth/indexing',
      aud:   'https://oauth2.googleapis.com/token',
      exp:   now + 3600,
      iat:   now,
    })).toString('base64url');

    const crypto = require('crypto');
    const sign   = crypto.createSign('RSA-SHA256');
    sign.update(`${header}.${payload}`);
    const signature = sign.sign(credentials.private_key, 'base64url');
    const jwt = `${header}.${payload}.${signature}`;

    const body = new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion:  jwt,
    }).toString();

    const req = https.request({
      hostname: 'oauth2.googleapis.com',
      path:     '/token',
      method:   'POST',
      headers: {
        'Content-Type':   'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const parsed = JSON.parse(data);
        if (parsed.access_token) resolve(parsed.access_token);
        else reject(new Error('Token error: ' + data));
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function pingGoogle(token) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ url: URL_TO_INDEX, type: 'URL_UPDATED' });
    const req  = https.request({
      hostname: 'indexing.googleapis.com',
      path:     '/v3/urlNotifications:publish',
      method:   'POST',
      headers: {
        'Content-Type':   'application/json',
        'Authorization':  `Bearer ${token}`,
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function sendEmail(subject, html) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      from:    'DRIP Indexing Agent <onboarding@resend.dev>',
      to:      [NOTIFY_EMAIL],
      subject: subject,
      html:    html,
    });

    const req = https.request({
      hostname: 'api.resend.com',
      path:     '/emails',
      method:   'POST',
      headers: {
        'Content-Type':   'application/json',
        'Authorization':  `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

module.exports = async (req, res) => {
  const timestamp = new Date().toISOString();

  try {
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
    const token       = await getAccessToken(credentials);
    const result      = await pingGoogle(token);
    const parsed      = JSON.parse(result.body);

    console.log(`[${timestamp}] Indexing ping: ${result.status} — ${result.body}`);

    if (result.status === 200 && parsed.urlNotificationMetadata) {
      const notifyTime = parsed.urlNotificationMetadata.latestUpdate?.notifyTime;
      if (notifyTime && process.env.RESEND_API_KEY) {
        console.log(`[${timestamp}] ✅ Indexed! Sending email notification...`);
        await sendEmail(
          '🎉 Your DRIP Calculator is Indexed by Google!',
          `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
            <h2 style="color:#16a34a;">✅ Google Has Indexed Your Site!</h2>
            <p>Your DRIP Calculator is now indexed by Google.</p>
            <table style="width:100%;border-collapse:collapse;margin:16px 0;">
              <tr>
                <td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold;">URL</td>
                <td style="padding:8px;border:1px solid #e5e7eb;">${URL_TO_INDEX}</td>
              </tr>
              <tr>
                <td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold;">Indexed at</td>
                <td style="padding:8px;border:1px solid #e5e7eb;">${new Date(notifyTime).toLocaleString()}</td>
              </tr>
            </table>
            <p>Your site should start appearing in Google Search within 24–48 hours.</p>
            <p style="color:#6b7280;font-size:12px;">— DRIP Indexing Agent</p>
          </div>
          `
        );
      }
    }

    return res.status(200).json({ success: result.status === 200, status: result.status, timestamp, response: parsed });

  } catch (err) {
    console.error(`[${timestamp}] Error:`, err.message);
    return res.status(500).json({ error: err.message });
  }
};

// api/index-ping.js
// Vercel serverless function + cron job
// Pings Google Indexing API to request indexing for the DRIP calculator

const https = require('https');

const URL_TO_INDEX = 'https://drip-calculator-alpha.vercel.app/';

function getAccessToken(credentials) {
  return new Promise((resolve, reject) => {
    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({
      iss: credentials.client_email,
      scope: 'https://www.googleapis.com/auth/indexing',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now,
    })).toString('base64url');

    const crypto = require('crypto');
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(`${header}.${payload}`);
    const signature = sign.sign(credentials.private_key, 'base64url');
    const jwt = `${header}.${payload}.${signature}`;

    const body = new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }).toString();

    const req = https.request({
      hostname: 'oauth2.googleapis.com',
      path: '/token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const parsed = JSON.parse(data);
        if (parsed.access_token) resolve(parsed.access_token);
        else reject(new Error('Token error: ' + data));
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function pingGoogle(token) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ url: URL_TO_INDEX, type: 'URL_UPDATED' });
    const req = https.request({
      hostname: 'indexing.googleapis.com',
      path: '/v3/urlNotifications:publish',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

module.exports = async (req, res) => {
  // Security: only allow Vercel cron calls (or manual GET for testing)
  const authHeader = req.headers['authorization'];
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && req.method !== 'GET') {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
    const token = await getAccessToken(credentials);
    const result = await pingGoogle(token);
    const timestamp = new Date().toISOString();

    console.log(`[${timestamp}] Indexing ping: ${result.status} — ${result.body}`);

    return res.status(200).json({
      success: result.status === 200,
      status: result.status,
      timestamp,
      response: JSON.parse(result.body),
    });
  } catch (err) {
    console.error('Indexing ping error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
