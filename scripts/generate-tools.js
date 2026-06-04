#!/usr/bin/env node
/**
 * Regenerate tools.js from HTML files in subfolders (Linux/Render build).
 * Mirrors generate.bat behavior; skips root index files.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUTPUT = path.join(ROOT, 'tools.js');
const SKIP_NAMES = new Set(['index.html', 'index.htm']);

function capitalizeWords(name) {
  return name
    .replace(/[-_]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

const SKIP_DIRS = new Set(['node_modules', 'scripts', '.git']);

function walkHtml(dir, baseDir, results) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
      walkHtml(full, baseDir, results);
      continue;
    }
    if (!entry.name.toLowerCase().endsWith('.html')) continue;
    if (SKIP_NAMES.has(entry.name.toLowerCase())) continue;

    const relDir = path.relative(baseDir, dir);
    if (!relDir || relDir.startsWith('..')) continue;

    const category = relDir.split(path.sep)[0];
    const relpath = path.join(relDir, entry.name).split(path.sep).join('/');
    const displayName = capitalizeWords(path.basename(entry.name, '.html'));

    results.push({
      category,
      name: displayName,
      path: relpath,
      fileName: entry.name,
    });
  }
}

const tools = [];
walkHtml(ROOT, ROOT, tools);

tools.sort((a, b) =>
  a.category.localeCompare(b.category) || a.path.localeCompare(b.path)
);

const byCategory = new Map();
for (const t of tools) {
  if (!byCategory.has(t.category)) byCategory.set(t.category, []);
  byCategory.get(t.category).push(t);
}

const timestamp = new Date().toLocaleString('en-GB', { hour12: false });
const categories = [...byCategory.entries()].map(([name, list]) => ({
  name,
  tools: list.map(({ name: toolName, path: toolPath, fileName }) => ({
    name: toolName,
    path: toolPath,
    fileName,
  })),
}));

const payload = {
  lastUpdated: timestamp,
  categories,
};

const js = `// Tools data - auto-generated from folder structure
// Last updated: ${timestamp}
window.toolsData = ${JSON.stringify(payload, null, 2)};
`;

fs.writeFileSync(OUTPUT, js, 'utf8');
console.log(`Generated ${OUTPUT} (${tools.length} tools, ${categories.length} categories)`);
