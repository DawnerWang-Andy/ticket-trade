// HTTP 入口：静态文件 + /api 分发（零依赖，Node 原生 http）
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const { handleApi } = require('./api');
require('./db');

const PORT = process.env.PORT || 8321;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = decodeURIComponent(u.pathname);

  if (pathname.startsWith('/api/')) {
    try {
      await handleApi(req, res, pathname, u.searchParams);
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: '服务器内部错误：' + e.message }));
    }
    return;
  }

  let filePath;
  if (pathname === '/' || pathname === '/index.html') filePath = path.join(PUBLIC_DIR, 'index.html');
  else if (pathname === '/admin' || pathname === '/admin.html') filePath = path.join(PUBLIC_DIR, 'admin.html');
  else filePath = path.join(PUBLIC_DIR, path.normalize(pathname).replace(/^([/\\])+/, ''));

  if (!filePath.startsWith(PUBLIC_DIR)) { res.writeHead(403); res.end('Forbidden'); return; }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not Found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`票流转平台已启动`);
  console.log(`  买家端：  http://localhost:${PORT}/`);
  console.log(`  管理后台：http://localhost:${PORT}/admin  （管理员手机 18800000000 登录）`);
});
