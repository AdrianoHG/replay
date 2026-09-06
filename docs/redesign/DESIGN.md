# RePlay Central: contrato de design

Referência aprovada: captura da Central Oracle VPS fornecida pelo usuário em 06/09/2026, após autenticação no navegador. Direção: fundo azul-escuro neutro, superfícies azul-ardósia, destaque verde-água, ícones lineares, bordas finas e navegação lateral fixa. Não é uma cópia do conteúdo nem das métricas da Central.

## Superfícies

Login com contexto à esquerda e formulário à direita; visão geral com resumo e indicadores compactos; ranking e distribuição de horários; gêneros, décadas e elenco; histórico pesquisável; perfis, informações da conta e operações de exportação/restauração/exclusão. Todos os recursos existentes permanecem presentes, com IDs e contratos originais. A navegação leva às seções, sem ocultar recursos.

## Arquitetura e limites

Manter HTML/JavaScript estáticos e Nginx existente. Não introduzir framework, banco, telemetria, fontes remotas nem bibliotecas de produção. app.js permanece idêntico ao baseline, exceto o identificador de versão. styles.css concentra os tokens e os layouts. ui.js é uma camada de apresentação: navegação, busca em elementos já renderizados, acessibilidade e tradução de rótulos, sem fetch, credenciais, serialização da conta ou alteração de cálculos.

## Semântica

Usar registros, não prometer sessões ou títulos únicos onde o backend mantém episódios/progresso. Manter notas sobre estimativas e limites. Horários mostram a última marca temporal dos registros, não a distribuição completa de sessões. Valores do gráfico acessíveis por teclado e tabela; categorias com rótulo e valor explícitos. Busca filtra apenas o histórico apresentado e não muda indicadores nem a conta. Não persistir texto de busca ou dados pessoais na URL.

## Responsividade e aceitação

Desktop 1440/1920, ultrawide e celular 390/360. Menu móvel com expansão explícita, foco visível, sem transbordamento horizontal, animação reduzida. Manter transparência de ausência de metadados. Preservar export JSON integral e confirmações de escrita; testes usam contas simuladas. Comparar resultados semânticos ao baseline, verificar imagem em navegador, publicar somente após aprovação de testes e preservar backup existente.
