import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';

test('wishes API: persistence, pagination, validation and submission protection',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'jack-wishes-test-'));
  const dbPath=join(dir,'test.sqlite');
  const port=String(19000+Math.floor(Math.random()*10000));
  const origin=`http://127.0.0.1:${port}`;
  let child;
  async function start(){
    child=spawn(process.execPath,['server.mjs'],{cwd:new URL('../',import.meta.url),env:{...process.env,PORT:port,DB_PATH:dbPath},stdio:['ignore','pipe','pipe']});
    await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('server startup timeout')),5000);child.stdout.on('data',data=>{if(data.toString().includes('Birthday room:')){clearTimeout(timeout);resolve();}});child.on('error',reject);child.on('exit',code=>{if(code!==null&&code!==0)reject(new Error('server exited '+code));});});
  }
  async function stop(){if(!child||child.exitCode!==null)return;await new Promise(resolve=>{child.once('exit',resolve);child.kill();});}
  const post=(body,headers={})=>fetch(origin+'/api/wishes',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
  const valid={nickname:'测试 honey',message:'愿你自由生长，生日快乐！',avatar:'🍯',requestId:randomUUID()};
  try{
    await start();
    const home=await fetch(origin);assert.equal(home.status,200);assert.match(await home.text(),/陈思罕/);
    assert.equal((await (await fetch(origin+'/api/wishes')).json()).total,0);
    assert.equal((await post({...valid,message:'a'})).status,400);
    assert.equal((await post({...valid,message:'好'.repeat(201)})).status,400);
    assert.equal((await post({...valid,nickname:'名'.repeat(17)})).status,400);
    assert.equal((await post({...valid,message:'https://spam.example 来看看'})).status,400);
    assert.equal((await post({...valid,message:'去死'})).status,400);
    assert.equal((await post({...valid,avatar:'🦊'})).status,400);
    assert.equal((await post(valid,{Origin:'https://other.example'})).status,403);
    const saved=await post(valid);assert.equal(saved.status,201);const first=(await saved.json()).item;assert.equal(first.message,valid.message);
    const idem=await post(valid);assert.equal(idem.status,200);assert.equal((await idem.json()).item.id,first.id);
    const limited=await post({...valid,message:'另一句不同的祝福',requestId:randomUUID()});assert.equal(limited.status,429);assert.ok(Number(limited.headers.get('Retry-After'))>0);
    await stop();await start();
    const reloaded=await(await fetch(origin+'/api/wishes')).json();assert.equal(reloaded.total,1);assert.equal(reloaded.items[0].nickname,valid.nickname);
    const db=new DatabaseSync(dbPath);db.prepare('UPDATE wishes SET created_at=?').run(Date.now()-60000);
    const duplicate=await post({...valid,requestId:randomUUID()});assert.equal(duplicate.status,409);
    const insert=db.prepare('INSERT INTO wishes(nickname,message,avatar,created_at,client_hash,fingerprint,request_id) VALUES(?,?,?,?,?,?,?)');
    for(let i=0;i<8;i++)insert.run('测试 '+i,'分页测试祝福 '+i,'⭐',Date.now()+i,'test-client-'+i,'test-fingerprint-'+i,randomUUID());db.close();
    const page1=await(await fetch(origin+'/api/wishes')).json();assert.equal(page1.total,9);assert.equal(page1.items.length,6);assert.ok(page1.nextCursor);
    const page2=await(await fetch(origin+'/api/wishes?before='+page1.nextCursor)).json();assert.equal(page2.items.length,3);assert.equal(page2.nextCursor,null);
    assert.equal(new Set([...page1.items,...page2.items].map(w=>w.id)).size,9);
    assert.ok(page1.items.every((w,i,a)=>i===0||w.id<a[i-1].id));
    assert.equal((await fetch(origin+'/api/wishes?before=-1')).status,400);
  }finally{await stop();await rm(dir,{recursive:true,force:true});}
});
