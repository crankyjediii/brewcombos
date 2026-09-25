// Local preview with the same API handlers used by Vercel. No global CLI needed.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import mix from '../api/mix.js';
import community from '../api/community.js';
import share from '../api/share.js';
import card from '../api/card.js';
import communityPage from '../api/community-page.js';
const root=resolve(import.meta.dirname,'..');
const port=Number(process.env.PORT || 4173);
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.webmanifest':'application/manifest+json','.ico':'image/x-icon','.png':'image/png','.svg':'image/svg+xml','.ttf':'font/ttf','.xml':'application/xml','.txt':'text/plain'};
createServer(async(req,res)=>{
  res.status=code=>{res.statusCode=code;return res;};
  res.json=data=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));};
  try{
    const url=new URL(req.url,'http://localhost');
    const handler=(url.pathname==='/community'||url.pathname.startsWith('/community/')||url.pathname==='/community-sitemap.xml')?communityPage:{'/api/mix':mix,'/api/community':community,'/s':share,'/api/share':share,'/card.png':card,'/api/card':card}[url.pathname];
    if(handler){let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>16384)return res.status(413).json({error:'Request too large.'});}req.body=body;return await handler(req,res);}
    if(url.pathname.startsWith('/_vercel/insights')){res.setHeader('Content-Type','text/javascript');return res.end();}
    if(req.method!=='GET'&&req.method!=='HEAD')return res.status(405).end();
    const path=decodeURIComponent(url.pathname);
    if(path.split('/').some(s=>s.startsWith('.')) || (!['/','/index.html','/favicon.ico','/robots.txt','/sitemap.xml'].includes(path) && !['/assets/','/lib/','/drinks'].some(p=>path.startsWith(p))))return res.status(404).end('Not found');
    let file=resolve(root,'.'+path);if(file!==root&&!file.startsWith(root+sep))return res.status(403).end();
    const info=await stat(file);if(info.isDirectory())file=resolve(file,'index.html');
    res.setHeader('Content-Type',types[extname(file)]||'application/octet-stream');res.setHeader('Cache-Control','no-store');
    res.end(req.method==='HEAD'?undefined:await readFile(file));
  }catch{res.status(404).end('Not found');}
}).listen(port,'127.0.0.1',()=>console.log(`Brew Combos preview: http://127.0.0.1:${port}`));
