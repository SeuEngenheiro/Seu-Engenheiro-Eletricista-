#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// scripts/install-hooks.js — Instala git hooks do projeto
//
// Copia scripts/git-hooks/* pra .git/hooks/ e torna executável.
// Idempotente: pode rodar várias vezes sem problema.
//
// USO: npm run install-hooks
// ═══════════════════════════════════════════════════════════════

import { copyFileSync, readdirSync, existsSync, chmodSync, mkdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');

const SOURCE = join(ROOT, 'scripts', 'git-hooks');
const DEST = join(ROOT, '.git', 'hooks');

// Cores ANSI
const c = { green: '\x1b[32m', red: '\x1b[31m', yellow: '\x1b[33m', dim: '\x1b[2m', reset: '\x1b[0m' };

if (!existsSync(join(ROOT, '.git'))) {
  console.error(`${c.red}✗ .git/ não encontrado em ${ROOT}${c.reset}`);
  console.error(`  Esse script deve ser rodado da raiz do repo git.`);
  process.exit(1);
}

if (!existsSync(SOURCE)) {
  console.error(`${c.red}✗ Pasta scripts/git-hooks/ não existe${c.reset}`);
  process.exit(1);
}

if (!existsSync(DEST)) mkdirSync(DEST, { recursive: true });

// Ignora arquivos de sistema (desktop.ini Windows/Drive, .DS_Store macOS, etc)
const SISTEMA = ['desktop.ini', 'Thumbs.db', '.DS_Store', '.gitkeep'];
const arquivos = readdirSync(SOURCE).filter(f => {
  const stat = statSync(join(SOURCE, f));
  return stat.isFile()
    && !f.startsWith('.')
    && !SISTEMA.includes(f);
});

if (arquivos.length === 0) {
  console.log(`${c.yellow}⚠ Nenhum hook encontrado em scripts/git-hooks/${c.reset}`);
  process.exit(0);
}

console.log(`Instalando ${arquivos.length} hook(s) em .git/hooks/...`);
console.log('');

for (const arq of arquivos) {
  const src = join(SOURCE, arq);
  const dst = join(DEST, arq);
  copyFileSync(src, dst);
  // Tenta dar permissão de execução (no Windows o chmod é no-op mas
  // git ainda executa via sh.exe do Git Bash)
  try {
    chmodSync(dst, 0o755);
  } catch (e) { /* Windows ignora */ }
  console.log(`  ${c.green}✓${c.reset} ${arq} ${c.dim}→ .git/hooks/${arq}${c.reset}`);
}

console.log('');
console.log(`${c.green}✓ Hooks instalados.${c.reset}`);
console.log('');
console.log(`A partir de agora, ${c.yellow}git push${c.reset} vai rodar a suíte de`);
console.log('regressão automaticamente antes de enviar pro GitHub.');
console.log('');
console.log(`${c.dim}Pra forçar push em emergência: git push --no-verify${c.reset}`);
console.log('');
