export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { ticker } = req.query;
  if (!ticker) return res.status(400).json({ error: 'ticker is required' });

  const key = process.env.FINNHUB_KEY;
  if (!key) return res.status(500).json({ error: 'API key not configured' });

  const symbol = ticker.toUpperCase().trim();

  try {
    const [quoteRes, metricRes] = await Promise.all([
      fetch(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${key}`),
      fetch(`https://finnhub.io/api/v1/stock/metric?symbol=${symbol}&metric=all&token=${key}`)
    ]);

    const quote  = await quoteRes.json();
    const metric = await metricRes.json();

    if (!quote.c || quote.c === 0) {
      return res.status(404).json({ error: `Ticker "${symbol}" not found` });
    }

    return res.status(200).json({
      ticker: symbol,
      price:     quote.c,
      annualDiv: metric?.metric?.['dividendPerShareAnnual'] || 0,
      divYield:  metric?.metric?.['dividendYieldIndicatedAnnual'] || 0,
      sector:    '',
      source:    'Finnhub'
    });

  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch: ' + err.message });
  }
}