# Validação do redesign

Referência: captura fornecida pelo usuário da Central Oracle VPS. Captura do portal pelo navegador do PC foi tentada; a captura adicional ocorreu durante carregamento. A imagem anexada, já autenticada, foi suficiente para travar o padrão visual.

## Comparação visual

- Fundo #0b1018 e sidebar #0d1520 extraídos da captura, superfícies azul-ardósia e destaque verde-água.
- Sidebar fixa no desktop; navegação recolhível no celular, com Escape e ciclo de foco.
- Tipografia hierárquica, controles com tamanho explícito, bordas de 1px e raios discretos.
- Indicadores e títulos em painéis compactos; área útil expandida em relação à página original estreita.
- Gráfico com contagens expostas e tabela equivalente; títulos, capas e dados não são substituídos por imagens do layout.
- Capturas desktop/celular/ultrawide inspecionadas. Dados dos testes são simulados.

## Desvios intencionais

Não copiar serviços, números ou textos operacionais da Central para o RePlay. Manter a identidade RePlay, a fonte de dados selecionada e as explicações analíticas. Não adicionar React/Vite nem bibliotecas de produção ao aplicativo estático. Parte dos textos descritivos retornados pelo motor permanece no idioma original, preservando os detalhes.

## Regressões detectadas e corrigidas

A tradução por fragmentos podia modificar palavras dentro de títulos nos destaques; os nomes agora são preservados em grupos capturados e links de metadados não são traduzidos. Uma otimização baseada somente nas contagens omitia atributos de acessibilidade em barras recriadas com valores iguais; a tabela e os atributos agora são reaplicados a cada renderização. Ambos têm testes de regressão.

## Método de navegador

Playwright com Microsoft Edge em perfil descartável no AdrianoPC, usando a infraestrutura existente. Nenhum acesso ao perfil, cookies ou conta real do usuário. As APIs de conta são interceptadas; antes do deploy, arquivos servidos diretamente do checkout evitam interferência da inspeção HTTP local. Após a promoção, arquivos reais por HTTPS são usados e somente as APIs de conta permanecem simuladas.

## Resultado local confirmado em 06/09/2026

Sintaxe de app.js e ui.js: PASS. Testes Node: 10/10 PASS. Testes de navegador: 16/16 PASS, incluindo comparação com o commit original, exportação integral, Nuvio, Stremio, restauração em backend próprio, confirmações de escrita, proteção de nomes e reaplicação do mesmo período. Capturas em 1440×1000, 1920×1080, 3440×1440, 390×844 e 360×800. A validação da instância publicada será registrada no relatório operacional, após a promoção.
