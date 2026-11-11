// npm run lab:up — check .env first, then start. Without this, an empty model key makes the gateway
// restart in a loop and the only hint is in `docker compose logs`.
import {readFileSync,existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const envPath=new URL('../.env',import.meta.url);
if(!existsSync(envPath)){console.error('找不到 .env。先執行：npm run lab:setup');process.exit(1);}
const env=Object.fromEntries(readFileSync(envPath,'utf8').split('\n').filter(l=>/^[A-Z_]+=/.test(l)).map(l=>[l.slice(0,l.indexOf('=')),l.slice(l.indexOf('=')+1).trim()]));
const provider=env.MODEL_PROVIDER||'anthropic';
const need=provider==='anthropic'?['ANTHROPIC_API_KEY']:['MODEL_BASE_URL','MODEL_ID','MODEL_API_KEY'];
const missing=need.filter(k=>!env[k]||env[k].includes('<'));
if(missing.length){
 console.error('.env 還沒填好：'+missing.join('、')+'。\n請打開 .env 填好，存檔後再執行：npm run lab:up\n（金鑰只放在 .env，不要貼到對話或截圖。）');
 process.exit(1);
}
process.exit(spawnSync('docker',['compose','up','--build','-d'],{stdio:'inherit'}).status??1);
