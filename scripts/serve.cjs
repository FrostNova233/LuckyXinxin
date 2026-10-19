'use strict';
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };

function createServer() {
  return http.createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      // Serve the same files under a project subdirectory for Pages compatibility checks.
      const relative = pathname.replace(/^\/LuckyXinxin(?=\/|$)/, '').replace(/^\/+/, '') || 'index.html';
      const file = path.resolve(root, relative);
      if (!file.startsWith(root + path.sep) || relative.split(/[\\/]/).some(part => part.startsWith('.')) || !['GET', 'HEAD'].includes(req.method)) {
        res.writeHead(403); return res.end('Forbidden');
      }
      const body = await fs.readFile(file);
      res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch (error) {
      res.writeHead(error instanceof URIError ? 400 : 404); res.end('Not found');
    }
  });
}
if (require.main === module) {
  const server = createServer();
  server.on('error', error => { console.error(error.message); process.exitCode = 1; });
  server.listen(Number(process.env.PORT || 4173), '127.0.0.1', () => console.log(`小瓶子预览：http://127.0.0.1:${server.address().port}`));
}
module.exports = { createServer };
