# RePlay pessoal: plano de implementação

Objetivo: publicar um fork estático, sem marketing, com Nuvio inicial e escrita/exclusão preservadas.

1. Preservar a licença e os adaptadores; remover somente newsletter e promoção de hospedagem.
2. Separar JavaScript para permitir CSP sem scripts inline; traduzir navegação, acesso e ações críticas.
3. Validar invariantes e fluxos em navegador com APIs simuladas, incluindo a confirmação de exclusão e restauração.
4. Empacotar servidor estático não privilegiado em contêiner somente leitura, restrito ao loopback.
5. Publicar pelos dois caminhos privados já existentes, sem Funnel; adicionar atalhos aos dashboards.
6. Verificar HTTPS, recursos estáticos, limites e regressões; registrar evidências e procedimento de reversão.

Não usar credenciais reais nos testes nem excluir histórico real. Não alterar DNS, mídia, gateway ou política do conector.

Validação de navegador: Playwright/Edge em perfil descartável; plugin Browser não disponível nesta sessão. Nos testes de comportamento, o HTML e JS vêm diretamente do checkout para evitar a injeção de scripts e alteração de CSP observada no AdGuard do host. HTTPS real e cabeçalhos do servidor são verificados separadamente no deploy.
