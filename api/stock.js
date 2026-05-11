import https from 'https';

const INDEXNOW_KEY = 'drip-calculator-indexnow-2026';
const SITE_URL = 'https://drip-calculator-one.vercel.app';

// ── DIV_TABLE fallback ─────────────────────────────────────────────────────
// Annual dividend per share. Used when Finnhub returns 0 or no data.
const DIV_TABLE = {
  // High-yield / covered-call ETFs
  JEPI:  6.84,  JEPQ:  4.32,  SPYI:  5.88,  QQQI:  6.00,
  QYLD:  1.44,  RYLD:  1.44,  XYLD:  1.80,  GPIQ:  4.80,
  SVOL:  3.60,  TSLY:  6.00,  MSFO:  4.80,  NVDY:  6.00,
  AMZY:  4.80,  GOOGY: 4.80,  MSTY: 12.00,  CONY: 12.00,
  OARK:  4.80,  SNOY:  4.80,  DISO:  4.80,  YMAX:  6.00,
  YMAG:  6.00,  FEPI:  6.00,  AIPI:  6.00,

  // Dividend growth / blue chip ETFs
  SCHD:  2.68,  VYM:   3.52,  DVY:   4.80,  HDV:   4.32,
  DGRO:  1.44,  VIG:   1.68,  DGRW:  1.44,  SDY:   3.60,
  NOBL:  2.40,  SPHD:  2.40,

  // Bond / income ETFs
  PFFD:  1.44,  PFF:   1.56,  JNK:   3.60,  HYG:   3.60,
  LQD:   3.00,  BND:   2.40,  AGG:   2.16,  VCIT:  2.40,
  VCSH:  2.16,  BSV:   2.16,  BNDX:  1.80,  EMB:   3.60,
  MUB:   1.80,  VTEB:  1.80,

  // REITs
  O:     3.07,  MAIN:  2.76,  STAG:  1.47,  WPC:   3.40,
  NNN:   2.28,  VICI:  1.66,  AMT:   6.48,  PLD:   1.92,
  REIT:  1.80,  VNQ:   3.60,  SCHH:  1.80,  RQI:   1.08,

  // MLPs / Energy
  EPD:   1.98,  ET:    1.24,  MMP:   2.75,  PAA:   1.32,
  MPLX:  2.82,  ENB:   3.55,  TRP:   3.48,

  // Individual dividend stocks
  T:     1.11,  VZ:    2.66,  MO:    3.92,  PM:    5.08,
  BTI:   3.44,  KO:    1.84,  PEP:   5.06,  PG:    3.76,
  JNJ:   4.76,  MMM:   5.96,  IBM:   6.64,  CVX:   6.52,
  XOM:   3.80,  COP:   1.78,  OKE:   3.96,  WMB:   1.90,
  D:     2.67,  SO:    2.80,  DUK:   4.10,  NEE:   1.87,
  AEP:   3.52,  EXC:   1.52,  PFE:   1.68,  ABBV:  6.32,
  MRK:   3.08,  BMY:   2.44,  AVGO:  5.25,  TXN:   6.24,
  INTC:  1.00,  WBA:   1.00,  CAT:   5.20,  DE:    5.40,
  HON:   4.40,  EMR:   2.10,  ITW:   5.60,  GPC:   4.04,
  LOW:   4.40,  HD:    9.00,  WMT:   0.83,  TGT:   4.40,

  // Preferred shares (sample)
  'BAC-PL': 1.45, 'JPM-PC': 1.50, 'WFC-PL': 1.50,
};

function pingIndexNow() {
  try {
    const body = JSON.stringify({
      host: 'drip-calculator-one.vercel.app',
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
      // Try DIV_TABLE fallback
      if (DIV_TABLE[symbol]) {
        return res.status(200).json({
          ticker: symbol,
          price: 0,
          annualDiv: DIV_TABLE[symbol],
          divYield: 0,
          sector: '',
          source: 'DIV_TABLE'
        });
      }
      return res.status(404).json({ error: `Ticker ${symbol} not found` });
    }

    // Use Finnhub data, but fall back to DIV_TABLE for dividend if Finnhub returns 0
    const annualDiv = metric?.metric?.['dividendPerShareAnnual'] || DIV_TABLE[symbol] || 0;
    const divYield  = metric?.metric?.['dividendYieldIndicatedAnnual'] || 0;

    return res.status(200).json({
      ticker: symbol,
      price: quote.c,
      annualDiv,
      divYield,
      sector: '',
      source: 'Finnhub'
    });
  } catch (err) {
    // Last resort: DIV_TABLE only
    if (DIV_TABLE[symbol]) {
      return res.status(200).json({
        ticker: symbol,
        price: 0,
        annualDiv: DIV_TABLE[symbol],
        divYield: 0,
        sector: '',
        source: 'DIV_TABLE'
      });
    }
    return res.status(500).json({ error: 'Failed to fetch data' });
  }
}
