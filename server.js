import http from 'http';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { fileURLToPath } from 'url';
import os from 'os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3131;
const HOME = os.homedir();
const OPENCLAW_DIR = path.join(HOME, '.openclaw');
const CONFIG_FILE = path.join(OPENCLAW_DIR, 'openclaw.json');
const CREDENTIALS_DIR = path.join(OPENCLAW_DIR, 'credentials');

function readJson(filePath, fallback = {}) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(target[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    return res.end();
  }

  // Serve index.html
  if (req.method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
    try {
      const html = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(html);
    } catch {
      res.writeHead(404);
      return res.end('Not found');
    }
  }

  // GET /api/status
  if (req.method === 'GET' && pathname === '/api/status') {
    try {
      const config = readJson(CONFIG_FILE);
      const tgCfg = config?.channels?.telegram || {};
      const fsApp = config?.channels?.feishu || {};
      const fsWebhook = config?.channels?.['feishu-webhook'] || {};
      const wxPlugin = config?.plugins?.entries?.['openclaw-weixin'] || {};
      const wxWebhookCfg = config?.channels?.['weixin-webhook'] || {};

      const bound = {
        telegram: !!(tgCfg.enabled && tgCfg.botToken),
        feishu_app: !!(fsApp.enabled && fsApp.appId),
        feishu_webhook: !!(fsWebhook.enabled && fsWebhook.webhookUrl),
        weixin_enterprise: !!(wxWebhookCfg.enabled && wxWebhookCfg.webhookUrl),
        weixin_personal: !!(wxPlugin.enabled),
      };

      // 概要：每个 IM 是否有任意绑定
      const status = {
        telegram: bound.telegram,
        feishu: bound.feishu_app || bound.feishu_webhook,
        weixin: bound.weixin_enterprise || bound.weixin_personal,
      };

      // 已配置的详情（用于回填表单）
      const details = {
        telegram: tgCfg.botToken ? { botToken: tgCfg.botToken, allowFrom: tgCfg.allowFrom || [] } : null,
        feishu_app: (fsApp.appId) ? { appId: fsApp.appId } : null,
        feishu_webhook: (fsWebhook.webhookUrl) ? { webhookUrl: fsWebhook.webhookUrl } : null,
        weixin_enterprise: (wxWebhookCfg.webhookUrl) ? { webhookUrl: wxWebhookCfg.webhookUrl } : null,
        weixin_personal: wxPlugin.enabled || false,
      };

      return json(res, 200, { ok: true, status, bound, details });
    } catch (e) {
      return json(res, 200, { ok: true, status: {}, bound: {}, details: {} });
    }
  }

  // POST /api/test-telegram
  if (req.method === 'POST' && pathname === '/api/test-telegram') {
    try {
      const { token } = await parseBody(req);
      if (!token) return json(res, 400, { ok: false, error: '请提供 Bot Token' });
      const resp = await fetch(`https://api.telegram.org/bot${token}/getMe`);
      const data = await resp.json();
      if (data.ok) {
        return json(res, 200, { ok: true, botName: data.result.first_name, username: data.result.username });
      } else {
        return json(res, 200, { ok: false, error: data.description || 'Token 无效' });
      }
    } catch (e) {
      return json(res, 200, { ok: false, error: e.message });
    }
  }

  // POST /api/test-feishu-webhook
  if (req.method === 'POST' && pathname === '/api/test-feishu-webhook') {
    try {
      const { webhookUrl } = await parseBody(req);
      if (!webhookUrl) return json(res, 400, { ok: false, error: '请提供 Webhook URL' });
      const resp = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ msg_type: 'text', content: { text: '✅ OpenClaw 配置向导测试消息' } }),
      });
      const data = await resp.json();
      if (data.StatusCode === 0 || data.code === 0) {
        return json(res, 200, { ok: true });
      } else {
        return json(res, 200, { ok: false, error: data.msg || data.message || '发送失败' });
      }
    } catch (e) {
      return json(res, 200, { ok: false, error: e.message });
    }
  }

  // POST /api/test-weixin-webhook
  if (req.method === 'POST' && pathname === '/api/test-weixin-webhook') {
    try {
      const { webhookUrl } = await parseBody(req);
      if (!webhookUrl) return json(res, 400, { ok: false, error: '请提供 Webhook URL' });
      const resp = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ msgtype: 'text', text: { content: '✅ OpenClaw 配置向导测试消息' } }),
      });
      const data = await resp.json();
      if (data.errcode === 0) {
        return json(res, 200, { ok: true });
      } else {
        return json(res, 200, { ok: false, error: data.errmsg || '发送失败' });
      }
    } catch (e) {
      return json(res, 200, { ok: false, error: e.message });
    }
  }

  // POST /api/save
  if (req.method === 'POST' && pathname === '/api/save') {
    try {
      const body = await parseBody(req);
      fs.mkdirSync(OPENCLAW_DIR, { recursive: true });
      fs.mkdirSync(CREDENTIALS_DIR, { recursive: true });

      // Backup existing config
      if (fs.existsSync(CONFIG_FILE)) {
        fs.copyFileSync(CONFIG_FILE, CONFIG_FILE + '.setup-bak');
      }

      const existing = readJson(CONFIG_FILE);
      let patch = {};

      // Telegram
      if (body.telegram?.enabled) {
        patch = deepMerge(patch, {
          channels: {
            telegram: {
              enabled: true,
              botToken: body.telegram.botToken,
              dmPolicy: 'pairing',
              groupPolicy: 'open',
            },
          },
        });
      }

      // Feishu app
      if (body.feishu?.enabled) {
        patch = deepMerge(patch, {
          channels: {
            feishu: {
              enabled: true,
              appId: body.feishu.appId,
              appSecret: body.feishu.appSecret,
            },
          },
        });
      }

      // Feishu webhook
      if (body.feishuWebhook?.enabled) {
        patch = deepMerge(patch, {
          channels: {
            feishu: deepMerge(patch.channels?.feishu || {}, {
              webhookUrl: body.feishuWebhook.webhookUrl,
            }),
          },
        });
      }

      // Weixin enterprise webhook
      if (body.weixinWebhook?.enabled) {
        patch = deepMerge(patch, {
          channels: {
            weixin_enterprise: {
              enabled: true,
              webhookUrl: body.weixinWebhook.webhookUrl,
            },
          },
        });
      }

      // Weixin personal (openclaw-weixin plugin)
      if (body.weixinPersonal?.enabled) {
        patch = deepMerge(patch, {
          plugins: {
            entries: {
              'openclaw-weixin': { enabled: true },
            },
          },
        });
        if (body.weixinPersonal.token) {
          writeJson(
            path.join(CREDENTIALS_DIR, 'weixin-token.json'),
            { token: body.weixinPersonal.token }
          );
        }
      }

      const merged = deepMerge(existing, patch);
      writeJson(CONFIG_FILE, merged);

      // Restart gateway
      const restartResult = await new Promise((resolve) => {
        exec('openclaw gateway restart', { timeout: 10000 }, (err, stdout, stderr) => {
          if (err) {
            // openclaw might not be installed in dev, treat as warning not error
            resolve({ ok: false, warning: err.message, stdout, stderr });
          } else {
            resolve({ ok: true, stdout, stderr });
          }
        });
      });

      return json(res, 200, { ok: true, restart: restartResult });
    } catch (e) {
      return json(res, 500, { ok: false, error: e.message });
    }
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, '127.0.0.1', () => {
  const url = `http://localhost:${PORT}`;
  console.log(`\n🦞 OpenClaw Setup  →  ${url}\n`);
  // Auto-open browser
  const opener = process.platform === 'darwin' ? 'open' : 'xdg-open';
  exec(`${opener} ${url}`, () => {});
});
