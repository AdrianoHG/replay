import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
const user={id:'fixture-user',email:'replay@example.invalid',created_at:'2025-01-01T00:00:00Z',user_metadata:{display_name:'Teste'}};
const fixture=()=>({watch_progress:[{content_id:'tt0111161',content_type:'movie',position:1800000,duration:7200000,last_watched:'2026-09-05T20:00:00Z',progress_key:'fixture-progress-1',profile_id:1,title:'Título de teste'}],library:[{content_id:'tt0111161',name:'Título de teste',content_type:'movie',genres:['Drama'],added_at:'2026-01-01T00:00:00Z'}]});
async function backend(page,options={}){
 const state={backup:fixture(),calls:[],errors:[],external:[]};
 page.on('pageerror',e=>state.errors.push(e.message));
 await page.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());
  if(url.origin===new URL(test.info().project.use.baseURL).origin){
   if(process.env.REPLAY_TEST_URL){await route.continue();return;}
   // Testes de comportamento recebem bytes exatos do checkout. O AdGuard do host
   // modifica respostas HTTP, inclusive CSP; a entrega real tem validação separada.
   const files={'/':'index.html','/index.html':'index.html','/app.js':'app.js','/icon.svg':'icon.svg','/LICENSE':'LICENSE'};
   const file=files[url.pathname];if(!file){await route.fulfill({status:404,body:''});return;}
   const type=file.endsWith('.js')?'application/javascript':file.endsWith('.svg')?'image/svg+xml':file==='LICENSE'?'text/plain':'text/html';
   await route.fulfill({status:200,contentType:type+'; charset=utf-8',headers:{'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data:; connect-src 'self' https:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'"},body:await fs.readFile(file)});return;
  }
  state.external.push(url.hostname);
  const headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,OPTIONS'};
  const reply=(body,status=200)=>route.fulfill({status,headers,contentType:'application/json',body:JSON.stringify(body)});
  if(req.method()==='OPTIONS'){await reply({});return;}
  if(url.hostname==='v3-cinemeta.strem.io'){await reply({meta:{id:'tt0111161',type:'movie',name:'Título de teste',genres:['Drama'],year:'1994',cast:['Elenco de teste'],runtime:'120 min'}});return;}
  if(!['api.nuvio.tv','backend.example.invalid'].includes(url.hostname)){await route.abort();return;}
  state.calls.push({path:url.pathname,body:req.postDataJSON()});
  if(url.pathname==='/.well-known/nuvio'){await reply({backend_url:'https://backend.example.invalid',publishable_key:'fixture-public-key'});return;}
  if(url.pathname==='/auth/v1/token'){await reply(options.failLogin?{message:'Credenciais inválidas'}:{access_token:'fixture-access-token',user},options.failLogin?400:200);return;}
  if(url.pathname==='/auth/v1/user'){await reply(user);return;}
  if(url.pathname.endsWith('sync_export_account_backup')){await reply(state.backup);return;}
  if(url.pathname.endsWith('sync_delete_watch_progress')){state.backup.watch_progress=[];await reply({});return;}
  if(url.pathname.endsWith('sync_restore_account_backup')){await reply(options.refuseRestore?{message:'Restauração recusada pelo backend oficial'}:{},options.refuseRestore?403:200);return;}
  await reply({});
 });
 return state;
}
async function signIn(page,custom=false){
 await page.goto('/');
 if(custom){await page.locator('[data-backend="custom"]').click();await page.locator('#baseurl').fill('https://backend.example.invalid');}
 await page.locator('#email').fill(user.email);await page.locator('#password').fill('SENHA_APENAS_DE_TESTE');await page.locator('#go').click();
 await expect(page.locator('#results')).toBeVisible();
}
test('entrada Nuvio, troca de backend, nenhuma chamada comercial ou erro',async({page})=>{
 const s=await backend(page);await page.goto('/');
 await expect(page).toHaveTitle('RePlay | Seu histórico de streaming');
 await expect(page.locator('[data-backend="nuvio"]')).toHaveAttribute('aria-selected','true');
 await expect(page.locator('#remember')).not.toBeChecked();
 await page.locator('[data-backend="stremio"]').click();await page.locator('#mode-toggle').click();await expect(page.locator('#authkey')).toBeVisible();
 await page.locator('[data-backend="nuvio"]').click();await expect(page.locator('#password')).toBeVisible();
 await page.screenshot({path:'../replay-evidence/entrada-desktop.png',fullPage:true});
 expect(s.external).toEqual([]);expect(s.errors).toEqual([]);
});
test('entrada em celular sem transbordamento horizontal',async({page})=>{
 await backend(page);await page.setViewportSize({width:390,height:844});await page.goto('/');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.screenshot({path:'../replay-evidence/entrada-celular.png',fullPage:true});
});
test('consulta, exportação, senha não persistida e retomada de sessão',async({page})=>{
 const s=await backend(page);await signIn(page);
 const stored=await page.evaluate(()=>({local:{...localStorage},session:{...sessionStorage}}));
 expect(stored.local).toEqual({});expect(stored.session['replay.session.nuvio']).toContain('fixture-access-token');expect(JSON.stringify(stored)).not.toContain('SENHA_APENAS_DE_TESTE');
 await expect(page.locator('#password')).toHaveValue('');
 const dlPromise=page.waitForEvent('download');await page.locator('#dl-export').click();const dl=await dlPromise;
 expect(JSON.parse(await fs.readFile(await dl.path(),'utf8'))).toEqual(s.backup);
 await page.screenshot({path:'../replay-evidence/estatisticas-simuladas.png',fullPage:true});
 await page.reload();await expect(page.locator('#resume')).toBeVisible();await page.locator('#resumego').click();await expect(page.locator('#results')).toBeVisible();
 expect(s.calls.filter(x=>x.path==='/auth/v1/token')).toHaveLength(1);expect(s.errors).toEqual([]);
});
test('exclusão exige duas confirmações e mantém contrato por perfil',async({page})=>{
 const s=await backend(page);await signIn(page);await page.locator('#clear-go').click();
 expect(s.calls.filter(x=>x.path.endsWith('sync_delete_watch_progress'))).toHaveLength(0);
 await expect(page.locator('#clear-msg')).toContainText('irreversível');await page.locator('#clear-go').click();
 await expect.poll(()=>s.calls.filter(x=>x.path.endsWith('sync_delete_watch_progress')).length).toBe(1);
 const call=s.calls.find(x=>x.path.endsWith('sync_delete_watch_progress'));expect(call.body).toEqual({p_keys:['fixture-progress-1'],p_profile_id:1});
 await expect(page.locator('#clear-option')).toBeHidden();expect(s.backup.library).toHaveLength(1);expect(s.errors).toEqual([]);
});
test('backend próprio restaura somente após confirmação explícita',async({page})=>{
 const s=await backend(page);await signIn(page,true);
 await page.locator('#restore-file').setInputFiles({name:'backup-teste.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture()))});
 await page.locator('#restore-go').click();expect(s.calls.filter(x=>x.path.endsWith('sync_restore_account_backup'))).toHaveLength(0);
 await expect(page.locator('#restore-msg')).toContainText('substitui');await page.locator('#restore-go').click();
 await expect.poll(()=>s.calls.filter(x=>x.path.endsWith('sync_restore_account_backup')).length).toBe(1);
 expect(s.calls.find(x=>x.path.endsWith('sync_restore_account_backup')).body).toEqual({p_backup:fixture(),p_mode:'replace'});expect(s.errors).toEqual([]);
});
test('recusa de restauração é exibida sem alegar sucesso',async({page})=>{
 const s=await backend(page,{refuseRestore:true});await signIn(page);
 await page.locator('#restore-file').setInputFiles({name:'backup-teste.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture()))});
 await page.locator('#restore-go').click();await page.locator('#restore-go').click();await expect(page.locator('#restore-msg')).toContainText('recusada');expect(s.errors).toEqual([]);
});
test('erro de login não persiste sessão nem senha',async({page})=>{
 const s=await backend(page,{failLogin:true});await page.goto('/');await page.locator('#email').fill(user.email);await page.locator('#password').fill('SENHA_APENAS_DE_TESTE');await page.locator('#go').click();
 await expect(page.locator('#status')).toContainText('Credenciais inválidas');await expect(page.locator('#password')).toHaveValue('');expect(await page.evaluate(()=>sessionStorage.getItem('replay.session.nuvio'))).toBeNull();expect(s.errors).toEqual([]);
});
