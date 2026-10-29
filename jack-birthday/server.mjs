import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, mkdir } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(root, 'dist');
const dbFile = process.env.DB_PATH || resolve(root, 'data', 'wishes.sqlite');
await mkdir(dirname(dbFile), { recursive: true });
const db = new DatabaseSync(dbFile);
db.exec(`PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS wishes (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 nickname TEXT NOT NULL, message TEXT NOT NULL, avatar TEXT NOT NULL,
 created_at INTEGER NOT NULL, client_hash TEXT NOT NULL, fingerprint TEXT NOT NULL,
 request_id TEXT NOT NULL UNIQUE
);
CREATE INDEX IF NOT EXISTS wishes_client_time ON wishes(client_hash,created_at);
CREATE INDEX IF NOT EXISTS wishes_fingerprint_time ON wishes(fingerprint,created_at);`);
const avatars = ['🍯', '🐻', '🐶', '🐱', '🐰', '🍓', '🌷', '⭐'];
const blocked = /傻[逼比b]|煞笔|去死|死全家|操你|艹你|妈的|妈逼|fuck|\bshit\b|色情|裸照|约炮|赌博|博彩/iu;
const invalidLink = /https?:\/\/|www\.|<[^>]*>/iu;
const hash = s => createHash('sha256').update(s).digest('hex');
const clean = s => typeof s === 'string' ? s.normalize('NFC').replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g,'').trim() : '';
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8' };
function json(res, code, body, extra={}) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra });
  res.end(JSON.stringify(body));
}
async function readJson(req) {
  let data = '';
  for await (const chunk of req) { data += chunk; if (Buffer.byteLength(data) > 4096) throw new Error('BODY_TOO_LARGE'); }
  return JSON.parse(data);
}
const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','same-origin');
  res.setHeader('Permissions-Policy','microphone=(self), camera=(), geolocation=()');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; media-src 'self' blob:; frame-src https://i.y.qq.com https://y.qq.com; object-src 'none'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'");
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/api/status') return json(res,200,{ storage:'sqlite', mode:'preview', shared:true });
    if (url.pathname === '/api/wishes' && req.method === 'GET') {
      const before = Number(url.searchParams.get('before') || Number.MAX_SAFE_INTEGER);
      if (!Number.isSafeInteger(before) || before < 1) return json(res,400,{error:'分页参数不正确。'});
      const rows = db.prepare('SELECT id,nickname,message,avatar,created_at FROM wishes WHERE id < ? ORDER BY id DESC LIMIT 7').all(before);
      const more = rows.length > 6;
      const items = rows.slice(0,6);
      const {total} = db.prepare('SELECT COUNT(*) AS total FROM wishes').get();
      return json(res,200,{ items,total,nextCursor:more ? items.at(-1).id : null });
    }
    if (url.pathname === '/api/wishes' && req.method === 'POST') {
      const origin = req.headers.origin;
      if (origin && new URL(origin).host !== req.headers.host) return json(res,403,{error:'请从当前网页提交祝福。'});
      if (!req.headers['content-type']?.startsWith('application/json')) return json(res,415,{error:'请使用网页表单提交。'});
      const input = await readJson(req);
      const nickname=clean(input.nickname), message=clean(input.message), avatar=input.avatar;
      if ([...nickname].length<1 || [...nickname].length>16) return json(res,400,{error:'昵称请填写 1–16 个字。'});
      if ([...message].length<2 || [...message].length>200) return json(res,400,{error:'祝福请填写 2–200 个字。'});
      if (!avatars.includes(avatar)) return json(res,400,{error:'请选择一个可爱的头像。'});
      const normalizedContent=(nickname+' '+message).normalize('NFKC');
      if (input.website || blocked.test(normalizedContent) || invalidLink.test(normalizedContent)) return json(res,400,{error:'请使用友善的文字，暂不接受链接或广告。'});
      const requestId = typeof input.requestId === 'string' && /^[a-zA-Z0-9-]{16,64}$/.test(input.requestId) ? input.requestId : randomUUID();
      const client = hash(req.socket.remoteAddress || 'unknown');
      const now=Date.now(), fingerprint=hash(nickname+'\n'+message);
      const existing = db.prepare('SELECT id,nickname,message,avatar,created_at,client_hash FROM wishes WHERE request_id=?').get(requestId);
      if(existing) {
        if(existing.client_hash!==client) return json(res,409,{error:'提交标识冲突，请重新打开表单。'});
        delete existing.client_hash;
        return json(res,200,{item:existing});
      }
      const recent=db.prepare('SELECT created_at FROM wishes WHERE client_hash=? ORDER BY created_at DESC LIMIT 1').get(client);
      if(recent && now-recent.created_at<30000) {
        const retry=Math.ceil((30000-(now-recent.created_at))/1000);
        return json(res,429,{error:`让祝福慢慢抵达，请 ${retry} 秒后再试。`,retryAfter:retry},{'Retry-After':String(retry)});
      }
      if(db.prepare('SELECT id FROM wishes WHERE fingerprint=? AND created_at>?').get(fingerprint,now-86400000)) return json(res,409,{error:'这句祝福已经送达啦，换一句新的心意吧。'});
      const result=db.prepare('INSERT INTO wishes(nickname,message,avatar,created_at,client_hash,fingerprint,request_id) VALUES(?,?,?,?,?,?,?)').run(nickname,message,avatar,now,client,fingerprint,requestId);
      return json(res,201,{item:{id:Number(result.lastInsertRowid),nickname,message,avatar,created_at:now}});
    }
    if(url.pathname.startsWith('/api/')) return json(res,404,{error:'未找到接口。'});
    if(!['GET','HEAD'].includes(req.method)) return json(res,405,{error:'不支持此请求。'});
    const path=resolve(publicDir,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
    if(!path.startsWith(publicDir+sep)) return json(res,403,{error:'禁止访问。'});
    const content=await readFile(path);
    res.writeHead(200,{'Content-Type':mime[extname(path)]||'application/octet-stream','Cache-Control':'no-cache'});
    res.end(req.method==='HEAD'?undefined:content);
  } catch(err) {
    if(err.code==='ENOENT') return json(res,404,{error:'页面不存在。'});
    if(err instanceof SyntaxError || err.message==='BODY_TOO_LARGE') return json(res,400,{error:'提交内容格式不正确或过长。'});
    console.error(err.message);
    json(res,500,{error:'小屋暂时没有收到消息，请稍后重试。'});
  }
});
const port=Number(process.env.PORT||4173);
server.listen(port,process.env.HOST||'127.0.0.1',()=>console.log(`Birthday room: http://127.0.0.1:${port}`));
process.on('SIGTERM',()=>server.close(()=>{db.close();process.exit(0);}));
