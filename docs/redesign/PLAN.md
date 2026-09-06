# Plano de execução

1. Revalidar backup, checkout, saúde e referência visual.
2. Registrar testes de preservação dos IDs e hash do motor; executar RED para os novos componentes.
3. Reorganizar index.html; criar styles.css e ui.js sem tocar na lógica de app.js.
4. Atualizar whitelist dos servidores de testes/Docker para os novos recursos estáticos.
5. Rodar invariantes, fluxos Nuvio/Stremio e testes de interface, busca, teclado, zero dados, metadados ausentes e responsividade. Comparar números/exports com a versão anterior.
6. Construir imagem candidata na VPS; validar healthcheck e rollback isolado da imagem preservada. Promover somente RePlay, sem alterar proxy, portas ou dashboards.
7. Repetir testes por HTTPS, comparar demais contêineres e persistir estado e evidências no Drive.
