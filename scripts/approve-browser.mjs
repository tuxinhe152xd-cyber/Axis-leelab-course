// 核准目前等待配對的瀏覽器（Codespaces 遠端網址第一次開 Dashboard 需要做一次）
import { execFileSync } from 'node:child_process';
const run = (...a) => execFileSync('docker', ['compose','exec','-T','gateway','node','/app/openclaw.mjs','devices',...a], { encoding: 'utf8' });
const list = JSON.parse(run('list','--json'));
const pending = list.pending ?? [];
if (!pending.length) { console.log('目前沒有等待核准的瀏覽器。請先在瀏覽器打開 Dashboard 網址，看到「核准此瀏覽器」後再執行一次。'); process.exit(0); }
for (const p of pending) {
  const id = p.requestId ?? p.id;
  console.log(run('approve', id).trim());
}
console.log('已核准。回到瀏覽器，頁面會自動連線。');
