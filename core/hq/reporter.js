#!/usr/bin/env node
/**
 * hq/reporter.js — dtslib-papyrus HQ 리포팅 모듈
 *
 * gohsy-fashion 상태를 papyrus state.json fashion-commerce 라인에 반영.
 * domains.json, registry.json도 동시 갱신.
 *
 * 헌법 제2조: 크로스레포는 스크립트/모듈 경유.
 *
 * Usage:
 *   node core/hq/reporter.js [--dry-run]
 */

const { execSync } = require('child_process');
const { config, loadCatalog, loadDashboard } = require('../config/loader');

const dryRun = process.argv.includes('--dry-run');
const PAPYRUS_REPO = config.hq.repo;

console.log(`\n${'='.repeat(50)}`);
console.log(`  HQ REPORTER: → ${PAPYRUS_REPO}`);
console.log(`  dry-run: ${dryRun}`);
console.log(`${'='.repeat(50)}\n`);

// ── Collect Current State ─────────────────────────
const catalog = loadCatalog();
const dashboard = loadDashboard();
const liveCount = catalog.products.filter(p => p.state === 'ALL_LIVE').length;
const totalProducts = catalog.products.length;

const fashionLine = {
  name: 'Fashion Commerce',
  status: liveCount > 0 ? 'operational' : 'setup',
  track: 'B-auto',
  broadcast: 'gohsy.com',
  chain: [
    { recipe: 'card', role: '상품 기획 (PRODUCT_CARD)', state: 'done' },
    { recipe: 'asset', role: '에셋 생성 (parksy-image 연동)', state: 'done' },
    { recipe: 'render', role: 'GPU 렌더 + 상세페이지', state: 'done' },
    { recipe: 'deploy', role: '4채널 배포 (오케스트레이터)', state: 'done' },
    { recipe: 'track', role: '매출 추적 + 루프백', state: liveCount > 0 ? 'active' : 'pending' }
  ],
  current_step: liveCount > 0 ? 5 : 4,
  total_steps: 5,
  blocker: liveCount > 0 ? null : '상품 라이브 배포 필요',
  assets: {
    products_total: totalProducts,
    products_live: liveCount,
    channels: ['coupang', 'naver', 'youtube', 'showroom'],
    domain: 'gohsy.com'
  },
  last_output: dashboard ? {
    revenue: dashboard.kpi.total_revenue,
    orders: dashboard.kpi.total_orders,
    traffic: dashboard.kpi.total_traffic,
    synced: new Date().toISOString()
  } : { synced: new Date().toISOString() }
};

console.log(`  products: ${totalProducts} (${liveCount} live)`);
console.log(`  revenue: ₩${dashboard ? dashboard.kpi.total_revenue.toLocaleString() : 0}`);

