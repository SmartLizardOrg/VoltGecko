import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { preview } from 'vite';
const certPath=resolve(process.env.LOCAL_HTTPS_CERT||'.cert/localhost.pem');
const keyPath=resolve(process.env.LOCAL_HTTPS_KEY||'.cert/localhost-key.pem');
if(!existsSync(certPath)||!existsSync(keyPath)){
  console.error('A helyi HTTPS-tanúsítvány hiányzik. Futtasd: powershell -ExecutionPolicy Bypass -File scripts/setup-local-https.ps1\nA telefonon a mkcert helyi hitelesítésszolgáltatóját is megbízhatóvá kell tenni. Részletek: README.md');
  process.exit(1);
}
if(!existsSync('dist/index.html')){console.error('Előbb készíts buildet: npm run build');process.exit(1);}
const server=await preview({preview:{host:'0.0.0.0',port:4173,strictPort:true,https:{key:readFileSync(keyPath),cert:readFileSync(certPath)}}});
server.printUrls();
