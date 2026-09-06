import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
const html = readFileSync('index.html', 'utf8');
const js = existsSync('app.js') ? readFileSync('app.js', 'utf8') : html;
const code = html + js;
test('não contém newsletter nem chamadas comerciais', () => {
  assert.ok(!/app\.kit\.com|subscribeGuide|guide-optin|store\.elfhosted|cta-move|cta-backend/.test(code), "Conteúdo proibido encontrado");
});
test('Nuvio é a seleção inicial em português', () => {
  assert.ok(/<html lang="pt-BR">/.test(html), "Invariante ausente");
  assert.ok(/data-backend="nuvio"[^>]*aria-selected="true"/.test(html), "Invariante ausente");
  assert.ok(/var backendId = 'nuvio', backend = BACKENDS\.nuvio/.test(js), "Invariante ausente");
});
test('JavaScript externo permite CSP sem unsafe-inline', () => {
  assert.ok(/<script src="app\.js" defer><\/script>/.test(html), "Invariante ausente");
  assert.ok(!/<script\s*>|\son[a-z]+\s*=/i.test(html), "Conteúdo proibido encontrado");
});
test('escrita, restauração e exclusão continuam implementadas', () => {
  for (const op of ['sync_delete_watch_progress', 'sync_restore_account_backup', '/api/datastorePut']) assert.ok(js.includes(op), op);
  assert.ok(/if \(!clearArmed\)/.test(js), "Invariante ausente");
  assert.ok(/if \(!restoreArmed\)/.test(js), "Invariante ausente");
});
test('licença e fonte do fork continuam acessíveis', () => {
  assert.ok(existsSync('LICENSE'));
  assert.ok(/github\.com\/AdrianoHG\/replay/.test(html), "Invariante ausente");
  assert.ok(/AGPL/.test(html), "Invariante ausente");
});
