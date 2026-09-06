import http from 'node:http';
import fs from 'node:fs';
const files = {'/':'index.html','/index.html':'index.html','/app.js':'app.js','/icon.svg':'icon.svg','/LICENSE':'LICENSE'};
const mime = {'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.svg':'image/svg+xml'};
const csp = "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data:; connect-src 'self' https:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'";
http.createServer((req,res)=>{
 const key = new URL(req.url,'http://localhost').pathname;
 const file = files[key];
 if(!['GET','HEAD'].includes(req.method) || !file){res.writeHead(404);res.end();return;}
 const ext = '.'+file.split('.').pop();
 res.writeHead(200, {'Content-Type':mime[ext]||'text/plain; charset=utf-8','Content-Security-Policy':csp,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
 res.end(req.method==='HEAD' ? undefined : fs.readFileSync(file));
}).listen(18130,'127.0.0.1');
