import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
export const names=['Interestelar','Duna: Parte Dois','Ruptura','O Urso','Dark','A Chegada','The Last of Us','Blade Runner 2049','Breaking Bad','Oppenheimer','Only Good times','Título sem metadados'];
export const user={id:'fixture-user',email:'replay@example.invalid',created_at:'2023-01-01T12:00:00Z',user_metadata:{display_name:'Conta de demonstração'}};
export const metadata=Object.fromEntries(names.map((name,i)=>['tt'+(9000000+i),{id:'tt'+(9000000+i),type:[2,3,4,6,8].includes(i)?'series':'movie',name,poster:'https://images.example.invalid/poster/'+i+'.svg',background:'https://images.example.invalid/backdrop/'+i+'.svg',genres:[['Drama','Sci-Fi'],['Adventure','Sci-Fi'],['Drama','Mystery'],['Drama','Comedy']][i%4],year:String(1984+i*3),imdbRating:String(7.1+(i%4)*.5),runtime:i%2?'48 min':'124 min',cast:['Elenco A','Elenco B','Only Original Name'],director:['Direção de teste']} ]));
export function backup(){
 const library=names.map((name,i)=>({content_id:'tt'+(9000000+i),content_type:metadata['tt'+(9000000+i)].type,name,added_at:'2023-01-01T12:00:00Z',genres:[],release_info:String(1984+i*3),addon_base_url:'https://addon.example.invalid/'}));
 const watch_progress=Array.from({length:24},(_,i)=>{const n=i%10,id='tt'+(9000000+n),series=metadata[id].type==='series';return{content_id:id,content_type:series?'series':'movie',title:names[n],season:series?1:null,episode:series?i+1:null,profile_id:i%2+1,progress_key:'fixture-'+i,position:(i%5+1)*600000,duration:(i%2?48:124)*60000,last_watched:new Date(Date.UTC(2024+i%3,i%9,i+1,18+i%5,20)).toISOString()};});
 return{schema_version:3,library,watch_progress,watched_items:Array.from({length:5},(_,i)=>({content_id:'tt9000010',content_type:'movie',title:names[10],watched_at:new Date(Date.UTC(2026,8,i+1,21)).toISOString()})),profiles:[{id:1,profile_index:0,name:'Perfil principal',pin_enabled:false,created_at:'2023-01-01T12:00:00Z'},{id:2,profile_index:1,name:'Família',pin_enabled:true,created_at:'2023-02-01T12:00:00Z'}],extra_preserved:{nested:['valor original',{example:true}],marker:'NÃO ALTERAR'}};
}
export function stremioFixture(){return{items:names.slice(0,8).map((name,i)=>({_id:'tt'+(9000000+i),name,type:i===7?'tv':metadata['tt'+(9000000+i)].type,removed:i%3===0,temp:i%3===0,_ctime:'2023-01-01T12:00:00Z',state:{duration:7200000,timeOffset:i?1800000:0,overallTimeWatched:i?3600000:0,timesWatched:i?1:0,flaggedWatched:i===4?1:0,lastWatched:new Date(Date.UTC(2025+i%2,i,1,20)).toISOString(),video_id:'tt'+(9000000+i)+':1:2'}})),export:{nim:{'tt9000002 2 1':true,'tt9000002 2 2':true},library:[{d:{_id:'tt9000000',name:'Interestelar',state:{timeOffset:1000}}}],unknown:{preserved:true}}};}
const csp="default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data:; connect-src 'self' https:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'";
export async function install(page,base,options={}){
 const state={doc:options.empty?{library:[],watch_progress:[]}:backup(),calls:[],errors:[],unexpected:[]};const st=stremioFixture();
 page.on('pageerror',e=>state.errors.push(e.message));
 await page.route('**/*',async route=>{const req=route.request(),url=new URL(req.url());
  if(url.origin===new URL(base).origin){
   if(process.env.REPLAY_TEST_URL&&!options.baseline){await route.continue();return;}
   const files={'/':'index.html','/index.html':'index.html','/app.js':'app.js','/ui.js':'ui.js','/styles.css':'styles.css','/icon.svg':'icon.svg','/LICENSE':'LICENSE'};
   const file=files[url.pathname];if(!file){await route.fulfill({status:404,body:''});return;}
   let body;try{body=options.baseline?execFileSync('git',['show','a4c69859b87a8d93fcb4ce2fc2bf81e61d3a0b62:'+file]):await fs.readFile(file);}catch{await route.fulfill({status:404,body:''});return;}
   await route.fulfill({status:200,contentType:(file.endsWith('.css')?'text/css':file.endsWith('.js')?'application/javascript':file.endsWith('.svg')?'image/svg+xml':file==='LICENSE'?'text/plain':'text/html')+'; charset=utf-8',headers:{'Content-Security-Policy':csp},body});return;
  }
  const reply=(body,status=200)=>route.fulfill({status,contentType:'application/json',headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,OPTIONS'},body:JSON.stringify(body)});
  if(req.method()==='OPTIONS'){await reply({});return;}
  if(url.hostname==='images.example.invalid'){
   const i=Number(url.pathname.match(/\/(\d+)\.svg$/)?.[1]||0),color=['#203c48','#564331','#304e50','#4c394f'][i%4];
   await route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 150"><rect width="100" height="150" fill="'+color+'"/><text x="50" y="74" font-size="36" text-anchor="middle" fill="#b8d9d6" font-family="sans-serif">'+String(i+1).padStart(2,'0')+'</text><text x="50" y="106" font-size="9" text-anchor="middle" fill="#b8d9d6" font-family="sans-serif">TESTE VISUAL</text></svg>'});return;
  }
  if(url.hostname==='v3-cinemeta.strem.io'){const id=url.pathname.match(/(tt\d+)/)?.[1];await reply(options.noMetadata?{}:{meta:metadata[id]});return;}
  if(!['api.nuvio.tv','api.strem.io'].includes(url.hostname)){state.unexpected.push(url.hostname);await route.abort();return;}
  const body=req.postData()?JSON.parse(req.postData()):null;state.calls.push({path:url.pathname,body});
  if(url.hostname==='api.strem.io'){
   if(url.pathname==='/api/login'){await reply({result:{authKey:'fixture-stremio-token'}});return;}
   if(url.pathname==='/api/getUser'){await reply({result:{_id:user.id,email:user.email,dateRegistered:user.created_at,premiumPrefs:{userProfiles:{1:{name:'Perfil Stremio',hasPin:true}}}}});return;}
   if(url.pathname==='/api/datastoreGet'){await reply({result:st.items});return;}
   if(url.pathname==='/api/dataExport'){await reply({result:{exportId:'fixture-export'}});return;}
   if(url.pathname.includes('/data-export/')){await reply(st.export);return;}
   await reply({result:{}});return;
  }
  if(url.pathname==='/auth/v1/token'){await reply({access_token:'fixture-access-token',user});return;}
  if(url.pathname==='/auth/v1/user'){await reply(user);return;}
  if(url.pathname.endsWith('sync_export_account_backup')){await reply(state.doc);return;}
  if(url.pathname.endsWith('sync_pull_profile_locks')){await reply([{profile_id:2,pin_enabled:true}]);return;}
  if(url.pathname.endsWith('sync_delete_watch_progress')){state.doc.watch_progress=state.doc.watch_progress.filter(x=>!(body.p_keys.includes(x.progress_key)&&body.p_profile_id===x.profile_id));await reply({});return;}
  await reply({});
 });return state;
}
export async function login(page,base,backend='nuvio'){
 await page.goto(base+'/');if(backend==='stremio')await page.locator('[data-backend="stremio"]').click();
 await page.locator('#email').fill(user.email);await page.locator('#password').fill('SENHA_SOMENTE_TESTE');await page.locator('#go').click();await page.locator('#results').waitFor({state:'visible'});
}
export async function semantics(page){return page.evaluate(()=>{
 const q=(selector)=>[...document.querySelectorAll(selector)].map(n=>n.textContent);
 return{total:document.getElementById('herofig').textContent,cards:q('#cards .n'),top:[...document.querySelectorAll('#top li')].map(n=>({title:n.querySelector('.nm')?.textContent,meta:n.querySelector('.sm')?.textContent,value:n.querySelector('.hrs')?.textContent,href:n.querySelector('a')?.getAttribute('href'),image:n.querySelector('img')?.getAttribute('src')})),genres:q('#genres .chip'),decades:q('#decades .chip'),people:q('#people .chip'),hours:[...document.getElementById('clock').children].map(n=>n.title),history:[...document.querySelectorAll('#timeline ol li')].map(n=>({title:n.querySelector('.nm')?.textContent,date:n.querySelector('.d')?.textContent,bar:n.querySelector('.bar i')?.style.width,image:n.querySelector('img')?.getAttribute('src')})),profiles:q('#profiles .pn'),profileDetails:q('#profiles .pl'),account:q('#account dd'),follows:q('#follows .pn'),episodes:q('#follows .pl')};
 });}