// ── GitHub API Helpers ────────────────────────────
function ghGetFile(filepath) {
  try {
    const sha = execSync(
      `gh api repos/${PAPYRUS_REPO}/contents/${filepath} -q '.sha'`,
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim();
    const content = execSync(
      `gh api repos/${PAPYRUS_REPO}/contents/${filepath} -q '.content'`,
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim();
    return { sha, content: Buffer.from(content, 'base64').toString('utf8') };
  } catch {
    return null;
  }
}

function ghPutFile(filepath, content, message, sha) {
  if (dryRun) {
    console.log(`  [DRY-RUN] would update ${filepath}`);
    return true;
  }
  const encoded = Buffer.from(content).toString('base64');
  const shaArg = sha ? `-f sha="${sha}"` : '';
  try {
    execSync(
      `gh api repos/${PAPYRUS_REPO}/contents/${filepath} -X PUT ` +
      `-f message="${message}" -f content="${encoded}" ${shaArg}`,
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    );
    return true;
  } catch (e) {
    console.error(`  ✗ ${filepath}: ${e.message}`);
    return false;
  }
}

// ── 1. state.json — fashion-commerce 라인 추가/갱신 ──
function updateState() {
  console.log('\n  [1/3] state.json...');
  const file = ghGetFile('state.json');
  if (!file) { console.log('    ✗ state.json not found'); return; }

  const state = JSON.parse(file.content);

  // fashion-commerce 라인 삽입/갱신
  state.lines['fashion-commerce'] = fashionLine;

  // summary 갱신
  const lines = Object.values(state.lines);
  state.summary.total_lines = lines.length;
  state.summary.ready = lines.filter(l => l.status === 'ready').length;
  state.summary.waiting = lines.filter(l => l.status === 'waiting').length;
  state.summary.blocked = lines.filter(l => l.status === 'blocked').length;
  state.summary.active = lines.filter(l => l.status === 'operational' || l.status === 'active').length;

  const ok = ghPutFile(
    'state.json',
    JSON.stringify(state, null, 2) + '\n',
    `sync: gohsy-fashion → papyrus (${totalProducts} products, ${liveCount} live, Phase 6)`,
    file.sha
  );
  console.log(ok ? '    ✓ state.json updated' : '    ✗ state.json failed');
}

// ── 2. domains.json — gohsy.com 등록 ─────────────
function updateDomains() {
  console.log('  [2/3] domains.json...');
  const file = ghGetFile('domains.json');

  const domains = file ? JSON.parse(file.content) : {
    schema_version: '1.0',
    updated: new Date().toISOString(),
    domains: []
  };

  const existing = domains.domains.find(d => d.domain === 'gohsy.com');
  const gohsyDomain = {
    domain: 'gohsy.com',
    provider: 'Cafe24',
    type: 'commerce',
    repo: 'dtslib1979/gohsy-fashion',
    github_pages: true,
    cname: true,
    ssl: true,
    status: 'live',
    purpose: '패션 커머스 쇼룸 + YouTube 루프백 허브',
    channels: ['coupang', 'naver', 'youtube', 'showroom'],
    registered: '2026-03-03'
  };

  if (existing) {
    Object.assign(existing, gohsyDomain);
  } else {
    domains.domains.push(gohsyDomain);
  }
  domains.updated = new Date().toISOString();

  const ok = ghPutFile(
    'domains.json',
    JSON.stringify(domains, null, 2) + '\n',
    `registry: gohsy.com 도메인 등록 (패션 커머스 HQ)`,
    file ? file.sha : undefined
  );
  console.log(ok ? '    ✓ domains.json updated' : '    ✗ domains.json failed');
}

// ── 3. registry.json — gohsy-fashion 기관 등록 ───
function updateRegistry() {
  console.log('  [3/3] registry.json...');
  const file = ghGetFile('registry.json');

  const registry = file ? JSON.parse(file.content) : {
    schema_version: '1.0',
    updated: new Date().toISOString(),
    entities: []
  };

  const entry = {
    id: 'gohsy-fashion',
    name: 'GOHSY Fashion',
    type: 'commerce-hq',
    repo: 'dtslib1979/gohsy-fashion',
    domain: 'gohsy.com',
    slot: 9,
    status: liveCount > 0 ? 'operational' : 'setup',
    capabilities: ['product-catalog', 'gpu-render', '4ch-deploy', 'style-engine', 'analytics'],
    upstream: ['parksy-image', 'parksy-audio', 'OrbitPrompt'],
    downstream: ['dtslib-papyrus', 'dtslib.kr'],
    channels: {
      coupang: { type: 'marketplace', status: 'active' },
      naver: { type: 'marketplace', status: 'active' },
      youtube: { type: 'content', status: 'active' },
      showroom: { type: 'owned', domain: 'gohsy.com', status: 'active' }
    },
    kpi: dashboard ? {
      products: totalProducts,
      live: liveCount,
      revenue: dashboard.kpi.total_revenue,
      last_sync: new Date().toISOString()
    } : { products: totalProducts, live: liveCount },
    registered: '2026-03-03',
    history: 'dongseon-studio(大提學) → gohsy-fashion(패션 커머스) 전환'
  };

  const existingIdx = registry.entities.findIndex(e => e.id === 'gohsy-fashion');
  if (existingIdx >= 0) {
    registry.entities[existingIdx] = entry;
  } else {
    registry.entities.push(entry);
  }
  registry.updated = new Date().toISOString();

  const ok = ghPutFile(
    'registry.json',
    JSON.stringify(registry, null, 2) + '\n',
    `registry: gohsy-fashion 기관 등록 (슬롯 #9, 4채널 커머스)`,
    file ? file.sha : undefined
  );
  console.log(ok ? '    ✓ registry.json updated' : '    ✗ registry.json failed');
}

// ── Execute ───────────────────────────────────────
updateState();
updateDomains();
updateRegistry();

console.log(`\n${'='.repeat(50)}`);
console.log('  HQ REPORTER: complete');
console.log(`${'='.repeat(50)}\n`);
