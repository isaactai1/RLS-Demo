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
const NOTION_DATABASE_ID = toNotionUuid(
  process.env.NOTION_DATABASE_ID || 'b34bd47e-6a11-414f-bee7-5d51d79994e7'
);
const NOTION_DATA_SOURCE_ID = toNotionUuid(
  process.env.NOTION_DATA_SOURCE_ID || 'f9213e70-6aff-4b5f-8cf5-cf0e72db0382'
);
const NOTION_DEMO_URL =
  process.env.NOTION_DEMO_URL ||
  'https://www.notion.so/b34bd47e6a11414fbee75d51d79994e7';
const ADHD_DATA_SOURCE_ID = toNotionUuid(
  process.env.ADHD_DATA_SOURCE_ID || '43f2ce3e-5022-4549-9c59-1b4524bf5ea5'
);
const ADHD_DEMO_URL =
  process.env.ADHD_DEMO_URL ||
  'https://www.notion.so/77e155aa30b94b5a9f28e9dc56448e63';
const NOTION_API_VERSION = '2025-09-03';

let adhdPatientCache = { at: 0, rows: [] };
const ADHD_CACHE_MS = 60_000;

function toNotionUuid(id) {
  const s = String(id).replace(/-/g, '');
  if (s.length !== 32) return id;
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}

function parseNotionError(body) {
  try {
    const j = JSON.parse(body);
    if (j.code === 'object_not_found') {
      return (
        'Notion integration cannot access the demo database. ' +
        'Open the database → ⋯ → Connections → add your integration.'
      );
    }
    return j.message || body;
  } catch {
    return body;
  }
}

app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    app: 'rls-demo',
    poeConfigured: Boolean(POE_API_KEY),
    notionConfigured: Boolean(NOTION_TOKEN),
    model: POE_MODEL,
    notionDemoUrl: NOTION_DEMO_URL,
    adhdDemoUrl: ADHD_DEMO_URL,
    adhdConfigured: Boolean(NOTION_TOKEN && ADHD_DATA_SOURCE_ID),
    toolsManifest: fs.existsSync(path.join(ROOT, 'tools.js')),
  });
});

function extractNotionValue(prop) {
  if (!prop || !prop.type) return '';
  switch (prop.type) {
    case 'title':
      return (prop.title || []).map((t) => t.plain_text).join('');
    case 'rich_text':
      return (prop.rich_text || []).map((t) => t.plain_text).join('');
    case 'number':
      return prop.number ?? '';
    case 'select':
      return prop.select?.name || '';
    case 'multi_select':
      return (prop.multi_select || []).map((o) => o.name).join(', ');
    case 'url':
      return prop.url || '';
    default:
      return '';
  }
}

function pageToPatient(page) {
  const p = page.properties || {};
  const baseline = Number(extractNotionValue(p['ADHD-RS Baseline']));
  const latest = Number(extractNotionValue(p['ADHD-RS Latest']));
  return {
    patient_id: extractNotionValue(p['Patient ID']),
    age: extractNotionValue(p.Age),
    sex: extractNotionValue(p.Sex),
    adhd_subtype: extractNotionValue(p['ADHD Subtype']),
    treatment: extractNotionValue(p.Treatment),
    dose: extractNotionValue(p.Dose),
    weeks_on_tx: extractNotionValue(p['Weeks on Tx']),
    adhd_rs_baseline: baseline,
    adhd_rs_latest: latest,
    adhd_rs_change:
      Number.isFinite(baseline) && Number.isFinite(latest)
        ? baseline - latest
        : null,
    cgi_i: extractNotionValue(p['CGI-I']),
    adverse_events: extractNotionValue(p['Adverse Events']),
    follow_up: extractNotionValue(p['Follow-up']),
    site: extractNotionValue(p.Site),
    comorbidity: extractNotionValue(p.Comorbidity),
  };
}

