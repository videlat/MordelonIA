// ─── PROJECT ANALYZER ─────────────────────────────────────────────────────────
const CODE_EXTS = new Set([
  'js','jsx','ts','tsx','vue','svelte',
  'py','rb','go','rs','java','kt','swift','dart','cpp','c','cs','php',
  'html','css','scss','sass','less',
  'json','yaml','yml','toml','env','example',
  'md','mdx','sh','bash','sql',
]);

const IGNORE_DIRS = new Set([
  'node_modules','.git','.next','.nuxt','dist','build','out',
  '__pycache__','.venv','venv','coverage','.cache','vendor','target','bin','obj',
]);

const MAX_FILE_SIZE   = 100 * 1024;
const MAX_TOTAL_CHARS = 80_000;

// ─── 1. LEER ZIP ──────────────────────────────────────────────────────────────
export const readZip = async (file) => {
  if (!window.JSZip) {
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
  }
  const zip = await window.JSZip.loadAsync(file);
  const files = [];

  for (const [path, zipEntry] of Object.entries(zip.files)) {
    if (zipEntry.dir) continue;
    const parts = path.split('/');
    if (parts.some(p => IGNORE_DIRS.has(p))) continue;
    const ext = path.split('.').pop()?.toLowerCase() || '';
    const filename = parts[parts.length - 1];
    if (!CODE_EXTS.has(ext) && !isConfigFile(filename)) continue;
    if ((zipEntry._data?.uncompressedSize || 0) > MAX_FILE_SIZE) continue;
    try {
      const content = await zipEntry.async('text');
      files.push({ path: path.replace(/\\/g, '/'), content, size: content.length, ext, language: extToLang(ext) });
    } catch (_) {}
  }

  return buildProjectData(file.name.replace(/\.zip$/i, ''), 'zip', files);
};

