import https from 'https';

const INDEXNOW_KEY = 'drip-calculator-indexnow-2026';
const SITE_URL = 'https://drip-calculator-alpha.vercel.app';

function pingIndexNow() {
  try {
    const body = JSON.stringify({
      host: 'drip-calculator-alpha.vercel.app',
      key: INDEXNOW_KEY,
      keyLocation: `${SITE_URL}/api/indexnow-key`,
      urlList: [`${SITE_URL}/`],
    });
    const req = https.request({
      hostname: 'api.indexnow.org',
      path: '/indexnow',
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) },
    });
    req.on('error', () => {});
    req.write(body);
    req.end();
  } catch(e) {}
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { ticker } = req.query;
  if (!ticker) return res.status(400).json({ error: 'Ticker required' });

  const key = process.env.FINNHUB_KEY;
  if (!key) return res.status(500).json({ error: 'API key not configured' });

  const symbol = ticker.toUpperCase().trim();

  // Fire IndexNow ping in background — silent, non-blocking
  pingIndexNow();

  try {
    const [quoteRes, metricRes] = await Promise.all([
      fetch(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${key}`),
      fetch(`https://finnhub.io/api/v1/stock/metric?symbol=${symbol}&metric=all&token=${key}`)
    ]);

    const quote = await quoteRes.json();
    const metric = await metricRes.json();

    if (!quote.c || quote.c === 0) {
      return res.status(404).json({ error: `Ticker ${symbol} not found` });
    }

    return res.status(200).json({
      ticker: symbol,
      price: quote.c,
      annualDiv: metric?.metric?.['dividendPerShareAnnual'] ?? 0,
      divYield: metric?.metric?.['dividendYieldIndicatedAnnual'] ?? 0,
      sector: '',
      source: 'Finnhub'
    });

  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch data' });
  }
}
