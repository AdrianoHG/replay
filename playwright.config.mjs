import {defineConfig} from '@playwright/test';
export default defineConfig({
 testDir:'./tests',testMatch:'*.spec.mjs',workers:1,timeout:30000,reporter:'list',
 outputDir:'../replay-evidence/test-results',
 use:{baseURL:process.env.REPLAY_TEST_URL||'http://127.0.0.1:18130',channel:'msedge',locale:'pt-BR',timezoneId:'America/Sao_Paulo',reducedMotion:'reduce',screenshot:'only-on-failure'},
 webServer:process.env.REPLAY_TEST_URL?undefined:{command:'node tests/server.mjs',url:'http://127.0.0.1:18130',reuseExistingServer:false}
});