// ─── 2. LEER GITHUB ───────────────────────────────────────────────────────────
export const readGitHub = async (url) => {
  const match = url.match(/github\.com\/([^/]+)\/([^/\s]+?)(?:\.git)?(?:\/tree\/([^/\s]+))?(?:\s|$)/);
  if (!match) throw new Error('URL de GitHub inválida. Formato: https://github.com/usuario/repo');
  const [, owner, repo, branch = 'main'] = match;

  let treeRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`);
  if (!treeRes.ok) {
    treeRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/master?recursive=1`);
    if (!treeRes.ok) throw new Error(`No se pudo acceder al repo. ¿Es público? (${treeRes.status})`);
  }
  const tree = await treeRes.json();

  const toFetch = (tree.tree || []).filter(item => {
    if (item.type !== 'blob') return false;
    const parts = item.path.split('/');
    if (parts.some(p => IGNORE_DIRS.has(p))) return false;
    const ext = item.path.split('.').pop()?.toLowerCase() || '';
    return CODE_EXTS.has(ext) || isConfigFile(parts[parts.length - 1]);
  }).slice(0, 80);

  const files = [];
  for (let i = 0; i < toFetch.length; i += 10) {
    const batch = toFetch.slice(i, i + 10);
    const results = await Promise.allSettled(batch.map(async item => {
      const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${item.path}?ref=${branch}`);
      if (!res.ok) return null;
      const data = await res.json();
      if (!data.content) return null;
      const content = atob(data.content.replace(/\n/g, ''));
      if (content.length > MAX_FILE_SIZE) return null;
      const ext = item.path.split('.').pop()?.toLowerCase() || '';
      return { path: item.path, content, size: content.length, ext, language: extToLang(ext) };
    }));
    results.forEach(r => { if (r.status === 'fulfilled' && r.value) files.push(r.value); });
  }

  return buildProjectData(`${owner}/${repo}`, 'github', files);
};

// ─── 3. ARCHIVOS SUELTOS ──────────────────────────────────────────────────────
export const readLooseFiles = async (fileList) => {
  const files = [];
  for (const file of Array.from(fileList)) {
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (!CODE_EXTS.has(ext) && !isConfigFile(file.name)) continue;
    if (file.size > MAX_FILE_SIZE) continue;
    try {
      const content = await readText(file);
      files.push({ path: file.name, content, size: content.length, ext, language: extToLang(ext) });
    } catch (_) {}
  }
  return buildProjectData('proyecto', 'files', files);
};

// ─── BUILD PROJECT DATA ───────────────────────────────────────────────────────
const buildProjectData = (name, source, files) => {
  const packageJson = files.find(f => f.path.endsWith('package.json') && !f.path.includes('node_modules'));
  const readme      = files.find(f => /readme\.md$/i.test(f.path));

  let parsedPkg = null;
  try { if (packageJson) parsedPkg = JSON.parse(packageJson.content); } catch (_) {}

  const byExt = {};
  let totalLines = 0;
  files.forEach(f => {
    byExt[f.ext] = (byExt[f.ext] || 0) + 1;
    totalLines += f.content.split('\n').length;
  });

  const todos = [];
  files.forEach(f => {
    f.content.split('\n').forEach((line, i) => {
      if (/TODO|FIXME|HACK|XXX|BUG/i.test(line)) {
        todos.push({ file: f.path, line: i + 1, text: line.trim().slice(0, 120) });
      }
    });
  });

  const secretPatterns = [
    { name: 'API Key hardcodeada', re: /(api[_-]?key|apikey)\s*[=:]\s*['"][^'"]{8,}['"]/gi },
    { name: 'Token hardcodeado',   re: /(token|secret)\s*[=:]\s*['"][^'"]{8,}['"]/gi },
    { name: 'AWS Key',             re: /AKIA[0-9A-Z]{16}/g },
  ];
  const secrets = [];
  files.forEach(f => {
    if (f.path.includes('.env')) return;
    secretPatterns.forEach(({ name, re }) => {
      const matches = f.content.match(re);
      if (matches) secrets.push({ file: f.path, type: name, count: matches.length });
    });
  });

  return { name, source, files, stats: { totalFiles: files.length, totalLines, byExt, todos, secrets }, packageJson: parsedPkg, readme: readme?.content };
};

// ─── CONTEXTO PARA EL LLM ─────────────────────────────────────────────────────
export const buildProjectContext = (project) => {
  const { name, source, files, stats, packageJson } = project;
  const lines = [];

  lines.push('═══════════════════════════════════════');
  lines.push(`PROYECTO CARGADO: ${name} (fuente: ${source})`);
  lines.push('═══════════════════════════════════════');

  if (packageJson) {
    lines.push(`\n📦 package.json: ${packageJson.name || name} v${packageJson.version || '?'}`);
    if (packageJson.dependencies) lines.push(`  deps: ${Object.keys(packageJson.dependencies).join(', ')}`);
    if (packageJson.devDependencies) lines.push(`  devDeps: ${Object.keys(packageJson.devDependencies).join(', ')}`);
    if (packageJson.scripts) lines.push(`  scripts: ${Object.keys(packageJson.scripts).join(', ')}`);
  }

  lines.push(`\n📁 ${stats.totalFiles} archivos · ${stats.totalLines.toLocaleString()} líneas`);
  lines.push(buildTree(files.map(f => f.path)));

  if (stats.todos.length > 0) {
    lines.push(`\n⚠️ ${stats.todos.length} TODOs/FIXMEs`);
    stats.todos.slice(0, 10).forEach(t => lines.push(`  ${t.file}:${t.line} → ${t.text}`));
  }

  if (stats.secrets.length > 0) {
    lines.push(`\n🔴 POSIBLES SECRETS EXPUESTOS:`);
    stats.secrets.forEach(s => lines.push(`  ${s.file} — ${s.type}`));
  }

  if (project.readme) {
    lines.push(`\n📖 README:\n${project.readme.slice(0, 1200)}`);
  }

  lines.push('\n📄 ARCHIVOS:');
  let charCount = lines.join('\n').length;

  const prioritized = [
    ...files.filter(f => /^(index|main|app)\./i.test(f.path.split('/').pop())),
    ...files.filter(f => f.path.endsWith('package.json')),
    ...files.filter(f => !f.path.endsWith('package.json') && !/^(index|main|app)\./i.test(f.path.split('/').pop())),
  ].filter((f, i, arr) => arr.findIndex(x => x.path === f.path) === i);

  for (const file of prioritized) {
    if (charCount >= MAX_TOTAL_CHARS) {
      lines.push(`\n[... ${files.length} archivos en total, algunos omitidos por límite de contexto]`);
      break;
    }
    const block = `\n--- ${file.path} ---\n\`\`\`${file.language}\n${file.content}\n\`\`\``;
    charCount += block.length;
    lines.push(block);
  }

  lines.push('\n═══════════════════════════════════════');
  lines.push('Ahora tengo el proyecto completo en contexto. Preguntame lo que quieras.');

  return lines.join('\n');
};

// ─── REPORTE AUTOMÁTICO ───────────────────────────────────────────────────────
export const generateReport = async (project, apiKey) => {
  const { name, stats, packageJson, files } = project;
  const codeSample = files
    .filter(f => ['js','ts','jsx','tsx','py','rb','go'].includes(f.ext))
    .slice(0, 6)
    .map(f => `// ${f.path}\n${f.content.slice(0, 600)}`)
    .join('\n\n');

  const prompt = `Analizá este proyecto y generá un reporte técnico completo en Markdown. Sé directo, técnico, sin fluff. En español rioplatense.

PROYECTO: ${name}
ARCHIVOS: ${stats.totalFiles}, LÍNEAS: ${stats.totalLines}
PACKAGE: ${packageJson ? JSON.stringify(packageJson).slice(0, 800) : 'N/A'}
TODOs: ${stats.todos.length}, SECRETS: ${stats.secrets.length}
EXTENSIONES: ${Object.entries(stats.byExt).map(([k,v])=>`${k}(${v})`).join(', ')}
${stats.secrets.length > 0 ? 'SECRETS ENCONTRADOS: ' + stats.secrets.map(s=>`${s.file}: ${s.type}`).join(', ') : ''}

MUESTRA DE CÓDIGO:
${codeSample.slice(0, 5000)}

Generá el reporte con estas secciones exactas:
# 📊 Reporte: ${name}
## 🏗 Stack y Arquitectura
## 📈 Métricas de Calidad (incluí un score /100)
## 🔴 Problemas Críticos
## 🟡 Advertencias y Code Smells
## 🟢 Buenas Prácticas Detectadas
## 🏁 Top 5 Recomendaciones (ordenadas por impacto)
## 📝 TODOs Relevantes`;

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 3000,
        temperature: 0.2,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    const data = await res.json();
    return data.choices?.[0]?.message?.content || 'No se pudo generar el reporte.';
  } catch (e) {
    return `Error: ${e.message}`;
  }
};

// ─── UTILS ────────────────────────────────────────────────────────────────────
const loadScript = (src) => new Promise((res, rej) => {
  if (document.querySelector(`script[src="${src}"]`)) { res(); return; }
  const s = document.createElement('script');
  s.src = src; s.onload = res; s.onerror = rej;
  document.head.appendChild(s);
});

const readText = (file) => new Promise((res, rej) => {
  const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsText(file);
});

const isConfigFile = (name) => [
  'package.json','tsconfig.json','vite.config.js','vite.config.ts','next.config.js',
  'webpack.config.js','.env.example','.gitignore','dockerfile','docker-compose.yml',
  'requirements.txt','pyproject.toml','cargo.toml','go.mod','composer.json','gemfile',
].includes(name.toLowerCase());

const extToLang = (ext) => ({
  js:'javascript',jsx:'jsx',ts:'typescript',tsx:'tsx',py:'python',rb:'ruby',
  go:'go',rs:'rust',java:'java',kt:'kotlin',swift:'swift',cpp:'cpp',c:'c',
  cs:'csharp',php:'php',html:'html',css:'css',scss:'scss',sql:'sql',
  sh:'bash',yml:'yaml',yaml:'yaml',json:'json',md:'markdown',
}[ext] || ext);

const buildTree = (paths) => {
  const tree = {};
  paths.forEach(p => {
    const parts = p.split('/');
    let node = tree;
    parts.forEach((part, i) => {
      if (i === parts.length - 1) node[part] = null;
      else { node[part] = node[part] || {}; node = node[part]; }
    });
  });
  const render = (node, prefix = '', depth = 0) => {
    if (depth > 5) return '';
    return Object.entries(node || {}).slice(0, 50).map(([key, val], i, arr) => {
      const last = i === arr.length - 1;
      return `${prefix}${last ? '└── ' : '├── '}${key}${val !== null ? '/' : ''}\n${val ? render(val, prefix + (last ? '    ' : '│   '), depth + 1) : ''}`;
    }).join('');
  };
  return render(tree);
};
