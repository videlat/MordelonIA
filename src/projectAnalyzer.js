// ─── PROJECT ANALYZER ────────────────────────────────────────────────────────
// Exports: analyzeFromZip, analyzeFromFiles, analyzeFromGitHub,
//          formatProjectContext, buildAnalysisPrompt

const CODE_EXTS = new Set([
  'js','jsx','ts','tsx','vue','svelte','py','java','go','rs','rb','php',
  'cs','cpp','c','h','swift','kt','dart','scala','r','lua','sh','bash',
  'html','css','scss','sass','less','json','yaml','yml','toml',
  'md','mdx','sql','graphql','prisma','proto'
]);

const CONFIG_FILES = new Set([
  'package.json','package-lock.json','yarn.lock','pnpm-lock.yaml',
  'requirements.txt','pyproject.toml','Pipfile','go.mod','go.sum',
  'Cargo.toml','Gemfile','composer.json','pom.xml','build.gradle',
  'dockerfile','docker-compose.yml','docker-compose.yaml',
  '.env.example','.env.sample','tsconfig.json','jsconfig.json',
  'vite.config.js','vite.config.ts','webpack.config.js','next.config.js',
  '.eslintrc','eslintrc.json','.prettierrc','jest.config.js','vitest.config.ts',
  'tailwind.config.js','tailwind.config.ts',
]);

const SKIP_DIRS = new Set([
  'node_modules','.git','.next','.nuxt','dist','build','out',
  '__pycache__','.pytest_cache','.venv','venv','env',
  'vendor','coverage','.coverage','target','bin','obj',
]);

const getExt = (name) => name.split('.').pop().toLowerCase();
const isCode = (name) => CODE_EXTS.has(getExt(name));
const isConf = (name) => CONFIG_FILES.has(name.toLowerCase()) || CONFIG_FILES.has(name.split('/').pop().toLowerCase());

const readAsText = (file) => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(r.result);
  r.onerror = rej;
  r.readAsText(file);
});

const loadScript = (src) => new Promise((res, rej) => {
  if (document.querySelector(`script[src="${src}"]`)) { res(); return; }
  const s = document.createElement('script');
  s.src = src; s.onload = res; s.onerror = rej;
  document.head.appendChild(s);
});

const detectStack = (files) => {
  const pkg = files.find(f => f.name === 'package.json');
  const stack = [];
  if (pkg?.content) {
    try {
      const p = JSON.parse(pkg.content);
      const deps = { ...p.dependencies, ...p.devDependencies };
      if (deps.react)           stack.push('React');
      if (deps.vue)             stack.push('Vue');
      if (deps.svelte)          stack.push('Svelte');
      if (deps.next)            stack.push('Next.js');
      if (deps.nuxt)            stack.push('Nuxt');
      if (deps.express)         stack.push('Express');
      if (deps.fastify)         stack.push('Fastify');
      if (deps['@nestjs/core']) stack.push('NestJS');
      if (deps.typescript || deps['ts-node']) stack.push('TypeScript');
      if (deps.tailwindcss)     stack.push('Tailwind');
      if (deps.prisma || deps['@prisma/client']) stack.push('Prisma');
      if (deps.firebase)        stack.push('Firebase');
      if (deps.vite)            stack.push('Vite');
      if (deps.jest || deps.vitest) stack.push('Testing');
    } catch (_) {}
  }
  if (files.some(f => f.name === 'requirements.txt')) stack.push('Python');
  if (files.some(f => f.name === 'go.mod'))           stack.push('Go');
  if (files.some(f => f.name === 'Cargo.toml'))       stack.push('Rust');
  return stack.length ? stack : ['Desconocido'];
};

