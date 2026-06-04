const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const INDEX_FILE = path.join(ROOT, 'Index.html');

const POE_API_KEY = process.env.POE_API_KEY;
const POE_MODEL = process.env.POE_MODEL || 'gemini-3.1-flash-lite';
const NOTION_TOKEN = process.env.NOTION_TOKEN;
const NOTION_DATABASE_ID = (
  process.env.NOTION_DATABASE_ID || 'b34bd47e6a11414fbee75d51d79994e7'
).replace(/-/g, '');
const NOTION_DEMO_URL =
  process.env.NOTION_DEMO_URL ||
  'https://www.notion.so/b34bd47e6a11414fbee75d51d79994e7';

app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    app: 'rls-demo',
    poeConfigured: Boolean(POE_API_KEY),
    notionConfigured: Boolean(NOTION_TOKEN),
    model: POE_MODEL,
    notionDemoUrl: NOTION_DEMO_URL,
    toolsManifest: fs.existsSync(path.join(ROOT, 'tools.js')),
  });
});

app.post('/api/extract', async (req, res) => {
  if (!POE_API_KEY) {
    return res.status(503).json({
      error: 'POE_API_KEY is not configured on the server.',
    });
  }

  const { pmid, title, abstract, year } = req.body || {};
  if (!title || !abstract) {
    return res.status(400).json({ error: 'title and abstract are required' });
  }

  const prompt = `Analyze this research article and return ONLY a JSON object:

{
  "study_design": "type of study",
  "cohort": "study population",
  "sample_size": "number of participants",
  "method": "main methodology (brief)",
  "year": "publication year"
}

Use "Not specified" when unclear.

Title: ${title}

Abstract: ${abstract}`;

  try {
    const poeRes = await fetch('https://api.poe.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${POE_API_KEY}`,
      },
      body: JSON.stringify({
        model: POE_MODEL,
        messages: [
          {
            role: 'system',
            content:
              'You extract structured research metadata from academic abstracts. Respond with valid JSON only.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.1,
        max_tokens: 1000,
      }),
    });

    if (!poeRes.ok) {
      const errText = await poeRes.text();
      return res.status(poeRes.status).json({
        error: `Poe API error: ${poeRes.status}`,
        detail: errText.slice(0, 500),
      });
    }

    const data = await poeRes.json();
    const content = data.choices?.[0]?.message?.content || '';
    let extractedInfo;
    try {
      extractedInfo = JSON.parse(content);
    } catch {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return res.status(502).json({ error: 'Invalid JSON from Poe model' });
      }
      extractedInfo = JSON.parse(jsonMatch[0]);
    }

    res.json({
      pmid: pmid || '',
      title,
      study_design: extractedInfo.study_design || 'Not specified',
      cohort: extractedInfo.cohort || 'Not specified',
      sample_size: extractedInfo.sample_size || 'Not specified',
      method: extractedInfo.method || 'Not specified',
      year: extractedInfo.year || year || 'Not specified',
    });
  } catch (err) {
    console.error('extract error:', err);
    res.status(500).json({ error: err.message });
  }
});

function notionRichText(value) {
  return [{ type: 'text', text: { content: String(value || '').slice(0, 2000) } }];
}

function notionTitle(value) {
  return [{ type: 'text', text: { content: String(value || 'Untitled').slice(0, 2000) } }];
}

app.post('/api/notion/upload', async (req, res) => {
  if (!NOTION_TOKEN) {
    return res.status(503).json({
      error:
        'NOTION_TOKEN is not configured. Create a Notion integration and share the demo database with it.',
    });
  }

  const rows = req.body?.rows;
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: 'rows array is required' });
  }

  const created = [];
  const errors = [];

  for (const row of rows) {
    const status = row.study_design === 'Error' ? 'Error' : 'Extracted';
    const yearNum = parseInt(String(row.year).replace(/\D/g, ''), 10);

    const properties = {
      Article: { title: notionTitle(row.title) },
      PMID: { rich_text: notionRichText(row.pmid) },
      'Study Design': { rich_text: notionRichText(row.study_design) },
      Cohort: { rich_text: notionRichText(row.cohort) },
      'Sample Size': { rich_text: notionRichText(row.sample_size) },
      Method: { rich_text: notionRichText(row.method) },
      Status: { select: { name: status } },
      'PubMed URL': {
        url: `https://pubmed.ncbi.nlm.nih.gov/${row.pmid}/`,
      },
    };

    if (!Number.isNaN(yearNum) && yearNum > 0) {
      properties.Year = { number: yearNum };
    }

    try {
      const notionRes = await fetch('https://api.notion.com/v1/pages', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${NOTION_TOKEN}`,
          'Content-Type': 'application/json',
          'Notion-Version': '2022-06-28',
        },
        body: JSON.stringify({
          parent: { database_id: NOTION_DATABASE_ID },
          properties,
        }),
      });

      if (!notionRes.ok) {
        const errBody = await notionRes.text();
        errors.push({ pmid: row.pmid, error: errBody.slice(0, 300) });
        continue;
      }

      const page = await notionRes.json();
      created.push({ pmid: row.pmid, url: page.url, id: page.id });
    } catch (err) {
      errors.push({ pmid: row.pmid, error: err.message });
    }
  }

  res.json({ created, errors, notionDemoUrl: NOTION_DEMO_URL });
});

function sendIndex(_req, res) {
  res.sendFile(INDEX_FILE);
}

app.get(['/', '/index.html', '/Index.html'], sendIndex);

app.use(
  express.static(ROOT, {
    index: false,
    setHeaders(res, filePath) {
      if (filePath.endsWith('.html')) {
        res.setHeader('X-Frame-Options', 'SAMEORIGIN');
      }
    },
  })
);

app.use((req, res, next) => {
  if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
  const decoded = decodeURIComponent(req.path);
  const candidate = path.join(ROOT, decoded.replace(/^\//, ''));
  if (candidate.startsWith(ROOT) && fs.existsSync(candidate) && candidate.endsWith('.html')) {
    return res.sendFile(candidate);
  }
  next();
});

app.listen(PORT, () => {
  console.log(`RLS Demo running on port ${PORT}`);
  console.log(`  Home: http://localhost:${PORT}/`);
  if (!POE_API_KEY) console.warn('  POE_API_KEY not set');
  if (!NOTION_TOKEN) console.warn('  NOTION_TOKEN not set');
});
