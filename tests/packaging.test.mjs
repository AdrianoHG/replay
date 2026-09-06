import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const dockerfile = readFileSync('Dockerfile', 'utf8');

test('arquivos estáticos são legíveis pelo UID 101 mesmo com umask 077 no host', () => {
  const copies = dockerfile.split(/\r?\n/).filter(line => /^COPY\s/.test(line));
  assert.equal(copies.length, 2, 'Revisar o contrato ao adicionar outra origem pública');
  for (const line of copies) {
    assert.match(line, /^COPY --chmod=0644 /, 'Permissões devem ser explícitas na imagem');
  }
  assert.match(dockerfile, /^USER 101:101$/m);
  assert.doesNotMatch(dockerfile, /chmod\s+(?:-R\s+)?777|USER root/);
});

test('diretório público mantém permissão de travessia após COPY --chmod', () => {
  const copy = dockerfile.indexOf('COPY --chmod=0644 index.html');
  const directory = dockerfile.indexOf('RUN chmod 0755 /srv/replay');
  const user = dockerfile.indexOf('USER 101:101');
  assert.ok(copy >= 0 && directory > copy && directory < user,
    'O diretório /srv/replay precisa de modo 0755, não do modo 0644 dos arquivos');
});