const buildTree = (paths) => {
  const lines = [];
  const seen  = new Set();
  [...paths].sort().forEach(path => {
    path.split('/').forEach((part, depth, arr) => {
      const key = arr.slice(0, depth + 1).join('/');
      if (!seen.has(key)) {
        seen.add(key);
        lines.push(`${'  '.repeat(depth)}${depth === arr.length - 1 ? '📄' : '📁'} ${part}`);
      }
    });
  });
  return lines.slice(0, 200).join('\n');
};

const buildProjectData = (source, name, files) => {
  const codeFiles   = files.filter(f => f.isCode && f.content);
  const configFiles = files.filter(f => f.isConfig && f.content);
  const stack       = detectStack(files);
  const tree        = buildTree(files.map(f => f.path));
  const totalLines  = codeFiles.reduce((acc, f) => acc + (f.content?.split('\n').length || 0), 0);
  const todos       = [];
  codeFiles.forEach(f => {
    (f.content?.split('\n') || []).forEach((line, i) => {
      if (/TODO|FIXME|HACK|XXX|BUG|TEMP/i.test(line)) {
        todos.push({ file: f.path, line: i + 1, text: line.trim().slice(0, 100) });
      }
    });
  });
  return {
    source, name, files, codeFiles, configFiles, stack, tree,
    todos: todos.slice(0, 30),
    stats: {
      totalFiles: files.length,
      codeFiles: codeFiles.length,
      totalLines,
      totalSize: files.reduce((a, f) => a + f.size, 0),
      todos: todos.length,
    },
  };
};

export const analyzeFromZip = async (file) => {
  if (!window.JSZip) {
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
  }
  const JSZip = window.JSZip;
  const zip = await JSZip.loadAsync(file);
  const files = [];
  for (const [path, zipEntry] of Object.entries(zip.files)) {
    if (zipEntry.dir) continue;
    const parts = path.split('/');
    if (parts.some(p => SKIP_DIRS.has(p))) continue;
    const name = parts[parts.length - 1];
    if (!name) continue;
    if (isCode(name) || isConf(name)) {
      try {
        const content = await zipEntry.async('string');
        files.push({ path, name, ext: getExt(name), content: content.slice(0, 100000), size: content.length, isCode: isCode(name), isConfig: isConf(name), truncated: content.length > 100000 });
      } catch (_) {}
    } else {
      files.push({ path, name, ext: getExt(name), content: null, size: 0, isCode: false, isConfig: false });
    }
  }
  return buildProjectData('zip', file.name.replace(/\.zip$/i, ''), files);
};

export const analyzeFromFiles = async (fileList) => {
  const files = [];
  for (const f of Array.from(fileList)) {
    if (isCode(f.name) || isConf(f.name)) {
      try {
        const content = await readAsText(f);
        files.push({ path: f.name, name: f.name, ext: getExt(f.name), content: content.slice(0, 100000), size: content.length, isCode: isCode(f.name), isConfig: isConf(f.name) });
      } catch (_) {}
    }
  }
  return buildProjectData('files', 'Proyecto', files);
};

export const analyzeFromGitHub = async (url) => {
  const match = url.match(/github\.com\/([^/]+)\/([^/]+)(?:\/tree\/([^/]+))?/);
  if (!match) throw new Error('URL inválida. Formato: https://github.com/owner/repo');
  const [, owner, repo, branch = 'main'] = match;
  let treeData;
  for (const b of [branch, 'main', 'master', 'develop']) {
    try {
      const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/${b}?recursive=1`);
      if (res.ok) { treeData = await res.json(); break; }
    } catch (_) {}
  }
  if (!treeData) throw new Error(`No se pudo acceder a ${owner}/${repo}. ¿Es público?`);
  const items = (treeData.tree || [])
    .filter(i => i.type === 'blob' && !i.path.split('/').some(p => SKIP_DIRS.has(p)))
    .filter(i => isCode(i.path) || isConf(i.path))
    .sort((a, b) => (isConf(a.path)?0:1) - (isConf(b.path)?0:1) || a.path.split('/').length - b.path.split('/').length)
    .slice(0, 60);
  const files = [];
  for (let i = 0; i < items.length; i += 10) {
    const batch = items.slice(i, i + 10);
    const results = await Promise.allSettled(batch.map(async item => {
      const res = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${item.path}`);
      if (!res.ok) return null;
      const content = await res.text();
      const name = item.path.split('/').pop();
      return { path: item.path, name, ext: getExt(name), content: content.slice(0, 80000), size: content.length, isCode: isCode(name), isConfig: isConf(name), truncated: content.length > 80000 };
    }));
    results.forEach(r => { if (r.status === 'fulfilled' && r.value) files.push(r.value); });
  }
  return buildProjectData('github', `${owner}/${repo}`, files);
};

