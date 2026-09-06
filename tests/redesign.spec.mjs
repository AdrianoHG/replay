import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import {install,login,semantics,names,backup,stremioFixture} from './fixtures.mjs';
const base=()=>process.env.REPLAY_TEST_URL||'http://127.0.0.1:18130';
test('paridade integral de métricas, metadados e exportação com a versão anterior',async({page,context})=>{
 const old=await context.newPage();await install(old,base(),{baseline:true});await login(old,base());const expected=await semantics(old);
 const state=await install(page,base());await login(page,base());expect(await semantics(page)).toEqual(expected);
 const download=page.waitForEvent('download');await page.locator('#export-shortcut').click();expect(JSON.parse(await fs.readFile(await (await download).path(),'utf8'))).toEqual(state.doc);
 for(const year of ['2026','2025']){await old.locator('#years button').getByText(year,{exact:true}).click();await page.locator('#years button').getByText(year,{exact:true}).click();expect(await semantics(page)).toEqual(await semantics(old));}
 expect(state.errors).toEqual([]);expect(state.unexpected).toEqual([]);await old.close();
});
test('nomes de títulos e metadados não são traduzidos por substituição de palavras',async({page})=>{
 await install(page,base());await login(page,base());const badge=page.locator('#badges li').filter({hasText:'Only Good times'});await expect(badge).toHaveCount(1);await expect(badge).toContainText('Only Good times');
 await expect(page.locator('#people')).toContainText('Only Original Name');
});
test('busca sem acentos filtra só o histórico e não muda números nem JSON',async({page})=>{
 const s=await install(page,base());await login(page,base());const before=await semantics(page),calls=s.calls.length;
 await page.locator('#history-query').fill('chegada');await expect(page.locator('#timeline ol li:visible')).toHaveCount(1);expect((await semantics(page)).cards).toEqual(before.cards);expect(s.calls).toHaveLength(calls);
 await page.locator('#history-query').fill('nada corresponde');await expect(page.locator('#history-empty')).toBeVisible();await page.locator('#clear-search').click();await expect(page.locator('#timeline ol li:visible')).toHaveCount(before.history.length);expect(s.doc).toEqual(backup());
});
test('gráfico acessível publica os mesmos 24 valores e pico da fonte',async({page})=>{
 await install(page,base());await login(page,base());const original=(await semantics(page)).hours.map(s=>Number(s.match(/, (\d+)/)[1]));
 const cells=await page.locator('#clock-data tbody td').allTextContents();expect(cells.map(Number)).toEqual(original);
 await page.locator('.data-details summary').click();await expect(page.locator('#clock-data')).toBeVisible();await expect(page.locator('#clock i[tabindex="0"]')).toHaveCount(24);
});
test('navegação, atalho de busca, menu móvel e Escape funcionam por teclado',async({page})=>{
 await install(page,base());await login(page,base());await page.locator('#nav-history').click();await expect(page).toHaveURL(/#history$/);await page.locator('#history-title').click();await page.keyboard.press('/');await expect(page.locator('#history-query')).toBeFocused();
 await page.setViewportSize({width:390,height:844});await page.locator('#nav-toggle').click();await expect(page.locator('#sidebar')).toBeVisible();await expect(page.locator('#nav-toggle')).toHaveAttribute('aria-expanded','true');await page.keyboard.press('Escape');await expect(page.locator('#nav-toggle')).toHaveAttribute('aria-expanded','false');await expect(page.locator('#nav-toggle')).toBeFocused();
});
test('sem dados e sem metadados preserva estados vazios e o export',async({page,context})=>{
 const s=await install(page,base(),{empty:true});await login(page,base());await expect(page.locator('#herofig')).toHaveText('0');await expect(page.locator('#top-empty')).toBeVisible();await expect(page.locator('#clear-option')).toBeHidden();expect(s.errors).toEqual([]);
 const missing=await context.newPage();const m=await install(missing,base(),{noMetadata:true});await login(missing,base());await expect(missing.locator('#decnote')).toBeVisible();await expect(missing.locator('#peoplenote')).toContainText('Não há');expect(m.errors).toEqual([]);await missing.close();
});
test('Stremio preserva metadados, novos episódios, perfis, export e confirmação de escrita',async({page,context})=>{
 const old=await context.newPage();await install(old,base(),{baseline:true});await login(old,base(),'stremio');const expected=await semantics(old);
 const s=await install(page,base());await login(page,base(),'stremio');expect(await semantics(page)).toEqual(expected);await expect(page.locator('#followsec')).toBeVisible();await expect(page.locator('#profilesec')).toBeVisible();
 await page.locator('#clear-go').click();expect(s.calls.filter(x=>x.path==='/api/datastorePut')).toHaveLength(0);await page.locator('#clear-go').click();await expect.poll(()=>s.calls.filter(x=>x.path==='/api/datastorePut').length).toBe(1);
 const changes=s.calls.find(x=>x.path==='/api/datastorePut').body.changes;expect(changes.every(x=>x.state.timeOffset===0&&x.state.overallTimeWatched===0)).toBe(true);expect(s.errors).toEqual([]);await old.close();
});
test('visual: desktop, ultrawide e celular sem corte, fontes minúsculas ou recursos quebrados',async({page})=>{
 const s=await install(page,base());await login(page,base());
 for(const [label,width,height] of [['desktop',1440,1000],['wide',1920,1080],['ultrawide',3440,1440],['mobile',390,844],['small-mobile',360,800]]){
  await page.setViewportSize({width,height});await page.evaluate(()=>window.scrollTo(0,0));
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  expect(await page.locator('#cards .k').evaluateAll(nodes=>nodes.every(x=>parseFloat(getComputedStyle(x).fontSize)>=11))).toBe(true);
  await expect.poll(()=>page.locator('img.art').evaluateAll(nodes=>nodes.filter(x=>{const r=x.getBoundingClientRect();return r.top<innerHeight&&r.bottom>0;}).every(x=>x.complete&&x.naturalWidth>0))).toBe(true);
  await page.screenshot({path:'../replay-redesign-evidence/painel-'+label+'.png'});
 }
 await page.setViewportSize({width:1440,height:1000});await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:'../replay-redesign-evidence/painel-completo.png',fullPage:true});
 expect(s.errors).toEqual([]);expect(s.unexpected).toEqual([]);
});

test('reaplicar o mesmo período mantém teclado e contagens no gráfico recriado',async({page})=>{
 await install(page,base());await login(page,base());await page.locator('#years button').first().click();
 await expect(page.locator('#clock i[tabindex="0"]')).toHaveCount(24);
 const displayed=await page.locator('#clock i').evaluateAll(nodes=>nodes.map(x=>Number(x.dataset.count)));
 expect(displayed).toEqual((await page.locator('#clock-data tbody td').allTextContents()).map(Number));
});
