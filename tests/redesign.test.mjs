import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
const html=fs.readFileSync('index.html','utf8');
const baseline=JSON.parse(fs.readFileSync('tests/semantic-baseline.json','utf8'));
test('preserva todos os contratos de elementos originais sem IDs duplicados',()=>{const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length);for(const id of baseline.ids)assert.ok(ids.includes(id),id);});
test('motor de dados, adapters e operações de conta permanecem idênticos',()=>{const source=fs.readFileSync('app.js','utf8').replace(/var VERSION = '[^']+';/,"var VERSION = 'BASELINE';").replace(/\r\n/g,'\n');assert.equal(crypto.createHash('sha256').update(source).digest('hex'),baseline.appSha256);});
test('redesign tem navegação, busca local, CSS separado e alternativa textual ao gráfico',()=>{for(const id of ['sidebar','history-query','clock-data','nav-overview','nav-history','nav-account'])assert.ok(html.includes('id="'+id+'"'),id);assert.ok(html.includes('href="styles.css"'));assert.ok(html.includes('src="ui.js"'));});

test('camada visual não faz requisições nem acessa armazenamento de credenciais',()=>{const ui=fs.readFileSync('ui.js','utf8');assert.ok(!/\bfetch\s*\(|XMLHttpRequest|localStorage|sessionStorage|authKey|access_token/.test(ui));});
test('cores primárias de texto têm contraste adequado nas superfícies principais',()=>{const lum=h=>{const v=h.match(/\w\w/g).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return .2126*v[0]+.7152*v[1]+.0722*v[2];};for(const fg of ['edf4fb','acbed1','91a6bc'])for(const bg of ['0b1018','0d1520','111b28'])assert.ok((lum(fg)+.05)/(lum(bg)+.05)>=4.5,fg+'/'+bg);});
