/**
 * Shared Notion demo database links for all RLS Demo tools.
 */
(function (global) {
  const STYLE_ID = 'rls-demo-db-styles';

  global.RLS_DEMO_DB = {
    pubmed: {
      name: 'PubMed Research Extractor — Demo',
      url: 'https://www.notion.so/b34bd47e6a11414fbee75d51d79994e7',
    },
    adhd: {
      name: 'ADHD Treatment Study — Demo',
      url: 'https://www.notion.so/77e155aa30b94b5a9f28e9dc56448e63',
    },
  };

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .rls-demo-db-bar {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px 12px;
        padding: 10px 14px;
        border-radius: 10px;
        border: 1px solid var(--border, #e2e8f0);
        background: var(--bg-elevated, #fff);
        font-size: 12px;
        margin-bottom: 16px;
      }
      .rls-demo-db-bar.compact { padding: 8px 12px; margin-bottom: 12px; }
      .rls-demo-db-bar.sidebar {
        flex-direction: column;
        align-items: stretch;
        margin-bottom: 0;
        background: var(--bg, #f6f4ff);
      }
      .rls-demo-db-label {
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--text-muted, #64748b);
        font-size: 10px;
      }
      .rls-demo-db-link {
        font-weight: 600;
        text-decoration: none;
        padding: 5px 10px;
        border-radius: 8px;
        border: 1px solid transparent;
        transition: background 0.2s, border-color 0.2s;
      }
      .rls-demo-db-link.pubmed { color: #0d9488; background: rgba(13,148,136,0.08); }
      .rls-demo-db-link.adhd { color: #6366f1; background: rgba(99,102,241,0.08); }
      .rls-demo-db-link:hover { border-color: currentColor; text-decoration: underline; }
      html.dark .rls-demo-db-bar { background: var(--bg-elevated, #1a1830); }
    `;
    document.head.appendChild(style);
  }

  function renderBar(el) {
    injectStyles();
    const d = global.RLS_DEMO_DB;
    const variant = el.dataset.variant || '';
    el.className = `rls-demo-db-bar${variant ? ` ${variant}` : ''}`;
    el.innerHTML = `
      <span class="rls-demo-db-label">Demo databases (public link)</span>
      <a class="rls-demo-db-link pubmed" data-db="pubmed" href="${d.pubmed.url}" target="_blank" rel="noopener">${d.pubmed.name}</a>
      <a class="rls-demo-db-link adhd" data-db="adhd" href="${d.adhd.url}" target="_blank" rel="noopener">${d.adhd.name}</a>
    `;
  }

  global.mountDemoDbBar = function (selector, variant) {
    const el = typeof selector === 'string' ? document.querySelector(selector) : selector;
    if (!el) return;
    if (variant) el.dataset.variant = variant;
    renderBar(el);
  };

  global.syncDemoDbUrls = async function (apiBase) {
    try {
      const res = await fetch(`${apiBase || ''}/api/health`);
      if (!res.ok) return;
      const cfg = await res.json();
      if (cfg.notionDemoUrl) global.RLS_DEMO_DB.pubmed.url = cfg.notionDemoUrl;
      if (cfg.adhdDemoUrl) global.RLS_DEMO_DB.adhd.url = cfg.adhdDemoUrl;
      document.querySelectorAll('.rls-demo-db-bar').forEach(renderBar);
    } catch {
      /* ignore */
    }
  };

  global.renderAssistantMarkdown = function (text) {
    const lines = String(text || '').split('\n');
    let html = '';
    let inList = false;

    const esc = (s) => {
      const d = document.createElement('div');
      d.textContent = s;
      return d.innerHTML;
    };

    const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

    for (const raw of lines) {
      const t = raw.trim();
      if (!t) {
        if (inList) {
          html += '</ul>';
          inList = false;
        }
        continue;
      }
      const bullet = t.match(/^[*\-]\s+(.+)$/);
      if (bullet) {
        if (!inList) {
          html += '<ul>';
          inList = true;
        }
        html += `<li>${inline(bullet[1])}</li>`;
        continue;
      }
      if (inList) {
        html += '</ul>';
        inList = false;
      }
      if (t.startsWith('### ')) html += `<h4>${inline(t.slice(4))}</h4>`;
      else if (t.startsWith('## ')) html += `<h3>${inline(t.slice(3))}</h3>`;
      else html += `<p>${inline(t)}</p>`;
    }
    if (inList) html += '</ul>';
    return html || '<p></p>';
  };
})(window);
