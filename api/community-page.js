// Searchable, shareable public pages are rendered on the server. Pending recipes
// are never fetched here, and the anonymous database role enforces that boundary.
import { communityConfig, supabaseRequest } from '../lib/community-server.js';
import * as M from '../lib/menu.js';
import { page, SITE, esc, cup, copyBtn, shareBtn } from '../lib/layout.js';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FIELDS='id,name,description,author_name,combo,reviewed_at';
const xml=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
export default async function handler(req,res){
  const url=new URL(req.url,SITE),sitemap=url.pathname==='/community-sitemap.xml'||url.searchParams.get('format')==='sitemap';
  const id=url.searchParams.get('id') || url.pathname.match(/^\/community\/([^/]+)$/)?.[1];
  if(req.method!=='GET'&&req.method!=='HEAD'){res.statusCode=405;return res.end();}
  const config=communityConfig();
  res.setHeader('X-Content-Type-Options','nosniff');
  if(id&&!UUID.test(id)){res.statusCode=404;return res.end('Recipe not found');}
  try{
    if(!config){
      res.setHeader('Cache-Control','no-store');
      if(sitemap){res.statusCode=503;return res.end('Community is not available yet.');}
      res.statusCode=id?404:200;res.setHeader('Content-Type','text/html; charset=utf-8');
      return res.end(page({path:'/community',title:'Community recipe book | Brew Combos',description:'Share your 7 Brew creations with the Brew Combos community.',noindex:true,body:'<main class="collection"><div class="page-intro"><p class="eyebrow">Good taste. Better shared.</p><h1>The community<br>recipe book.</h1><p>Community recipes are not open yet. Build a drink and save it on your device while we get ready.</p></div><a class="btn primary" href="/#build">Build a drink ↗</a></main>'}));
    }
    const rows=await supabaseRequest(config,`/rest/v1/community_drinks?select=${FIELDS}&status=eq.approved${id?`&id=eq.${id}`:''}&order=reviewed_at.desc,id.desc&limit=${id?1:100}`);
    res.setHeader('Cache-Control','public, max-age=60, s-maxage=300');
    if(sitemap){res.setHeader('Content-Type','application/xml');return res.end(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${SITE}/community</loc></url>${rows.map(c=>`<url><loc>${SITE}/community/${xml(c.id)}</loc><lastmod>${xml(c.reviewed_at.slice(0,10))}</lastmod></url>`).join('')}</urlset>`);}
    let body,title,description,image;
    if(id){
      const c=rows?.[0];if(!c){res.statusCode=404;res.setHeader('Cache-Control','no-store');return res.end('Recipe not found');}
      const o=M.fixCombo(c.combo),line=M.orderLine(o),q=M.comboToQuery(o)+'&n='+encodeURIComponent(c.name);
      title=`${c.name}: a community 7 Brew order | Brew Combos`;description=`${c.description} Get the exact order and customize it.`.slice(0,160);image=`${SITE}/card.png?${q}`;
      body=`<main class="drink-page"><article class="drink-hero">${cup(o)}<div><p class="label">Community recipe · by ${esc(c.author_name)}</p><h1>${esc(c.name)}</h1><p class="lede">${esc(c.description)}</p><div class="say"><p class="label">Say this at the window</p><p class="line">${esc(line)}</p><div class="actions">${copyBtn(line)}<a class="btn quiet" href="/?${esc(M.comboToQuery(o))}#build">Tweak it</a>${shareBtn(`/community/${c.id}`,c.name,line,image)}<button class="btn quiet" type="button" data-page-save>Save drink</button><button class="btn quiet" type="button" data-page-order>Order mode</button></div></div><p class="availability-note">Reviewed for completeness. An independent community idea, not an official 7 Brew recipe. Check availability and ingredients with your stand.</p></div></article><script type="application/json" id="shared-combo-data">${JSON.stringify({name:c.name,combo:o}).replace(/</g,'\\u003c')}</script><a href="/community" class="btn quiet">More community recipes ↗</a></main>`;
    }else{
      title='Community 7 Brew recipes and ordering ideas | Brew Combos';description='Explore reviewed 7 Brew drink ideas from the Brew Combos community. Save a recipe, make it yours, and get the exact words to order it.';
      body=`<main class="collection"><div class="page-intro"><p class="eyebrow">Good taste. Better shared.</p><h1>The community<br>recipe book.</h1><p>Recipes submitted by the community and reviewed for completeness. Availability varies by stand.</p></div><a class="btn primary" href="/#community">Submit your recipe ↗</a><ol class="combo-list public-community-list">${rows.map(c=>`<li><a href="/community/${esc(c.id)}"><span class="nm"><b>${esc(c.name)}</b><span>By ${esc(c.author_name)}</span></span><span class="ln">${esc(c.description)}</span></a></li>`).join('')}</ol>${!rows.length?'<p>The first page is still blank. Send us your favorite order.</p>':''}</main>`;
    }
    res.setHeader('Content-Type','text/html; charset=utf-8');
    return res.end(req.method==='HEAD'?undefined:page({path:id?`/community/${id}`:'/community',title,description,image,body,crumbs:[['Brew Combos','/'],['Community','/community'],...(id?[['Recipe',`/community/${id}`]]:[])]}));
  }catch{res.statusCode=503;res.setHeader('Cache-Control','no-store');return res.end('The community recipe book is temporarily unavailable. Please try again.');}
}