async function fetchAdhdPatients(force = false) {
  if (!NOTION_TOKEN) {
    throw new Error('NOTION_TOKEN is not configured');
  }
  const now = Date.now();
  if (!force && adhdPatientCache.rows.length && now - adhdPatientCache.at < ADHD_CACHE_MS) {
    return adhdPatientCache.rows;
  }

  const rows = [];
  let cursor;

  do {
    const notionRes = await fetch(
      `https://api.notion.com/v1/data_sources/${ADHD_DATA_SOURCE_ID}/query`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${NOTION_TOKEN}`,
          'Content-Type': 'application/json',
          'Notion-Version': NOTION_API_VERSION,
        },
        body: JSON.stringify({
          page_size: 100,
          start_cursor: cursor,
        }),
      }
    );

    if (!notionRes.ok) {
      const errText = await notionRes.text();
      throw new Error(parseNotionError(errText));
    }

    const data = await notionRes.json();
    for (const page of data.results || []) {
      rows.push(pageToPatient(page));
    }
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);

  adhdPatientCache = { at: now, rows };
  return rows;
}

app.get('/api/adhd/patients', async (_req, res) => {
  try {
    const patients = await fetchAdhdPatients();
    res.json({ count: patients.length, patients, databaseUrl: ADHD_DEMO_URL });
  } catch (err) {
    res.status(503).json({ error: err.message, databaseUrl: ADHD_DEMO_URL });
  }
});

app.post('/api/adhd/ask', async (req, res) => {
  if (!POE_API_KEY) {
    return res.status(503).json({ error: 'POE_API_KEY is not configured on the server.' });
  }

  const question = String(req.body?.question || '').trim();
  if (!question) {
    return res.status(400).json({ error: 'question is required' });
  }

  try {
    const patients = await fetchAdhdPatients();
    const cohortJson = JSON.stringify(patients, null, 2);

    const systemPrompt = `You are a research assistant for a fictional ADHD pharmacotherapy cohort study (demo data only).
Answer questions using ONLY the patient database JSON provided. Be concise, structured, and cite patient IDs when relevant.
If data is insufficient, say so. Do not invent patients. Treat this as synthetic demo data for training/demos.
Use bullet points or short paragraphs. You may respond in English or Traditional Chinese if the user writes in Chinese.`;

    const userPrompt = `Patient database (${patients.length} rows):
${cohortJson}

Research question: ${question}`;

    const poeRes = await fetch('https://api.poe.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${POE_API_KEY}`,
      },
      body: JSON.stringify({
        model: POE_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.2,
        max_tokens: 1500,
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
    const answer = data.choices?.[0]?.message?.content || 'No response from model.';

    res.json({
      answer,
      patientCount: patients.length,
      databaseUrl: ADHD_DEMO_URL,
      model: POE_MODEL,
    });
  } catch (err) {
    console.error('adhd ask error:', err);
    res.status(500).json({ error: err.message, databaseUrl: ADHD_DEMO_URL });
  }
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

function buildNotionProperties(row) {
  const status = row.study_design === 'Error' ? 'Error' : 'Extracted';
  const yearNum = parseInt(String(row.year).replace(/\D/g, ''), 10);
  const pmid = String(row.pmid || '').trim();

  const properties = {
    Article: { type: 'title', title: notionTitle(row.title) },
    PMID: { type: 'rich_text', rich_text: notionRichText(pmid) },
    'Study Design': {
      type: 'rich_text',
      rich_text: notionRichText(row.study_design),
    },
    Cohort: { type: 'rich_text', rich_text: notionRichText(row.cohort) },
    'Sample Size': {
      type: 'rich_text',
      rich_text: notionRichText(row.sample_size),
    },
    Method: { type: 'rich_text', rich_text: notionRichText(row.method) },
    Status: { type: 'select', select: { name: status } },
  };

  if (/^\d+$/.test(pmid)) {
    properties['PubMed URL'] = {
      type: 'url',
      url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
    };
  }

  if (!Number.isNaN(yearNum) && yearNum > 0) {
    properties.Year = { type: 'number', number: yearNum };
  }

  return properties;
}

async function createNotionPage(row) {
  const body = {
    parent: {
      type: 'data_source_id',
      data_source_id: NOTION_DATA_SOURCE_ID,
    },
    properties: buildNotionProperties(row),
  };

  const notionRes = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${NOTION_TOKEN}`,
      'Content-Type': 'application/json',
      'Notion-Version': NOTION_API_VERSION,
    },
    body: JSON.stringify(body),
  });

  if (notionRes.ok) {
    return { ok: true, page: await notionRes.json() };
  }

  const errText = await notionRes.text();
  return { ok: false, status: notionRes.status, error: parseNotionError(errText) };
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
    try {
      const result = await createNotionPage(row);
      if (result.ok) {
        created.push({
          pmid: row.pmid,
          url: result.page.url,
          id: result.page.id,
        });
      } else {
        errors.push({ pmid: row.pmid, error: result.error, status: result.status });
      }
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
