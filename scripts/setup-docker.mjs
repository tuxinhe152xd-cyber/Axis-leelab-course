import {mkdir,writeFile,access,copyFile,chmod}from'node:fs/promises';
import{randomBytes}from'node:crypto';
import{dirname,resolve}from'node:path';import{fileURLToPath}from'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
await mkdir(root+'/.secrets',{recursive:true,mode:0o700});await chmod(root+'/.secrets',0o700);
try{await access(root+'/.secrets/gateway.env');console.log('Keeping existing gateway secrets.');}catch{
 await writeFile(root+'/.secrets/gateway.env','AXIS_GATEWAY_TOKEN='+randomBytes(32).toString('hex')+'\n',{mode:0o600});console.log('Created a gateway token (not printed).');
}
try{await access(root+'/.env');}catch{await copyFile(root+'/.env.example',root+'/.env');await chmod(root+'/.env',0o600);console.log('Created .env from .env.example.');}
console.log('Next: fill your model key in .env, then run: docker compose up --build -d');
