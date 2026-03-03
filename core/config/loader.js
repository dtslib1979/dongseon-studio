#!/usr/bin/env node
/**
 * config/loader.js — gohsy-fashion 설정 로더
 * core/ 모듈 공통 설정. HQ 연동, 채널 인증, 경로 해석.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');

const config = {
  root: ROOT,
  brand: 'gohsy',
  domain: 'gohsy.com',

  paths: {
    catalog: path.join(ROOT, 'catalog'),
    analytics: path.join(ROOT, 'analytics'),
    automation: path.join(ROOT, 'automation'),
    gpu: path.join(ROOT, 'gpu'),
    showroom: path.join(ROOT, 'showroom'),
    pipeline: path.join(ROOT, 'pipeline'),
    scripts: path.join(ROOT, 'scripts'),
  },

  hq: {
    repo: 'dtslib1979/dtslib-papyrus',
    stateFile: 'state.json',
    lineName: 'fashion-commerce',
  },

  channels: {
    coupang: { enabled: true, type: 'marketplace' },
    naver: { enabled: true, type: 'marketplace' },
    youtube: { enabled: true, type: 'content' },
    showroom: { enabled: true, type: 'owned', domain: 'gohsy.com' },
  },

  analytics: {
    salesLog: 'sales-log.jsonl',
    trafficLog: 'traffic-log.jsonl',
    deployLog: 'deploy-log.jsonl',
    channelPerf: 'channel-performance.jsonl',
    dashboard: 'dashboard.json',
  },
};

function loadCatalog() {
  const idx = path.join(config.paths.catalog, 'index.json');
  return JSON.parse(fs.readFileSync(idx, 'utf8'));
}

function loadCard(productId) {
  const cardPath = path.join(config.paths.catalog, 'products', productId, 'card.json');
  return JSON.parse(fs.readFileSync(cardPath, 'utf8'));
}

function loadDashboard() {
  const dashPath = path.join(config.paths.analytics, config.analytics.dashboard);
  if (!fs.existsSync(dashPath)) return null;
  return JSON.parse(fs.readFileSync(dashPath, 'utf8'));
}

module.exports = { config, loadCatalog, loadCard, loadDashboard };
