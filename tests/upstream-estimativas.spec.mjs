import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import {install} from './fixtures.mjs';

test('estimativas usam a conta completa e canais ao vivo não inflam o total',async({page})=>{
 const base='http://127.0.0.1:18130';
 const fixture=await install(page,base,{empty:true});
 // Acesso ao cálculo existe apenas no JavaScript interceptado deste ensaio.
 const source=await fs.readFile('app.js','utf8');
 await page.route('**/app.js',route=>route.fulfill({contentType:'application/javascript',body:source.replace('  function tally(rows) {','  window.__estimativas={tally:tally,nuvioType:nuvioType,setRows:function(rows){allRows=rows;}};\n  function tally(rows) {')}));
 await page.goto(base);
 const result=await page.evaluate(()=>{
  const minute=60000;
  const row=(id,type,changes={})=>({id,type,played:true,plays:1,finished:false,positionMs:0,durationMs:0,watchedMs:0,...changes});
  const measured=row('episode','series',{durationMs:45*minute,watchedMs:30*minute,positionMs:30*minute});
  const estimated=row('missing','series',{finished:true});
  const recorded=row('recorded','series',{positionMs:60*minute});
  const live=row('channel','tv',{durationMs:4600*60*minute,positionMs:4600*60*minute,watchedMs:4600*60*minute});
  window.__estimativas.setRows([measured,estimated,recorded,live]);
  const totals=window.__estimativas.tally([estimated,recorded,live]);
  return {estimated:estimated.effectiveMs,recorded:recorded.effectiveMs,live:live.effectiveMs,estimatedCount:totals.estCount,type:window.__estimativas.nuvioType('tv',null)};
 });
 expect(result).toEqual({estimated:45*60000,recorded:60*60000,live:45*60000,estimatedCount:1,type:'tv'});
 expect(fixture.calls).toEqual([]);expect(fixture.unexpected).toEqual([]);expect(fixture.errors).toEqual([]);
});

test('a explicação nova das estimativas permanece em português',async({page})=>{
 await install(page,'http://127.0.0.1:18130',{empty:true});await page.goto('/');
 await page.locator('#hoursnote').evaluate(node=>{node.textContent='2 entries were marked watched without any playback time recorded, which is what happens when you mark something watched rather than play it. They are counted at their listed runtime, or at the typical length of what else you watch where nothing is listed, so about 3 of these hours are an estimate rather than a measurement.';});
 await expect(page.locator('#hoursnote')).toContainText('duração típica dos outros títulos da conta');
});
