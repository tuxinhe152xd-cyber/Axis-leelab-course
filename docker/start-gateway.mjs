import {mkdir,writeFile,readFile,cp,rm,readdir}from'node:fs/promises';
import {spawn,spawnSync}from'node:child_process';
import {classroomModel}from'./model-config.mjs';
const selected=classroomModel();
const state='/home/node/.openclaw';
await mkdir(state,{recursive:true,mode:0o700});
await mkdir(state+'/tmp',{recursive:true,mode:0o700});
await mkdir(state+'/cache',{recursive:true,mode:0o700});
process.env.TMPDIR=state+'/tmp';process.env.XDG_CACHE_HOME=state+'/cache';process.env.NODE_COMPILE_CACHE=state+'/cache/node';
const workspace=state+'/workspace/main';
await mkdir(workspace,{recursive:true,mode:0o700});
// Remove first: a file that was copied in by hand belongs to another user and could not be overwritten (EACCES crash loop).
await rm(workspace+'/AGENTS.md',{force:true});
await writeFile(workspace+'/AGENTS.md',await readFile('/opt/axis/workspace/AGENTS.md'),{mode:0o600});
// Skills shipped in the repo (workspace/skills/*) are installed into the agent workspace on every start; skills installed another way are left alone.
await mkdir(workspace+'/skills',{recursive:true,mode:0o700});
for(const name of await readdir('/opt/axis/workspace/skills').catch(()=>[])){
 await rm(workspace+'/skills/'+name,{recursive:true,force:true});
 await cp('/opt/axis/workspace/skills/'+name,workspace+'/skills/'+name,{recursive:true}).catch(e=>console.warn('Could not install skill',name+':',e.message));
}
const tokenSet=Boolean(process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim()),secretSet=Boolean(process.env.LINE_CHANNEL_SECRET?.trim());
if(!['0','1',''].includes(process.env.LINE_ENABLED||''))throw Error('LINE_ENABLED must be 0 or 1.');
const line=process.env.LINE_ENABLED==='1';
if(line&&(!tokenSet||!secretSet))throw Error('LINE_ENABLED=1 requires both LINE_CHANNEL_ACCESS_TOKEN and LINE_CHANNEL_SECRET.');
const origins=['http://127.0.0.1:18795','http://localhost:18795'];
if(process.env.CODESPACE_NAME){const n=process.env.CODESPACE_NAME,d=process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN||'app.github.dev';if(!/^[a-z0-9-]+$/i.test(n)||!/^[a-z0-9.-]+$/i.test(d))throw Error('Invalid Codespaces origin');origins.push(`https://${n}-18795.${d}`,'https://localhost:18795','https://127.0.0.1:18795');}
// Tools: the minimal profile plus only what the lessons need (read for skills, MCP tools, optionally web_fetch). Everything else, e.g. browser, canvas,
// nodes, TTS, was sent to the model on every call: ~34K tokens before, ~6K now. Add a skill name to `skills` below when you install another one.
// 2026-11-11: `cron` lets the agent create (paused) schedules by chat; the students edit data/inventory.csv themselves and the import_csv MCP tool loads it; write/edit/exec stay denied.
// Opt-in features, switched on in .env when a lesson needs them: AXIS_CRON=1 (scheduler), AXIS_WEB_FETCH=1 (agent may fetch web pages).
// Scheduling and web fetch are always on (the lessons need them); there is no .env switch any more, so an old .env cannot turn them off.
const cronOn=true,webFetchOn=true;
// Codespaces forwards every request through GitHub's proxy (X-Forwarded-* headers); the Gateway rejects that unless the proxy hop is trusted. Only the lab's own Docker subnet is trusted, and only inside a Codespace (on a laptop the browser connects directly, and trusting the bridge would reject it).
// 2026-11-14: temperature 0.2 (steadier tool use and numbers). Set via agents.defaults.models[<provider/model>].params; verify it reaches the model before relying on it.
const config={
 gateway:{mode:'local',bind:'lan',port:18789,auth:{mode:'token',token:process.env.AXIS_GATEWAY_TOKEN},...(process.env.CODESPACE_NAME?{trustedProxies:['172.28.77.0/24']}:{}),controlUi:{allowedOrigins:origins},http:{endpoints:{chatCompletions:{enabled:true}}}},
 agents:{ownership:'explicit',defaults:{workspace,skipBootstrap:true,skills:['workflow-decompose'],heartbeat:{every:'0m'},model:{primary:selected.primary},models:{[selected.primary]:{params:{temperature:0.2}}},maxConcurrent:2},entries:{main:{}}},
 session:{dmScope:'per-channel-peer'},
 models:{mode:'merge',providers:{classroom:selected.provider}},
 cron:{enabled:cronOn},
 skills:{workshop:{autonomous:{mode:'off'}}},
 plugins:{slots:{memory:'none'},allow:[...(line?['line']:[])],entries:{'memory-core':{enabled:false},...(line?{line:{enabled:true}}:{})}},
 tools:{toolSearch:false,profile:'minimal',alsoAllow:['read','bundle-mcp',...(cronOn?['cron']:[]),...(webFetchOn?['web_fetch']:[])],deny:['group:runtime','write','edit','apply_patch','gateway','plugins','openclaw','heartbeat_respond',...(webFetchOn?['web_search','x_search']:['group:web']),'message','sessions_spawn','sessions_send'],fs:{workspaceOnly:true},elevated:{enabled:false},exec:{security:'deny',ask:'always'},agentToAgent:{enabled:false},sessions:{visibility:'agent'}},
 ...(line?{bindings:[{agentId:'main',match:{channel:'line',accountId:'default'}}]}:{}),
 ...(line?{channels:{line:{enabled:true,dmPolicy:'pairing',groupPolicy:'disabled',channelAccessToken:'${LINE_CHANNEL_ACCESS_TOKEN}',channelSecret:'${LINE_CHANNEL_SECRET}'}}}:{})
};
await writeFile(state+'/openclaw.json',JSON.stringify(config,null,2),{mode:0o600});
// MCP servers are declared in mcp/servers.json (mounted read-only) and registered with OpenClaw's own CLI at every start.
// Do not put them in the config above: OpenClaw restores its previous backup when the file is rewritten without its metadata ("missing-meta-vs-last-good").
try{
 const servers=JSON.parse(await readFile('/home/node/mcp/servers.json','utf8'));
 const env={...process.env,OPENCLAW_STATE_DIR:state,OPENCLAW_CONFIG_PATH:state+'/openclaw.json'};
 for(const [name,def] of Object.entries(servers)){
  const r=spawnSync('node',['/app/openclaw.mjs','mcp','set',name,JSON.stringify(def)],{encoding:'utf8',env,timeout:60000});
  console.log('MCP server',name,r.status===0?'registered':'FAILED: '+(r.stderr||r.stdout||'').trim().slice(0,200));
 }
}catch(e){if(e.code!=='ENOENT')throw Error('mcp/servers.json: '+e.message);}
// The official LINE plugin is only trusted when installed from the official npm package (a local load path is refused).
// The install record lives in the persistent state volume, so this runs once and is skipped afterwards.
if(line){
 const env={...process.env,OPENCLAW_STATE_DIR:state,OPENCLAW_CONFIG_PATH:state+'/openclaw.json',npm_config_cache:state+'/cache/npm',npm_config_logs_dir:state+'/tmp/npm-logs',npm_config_update_notifier:'false'};
 const wanted=JSON.parse(await readFile('/opt/axis/line/package.json','utf8')).dependencies['@openclaw/line'];
 if(!/^\d+\.\d+\.\d+$/.test(wanted))throw Error('LINE plugin version must be an exact pin.');
 let trusted=false;
 try{const r=spawnSync('node',['/app/openclaw.mjs','plugins','inspect','line','--json'],{encoding:'utf8',env,timeout:60000});const p=JSON.parse(r.stdout).plugin;trusted=p?.trustedOfficialInstall===true&&p.packageVersion===wanted;}catch{}
 if(!trusted){
  console.log('Installing official LINE plugin @openclaw/line@'+wanted+' (needs outbound network, one time).');
  const r=spawnSync('node',['/app/openclaw.mjs','plugins','install','@openclaw/line@'+wanted],{stdio:'inherit',env,timeout:240000});
  if(r.status!==0)throw Error('Official LINE plugin install failed; check outbound network and retry.');
 }
}
console.log('AXIS Gateway. Model mode:',selected.mode);
const args=process.argv.length>2?process.argv.slice(2):['gateway','run'];
const p=spawn('node',['/app/openclaw.mjs',...args],{env:{...process.env,OPENCLAW_STATE_DIR:state,OPENCLAW_CONFIG_PATH:state+'/openclaw.json'},stdio:'inherit'});
for(const sig of['SIGINT','SIGTERM'])process.on(sig,()=>p.kill(sig));p.on('exit',code=>process.exit(code??1));
