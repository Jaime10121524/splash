import {readFileSync,existsSync} from 'node:fs'
import {resolve} from 'node:path'

const file=resolve(process.cwd(),'.env.capacitor.local')
if(!existsSync(file)){
 console.error('Copie .env.capacitor.example para .env.capacitor.local e configure o domínio HTTPS real.')
 process.exit(1)
}
const text=readFileSync(file,'utf8')
const match=text.match(/^\s*VITE_SPLASH_API_ORIGIN\s*=\s*['"]?(https:\/\/[^\s'"]+)/m)
if(!match){
 console.error('A configuração exige VITE_SPLASH_API_ORIGIN=https://SEU-DOMINIO-REAL')
 process.exit(1)
}
const url=new URL(match[1])
if(['localhost','127.0.0.1','example.com','seu-dominio-real.com.br'].includes(url.hostname.toLowerCase())
  || url.pathname!=='/' || url.search || url.hash){
 console.error('Informe somente a origem HTTPS real da API, sem subcaminhos.')
 process.exit(1)
}
console.log('API HTTPS configurada para build Capacitor:',url.origin)
