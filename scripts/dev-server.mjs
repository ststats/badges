// 로컬 확인용: vercel.json의 rewrites·redirects를 흉내 내어 api/*.js와 public/을 띄운다.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import img from '../api/img.js';
import go from '../api/go.js';
import status from '../api/status.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vercel = JSON.parse(await fs.readFile(path.join(root, 'vercel.json'), 'utf-8'));
const handlers = { '/api/img': img, '/api/go': go, '/api/status': status };
const toRegex = src =>
    new RegExp('^' + src.replace(/[.]/g, '\\.').replace(/:(\w+)\(([^)]+)\)/g, '(?<$1>$2)').replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$');
const types = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript', '.json': 'application/json' };

http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    for (const r of vercel.redirects) if (toRegex(r.source).test(url.pathname)) return res.writeHead(307, { Location: r.destination }).end();
    for (const r of vercel.rewrites) {
        const m = toRegex(r.source).exec(url.pathname);
        if (!m) continue;
        const dest = new URL(r.destination.replace(/:(\w+)/g, (_, k) => m.groups[k]), 'http://localhost');
        req.url = dest.pathname + dest.search;
        return handlers[dest.pathname](req, res);
    }
    let file = path.join(root, 'public', decodeURIComponent(url.pathname));
    if (!file.startsWith(path.join(root, 'public'))) return res.writeHead(403).end();
    try {
        if ((await fs.stat(file)).isDirectory()) file = path.join(file, 'index.html');
        res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' }).end(await fs.readFile(file));
    } catch {
        res.writeHead(404).end();
    }
}).listen(Number(process.env.PORT || 3000), () => console.log(`http://localhost:${process.env.PORT || 3000}`));