export const formatProjectContext = (project, focus = 'completo') => {
  const { name, source, stats, stack, tree, codeFiles, configFiles, todos } = project;
  const lines = [
    '═══════════════════════════════════════',
    'CONTEXTO DE PROYECTO INYECTADO',
    '═══════════════════════════════════════',
    `Proyecto: ${name}`,
    `Fuente: ${source === 'github' ? 'GitHub' : source === 'zip' ? 'ZIP subido' : 'Archivos individuales'}`,
    `Stack: ${stack.join(', ')}`,
    `Archivos: ${stats.totalFiles} total · ${stats.codeFiles} código · ${stats.totalLines.toLocaleString()} líneas`,
    '', 'ESTRUCTURA:', tree, '',
  ];
  if (configFiles.length > 0) {
    lines.push('CONFIGURACIÓN:');
    configFiles.forEach(f => { lines.push(`\n--- ${f.path} ---`); lines.push(f.content?.slice(0, 3000) || ''); });
    lines.push('');
  }
  const importantCode = [...codeFiles].sort((a, b) => a.path.split('/').length - b.path.split('/').length).slice(0, 40);
  if (importantCode.length > 0) {
    lines.push(`CÓDIGO FUENTE (${importantCode.length} archivos):`);
    importantCode.forEach(f => {
      lines.push(`\n--- ${f.path} ---`);
      lines.push(f.content?.slice(0, 5000) || '');
      if (f.truncated) lines.push('... [truncado]');
    });
    lines.push('');
  }
  if (todos.length > 0) {
    lines.push(`TODOs/FIXMEs (${todos.length}):`);
    todos.forEach(t => lines.push(`  ${t.file}:${t.line} → ${t.text}`));
    lines.push('');
  }
  lines.push('═══════════════════════════════════════');
  lines.push('Analizá este proyecto con profundidad. Tenés acceso a todo el código.');
  return lines.join('\n');
};

export const buildAnalysisPrompt = (project, focus) => {
  const focusMap = {
    estructura:    'Analizá la estructura del proyecto, organización de carpetas y patrones arquitectónicos.',
    metricas:      'Analizá métricas de calidad: complejidad, duplicación, acoplamiento y mantenibilidad.',
    seguridad:     'Buscá vulnerabilidades: secretos expuestos, validaciones faltantes, inyecciones posibles.',
    arquitectura:  'Evaluá las decisiones arquitectónicas, identificá anti-patrones y proponé mejoras.',
    deuda:         'Identificá deuda técnica, TODOs críticos, código sin tests y áreas críticas.',
    completo:      'Hacé un análisis COMPLETO: estructura, métricas, seguridad, arquitectura y deuda técnica.',
  };
  return `${focusMap[focus] || focusMap.completo}

Organizá tu respuesta así:
1. 📊 **Resumen ejecutivo** (3-4 líneas)
2. 🏗 **Arquitectura y estructura**
3. 🔴 **Problemas críticos** (si hay)
4. 🟡 **Advertencias**
5. 🟢 **Puntos fuertes**
6. 💡 **Recomendaciones prioritarias** (top 5)
7. 📈 **Score general** (0-100 con justificación)

Sé específico: citá archivos y nombres de funciones concretos.`;
};
