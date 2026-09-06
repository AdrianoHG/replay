# RePlay pessoal

Fork do [RePlay da ElfHosted](https://github.com/elfhosted/replay), sob AGPL-3.0. Consulta histórico e estatísticas de Nuvio, Stremio e backends Nuvio compatíveis. A interface de acesso, navegação principal e avisos críticos foram adaptados para português brasileiro; parte dos textos analíticos permanece no idioma upstream.

## O que muda

Nuvio é a seleção inicial. Newsletter, formulários Kit, promoção comercial de hospedagem e cartões sociais comerciais foram removidos. O JavaScript fica em arquivo próprio, sem bibliotecas de runtime, permitindo CSP sem script inline. Escrita, exclusão, exportação e restauração continuam disponíveis com suas confirmações. A licença, os créditos e o código-fonte permanecem acessíveis.

## Privacidade e limites

O servidor entrega apenas arquivos estáticos. Autenticação e operações de conta são feitas diretamente pelo navegador contra o backend selecionado. Auto-hospedar este painel não auto-hospeda nem migra a conta Nuvio. Cinemeta fornece metadados e artes complementares. Não há telemetria nem scripts de terceiros no aplicativo.

A senha não é persistida pelo aplicativo. O token fica na sessão da aba por padrão. A opção de lembrar o dispositivo é desmarcada inicialmente e persiste o token por até 30 dias. Use somente backends confiáveis; a descoberta de um backend próprio pode indicar outro endpoint de autenticação. A CSP permite conexões HTTPS a hosts customizados por compatibilidade, mas não permite scripts remotos.

**Exclusões alteram o histórico real.** A restauração depende das permissões do backend e o Nuvio oficial pode recusá-la. Uma exportação pode conter URLs autenticadas de addons: proteja o arquivo. Não use testes automatizados para apagar dados reais.

## Executar

Requisitos de produção: Docker e Docker Compose. Não há banco de dados nem dependência Node.js em produção.

```sh
docker compose config --quiet
docker compose up -d --build
curl --fail http://127.0.0.1:8130/healthz
```

O serviço fica restrito a 127.0.0.1:8130. Publique-o por um reverse proxy HTTPS privado. O contêiner executa como UID 101, com sistema de arquivos somente leitura, sem capacidades Linux e sem acesso ao socket Docker. Limites: 64 MiB, 0,25 CPU e 64 processos. A imagem base é fixada por digest; somente os arquivos públicos necessários entram na imagem. O endpoint de saúde é /healthz.

## Testar

```sh
npm ci --ignore-scripts
npm run check
npm test
npm run test:e2e
```

A suíte usa Playwright com Microsoft Edge instalado, perfil temporário e contas simuladas. Sem credenciais reais. Os testes de comportamento recebem os bytes do checkout diretamente no navegador para impedir interferência da inspeção HTTP do host. Para validar os arquivos entregues por uma instância, defina REPLAY_TEST_URL com seu endereço HTTPS privado; as chamadas de conta permanecem interceptadas.

## Atualização e reversão

Atualizações não são automáticas. Revise diferenças do upstream, execute as suítes, gere um commit e reconstrua apenas este serviço. Não substitua o fork por upstream/main sem revisar as adaptações. Para reverter, use uma cópia limpa do commit anterior e reconstrua o contêiner; configurações de proxy e dashboards devem ter backup independente.

Base inicial: commit upstream 448251ca4e49f8f4595d26d1414ee37db04877b1. Consulte LICENSE para os termos completos.
