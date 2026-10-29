import { backgroundTrack } from './music-config.js';
const $ = selector => document.querySelector(selector);
const avatars=['🍯','🐻','🐶','🐱','🐰','🍓','🌷','⭐'];
const demoWishes=[
  {nickname:'一罐小蜂蜜',avatar:'🍯',message:'愿你的每一次登场，都有热爱与光相伴。JACK，生日快乐！慢慢长大，尽情闪耀。'},
  {nickname:'薄荷味的风',avatar:'🌷',message:'把最温柔的风、最好听的歌，都送给今天的你。新的一岁，也要每天开心呀。'},
  {nickname:'今天也喜欢小狗',avatar:'🐶',message:'愿你的世界永远有小狗、有音乐、有草莓蛋糕，还有很多很多的爱。'},
  {nickname:'草莓云朵',avatar:'🍓',message:'陈思罕，生日快乐！希望你一直做自己喜欢的事，自由生长，勇敢发光。'},
  {nickname:'月亮邮递员',avatar:'🐰',message:'这一封生日来信，装满了 honey 的喜欢。愿你走过的每一段路，都开满鲜花。'},
  {nickname:'小熊抱抱',avatar:'🐻',message:'愿所有美好都如约而至。累了就休息，快乐就大笑，我们把祝福轻轻放在这里。'}
].map((w,i)=>({...w,id:'demo-'+i,demo:true}));
let room, giftOpened=false, canBlow=false, finished=false;
const found=new Set();let speechTimer,toastTimer;
function toast(message){$('#toast').textContent=message;$('#toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),3600);}
function speak(message){$('#speech').textContent=message;$('#speech').classList.add('show');clearTimeout(speechTimer);speechTimer=setTimeout(()=>$('#speech').classList.remove('show'),4200);}
function openDialog(id){const d=$('#'+id);if(!d.open)d.showModal();}
function openWish(){requestId=crypto.randomUUID();$('#form-error').textContent='';openDialog('wish-dialog');}
function openGift(){
  if(!giftOpened){giftOpened=true;room?.openGift();$('#step-1').classList.add('done');$('#scene-tip').textContent='🍓 再点一下蛋糕，写下你的生日祝福';$('[data-object="gift"]').textContent='🍓 点一下蛋糕';speak('是草莓味的生日蛋糕！\n再点一下，把你的心意写下来。');playNotes([523.25,659.25,783.99],.2);}
  else if(canBlow&&!finished)openDialog('candle-dialog');else openWish();
}
const secrets={guitar:['生','拨动琴弦，愿热爱永远有回响。'],golden:['日','大金毛摇着尾巴，把好运送给你！'],dachshund:['快','小腊肠跑了好远，只为送来一个抱抱。'],cat:['乐','灰色猫咪悄悄说：今天也要被温柔以待。']};
function pick(id){
  if(id==='gift'){openGift();return;}
  const secret=secrets[id];if(!secret)return;
  room?.excite(id);found.add(id);$(`[data-object="${id}"]`).classList.add('found');$('#found-count').innerHTML=`发现彩蛋 <b>${found.size} / 4</b>`;
  if(id==='guitar')playNotes([196,246.94,293.66,392],.15,true);
  if(found.size===4){speak('「生 · 日 · 快 · 乐」\n你找到藏在小屋里的全部心意啦！');$('#found-count').innerHTML='集齐彩蛋 <b>生日快乐 ♡</b>';}
  else speak(`${secret[1]}\n你找到了一枚「${secret[0]}」字彩蛋。`);
}
document.querySelectorAll('[data-object]').forEach(b=>b.addEventListener('click',()=>pick(b.dataset.object)));
$('#start-explore').addEventListener('click',()=>{$('#room-stage').scrollIntoView({behavior:'smooth',block:'center'});$('#room-stage').focus({preventScroll:true});speak('欢迎来到 JACK 的生日小屋。\n点点小动物和吉他，也别忘了中间的礼物。');});
$('#reset-view').addEventListener('click',()=>{room?.reset();toast('回到小屋最初的角度');});
$('#write-wish').addEventListener('click',openWish);
$('#config-info').addEventListener('click',()=>openDialog('info-dialog'));
document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>$('#'+b.dataset.close).close()));
document.querySelectorAll('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}}));

// All wishes use the server API. Failed requests never masquerade as saved wishes.
let nextCursor=null, requestId=crypto.randomUUID(), loadedIds=new Set(), realItems=[];
function wishCard(w){
  const card=document.createElement('article');card.className='wish-card'+(w.demo?'':' real');card.dataset.id=w.id;
  const top=document.createElement('div');top.className='card-top';
  const avatar=document.createElement('span');avatar.className='avatar';avatar.textContent=w.avatar;avatar.setAttribute('aria-hidden','true');
  const identity=document.createElement('div');const name=document.createElement('div');name.className='card-name';name.textContent=w.nickname;
  const time=document.createElement('div');time.className='card-time';time.textContent=w.demo?'示例心意 · 非真实访客留言':new Intl.DateTimeFormat('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(w.created_at));
  identity.append(name,time);top.append(avatar,identity);
  if(w.demo){const badge=document.createElement('span');badge.className='demo-badge';badge.textContent='演示留言';top.append(badge);}
  const body=document.createElement('p');body.textContent=w.message;
  const heart=document.createElement('span');heart.className='card-heart';heart.textContent='♡';heart.setAttribute('aria-hidden','true');
  card.append(top,body,heart);return card;
}
function renderWall(){
  $('#wish-grid').replaceChildren(...realItems.map(wishCard));
  if(!nextCursor)demoWishes.forEach(w=>$('#wish-grid').append(wishCard(w)));
  $('#load-more').hidden=!nextCursor;
}
async function loadWishes(more=false){
  const button=$('#load-more');button.disabled=true;
  try{
    const res=await fetch('/api/wishes'+(more&&nextCursor?'?before='+nextCursor:''));if(!res.ok)throw new Error('load');const data=await res.json();
    if(!more){realItems=[];loadedIds=new Set();}
    for(const item of data.items)if(!loadedIds.has(item.id)){realItems.push(item);loadedIds.add(item.id);}
    nextCursor=data.nextCursor;$('#wish-total').textContent=data.total;
    $('#wall-status').textContent=data.total===0?'第一封真实来信，正在等你。下面是 6 条演示留言。':'';
    renderWall();
  }catch{
    $('#wall-status').textContent='暂时无法连接祝福墙。请检查预览服务后重试；下方演示留言仅供预览。';
    if(!realItems.length){$('#wish-total').textContent='—';$('#wish-grid').replaceChildren(...demoWishes.map(wishCard));}
    toast('祝福墙连接失败，请稍后重试');
  }finally{button.disabled=false;}
}
$('#load-more').addEventListener('click',()=>loadWishes(true));
for(const [i,a]of avatars.entries()){
  const label=document.createElement('label');label.className='avatar-choice';const input=document.createElement('input');input.type='radio';input.name='avatar';input.value=a;input.checked=i===0;input.setAttribute('aria-label',['小蜂蜜','小熊','小狗','小猫','兔子','草莓','郁金香','星星'][i]);const span=document.createElement('span');span.textContent=a;span.setAttribute('aria-hidden','true');label.append(input,span);$('#avatar-options').append(label);
}
$('#message').addEventListener('input',()=>{const count=[...$('#message').value.trim()].length;$('#char-count').textContent=`${count} / 200`;$('#message').setCustomValidity(count>200?'祝福不能超过 200 个字。':'');});
$('#nickname').addEventListener('input',()=>$('#nickname').setCustomValidity([...$('#nickname').value.trim()].length>16?'昵称不能超过 16 个字。':''));
$('#wish-form').addEventListener('submit',async e=>{
  e.preventDefault();const button=$('.submit-wish');if(button.disabled)return;
  const nickname=$('#nickname').value.trim(),message=$('#message').value.trim();
  if([...nickname].length<1||[...nickname].length>16||[...message].length<2||[...message].length>200){$('#form-error').textContent='昵称需 1–16 字，祝福需 2–200 字。';return;}
  button.disabled=true;button.textContent='正在送出心意…';$('#form-error').textContent='';
  try{
    const res=await fetch('/api/wishes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nickname,message,avatar:$('input[name="avatar"]:checked').value,website:$('input[name="website"]').value,requestId})});
    const data=await res.json();if(!res.ok)throw new Error(data.error||'这份祝福暂未送达，请重试。');
    canBlow=true;$('#step-2').classList.add('done');$('#wish-dialog').close();$('#wish-form').reset();$('#char-count').textContent='0 / 200';$('#nickname').setCustomValidity('');$('#message').setCustomValidity('');requestId=crypto.randomUUID();
    if(!giftOpened){giftOpened=true;room?.openGift();$('#step-1').classList.add('done');$('[data-object="gift"]').textContent='🍓 点一下蛋糕';}
    $('#scene-tip').textContent='心意已送达，吹灭蜡烛，让烟花绽放';await loadWishes();
    toast('祝福已保存到服务器，刷新页面也能看到');
    if(!finished)setTimeout(()=>openDialog('candle-dialog'),300);
  }catch(err){$('#form-error').textContent=err.message==='Failed to fetch'?'连接中断，祝福尚未确认保存。请重试，内容会保留。':err.message;}
  finally{button.disabled=false;button.innerHTML='送出这份心意 <span>♡</span>';}
});

// Audio is created only after an explicit user interaction.
let audioContext,musicOn=false;
const backgroundAudio=new Audio();
backgroundAudio.loop=true;
backgroundAudio.preload='none';
backgroundAudio.volume=.45;
if(backgroundTrack.src)backgroundAudio.src=backgroundTrack.src;
function audio(){if(!audioContext)audioContext=new(window.AudioContext||window.webkitAudioContext)();audioContext.resume();return audioContext;}
function playNotes(notes,spacing=.24,force=false){if(!musicOn&&!force)return;try{const ctx=audio();notes.forEach((f,i)=>{const o=ctx.createOscillator(),g=ctx.createGain();o.type='sine';o.frequency.value=f;o.connect(g);g.connect(ctx.destination);const t=ctx.currentTime+i*spacing;g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.07,t+.015);g.gain.exponentialRampToValueAtTime(.001,t+1.1);o.start(t);o.stop(t+1.2);});}catch{}}
function updateMusicControl(){
  if(backgroundTrack.embedUrl){
    $('#sound-toggle').removeAttribute('aria-pressed');
    $('#sound-toggle').setAttribute('aria-expanded',String(!$('#music-panel').hidden));
    $('#sound-toggle').setAttribute('aria-controls','music-panel');
    $('#sound-label').textContent='太阳 · QQ音乐';
    $('#sound-toggle').setAttribute('aria-label','打开陈思罕《太阳 (Live)》QQ音乐播放器');
    $('#sound-toggle').title='太阳 (Live) · TF家族-陈思罕';
    return;
  }
  $('#sound-toggle').setAttribute('aria-pressed',String(musicOn));
  $('#sound-label').textContent=backgroundTrack.src?(musicOn?'太阳 · 播放中':'太阳 · 播放'):'太阳 · 待接入';
  $('#sound-toggle').setAttribute('aria-label',backgroundTrack.src?`${musicOn?'暂停':'播放'}陈思罕演唱的《太阳》`:'陈思罕《太阳》，音频待接入');
  $('#sound-toggle').title=backgroundTrack.src?'陈思罕 · 太阳':'《太阳》音频尚未提供';
}
updateMusicControl();
$('#sound-toggle').addEventListener('click',async()=>{
  if(backgroundTrack.embedUrl){
    const panel=$('#music-panel');
    if(panel.hidden){panel.hidden=false;if(!$('#qq-player').getAttribute('src'))$('#qq-player').src=backgroundTrack.embedUrl;}
    else{panel.hidden=true;$('#qq-player').removeAttribute('src');}
    updateMusicControl();return;
  }
  if(!backgroundTrack.src){toast('《太阳》音频待接入，提供陈思罕演唱的音频文件后即可播放。');return;}
  if(musicOn){backgroundAudio.pause();musicOn=false;}else{
    try{await backgroundAudio.play();musicOn=true;}catch{musicOn=false;toast('音频暂时无法播放，请检查文件后重试。');}
  }
  updateMusicControl();
});
$('#close-music').addEventListener('click',()=>{$('#music-panel').hidden=true;$('#qq-player').removeAttribute('src');updateMusicControl();$('#sound-toggle').focus();});
$('#music-panel').addEventListener('keydown',e=>{if(e.key==='Escape')$('#close-music').click();});
backgroundAudio.addEventListener('error',()=>{musicOn=false;updateMusicControl();});
document.addEventListener('visibilitychange',()=>{
  if(document.hidden){audioContext?.suspend();backgroundAudio.pause();}
  else if(musicOn){audioContext?.resume();backgroundAudio.play().catch(()=>{musicOn=false;updateMusicControl();});}
});

// Holding is an accessible alternative to microphone input; both trigger the same ending.
let holdTimer=null,micStream=null,micCtx=null,micFrame=null,micTimeout=null;
function cancelHold(){clearTimeout(holdTimer);holdTimer=null;$('#blow-button').classList.remove('holding');}
function startHold(e){if(e.type==='keydown'&&![' ','Enter'].includes(e.key))return;if(e.repeat||holdTimer)return;e.preventDefault();$('#blow-button').classList.add('holding');holdTimer=setTimeout(celebrate,1000);}
$('#blow-button').addEventListener('pointerdown',e=>{if(e.button!==0)return;$('#blow-button').setPointerCapture(e.pointerId);startHold(e);});
$('#blow-button').addEventListener('keydown',startHold);
for(const event of ['pointerup','pointercancel','lostpointercapture','keyup','blur'])$('#blow-button').addEventListener(event,cancelHold);
function stopMic(){if(micFrame)cancelAnimationFrame(micFrame);clearTimeout(micTimeout);micStream?.getTracks().forEach(t=>t.stop());micStream=null;micCtx?.close();micCtx=null;$('#mic-button').disabled=false;}
$('#candle-dialog').addEventListener('close',()=>{cancelHold();stopMic();});
$('#mic-button').addEventListener('click',async()=>{
  $('#mic-button').disabled=true;$('#mic-status').textContent='正在请求麦克风权限…';
  try{
    if(!navigator.mediaDevices?.getUserMedia)throw new Error('unsupported');
    micStream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}});
    if(!$('#candle-dialog').open){stopMic();return;}
    micCtx=new(window.AudioContext||window.webkitAudioContext)();await micCtx.resume();const analyser=micCtx.createAnalyser();analyser.fftSize=1024;micCtx.createMediaStreamSource(micStream).connect(analyser);const values=new Uint8Array(analyser.fftSize);let sustained=0,previous=performance.now();
    $('#mic-status').textContent='麦克风已开启，对着麦克风持续轻吹约 1 秒。';
    const listen=()=>{if(!micCtx)return;analyser.getByteTimeDomainData(values);const rms=Math.sqrt(values.reduce((sum,v)=>sum+((v-128)/128)**2,0)/values.length);const now=performance.now();sustained=rms>.085?sustained+Math.min(now-previous,100):Math.max(0,sustained-35);previous=now;if(sustained>750){celebrate();return;}micFrame=requestAnimationFrame(listen);};listen();
    micTimeout=setTimeout(()=>{stopMic();$('#mic-status').textContent='暂时没有检测到吹气，可以重试，或按住上方按钮。';},15000);
  }catch{stopMic();$('#mic-status').textContent='麦克风未开启，请按住上方按钮，同样能吹灭蜡烛。';}
});
function celebrate(){
  if(!canBlow)return;cancelHold();stopMic();$('#candle-dialog').close();room?.blow();finished=true;
  $('#step-3').classList.add('done');$('#scene-tip').textContent='愿每一个心愿，都在未来轻轻实现。';
  $('#room-stage').scrollIntoView({behavior:'smooth',block:'center'});$('#birthday-reveal').classList.add('show');$('#birthday-reveal').setAttribute('aria-hidden','false');$('#room-stage').setAttribute('aria-label','蜡烛已经吹灭，金粉色烟花绽放。生日快乐，陈思罕！');
  setTimeout(fireworks,400);playNotes([523.25,659.25,783.99,1046.5],.25,true);toast('生日快乐，陈思罕！愿所有美好都向你奔赴。');
}
function fireworks(){
  const canvas=$('#fireworks'),ctx=canvas.getContext('2d');const r=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio,2);canvas.width=r.width*dpr;canvas.height=r.height*dpr;ctx.scale(dpr,dpr);
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;let particles=[];const colors=['#d5ae68','#e9b7b1','#efcdd1','#c49b63','#efd293','#d799a4'];
  function burst(){const x=r.width*(.2+Math.random()*.6),y=r.height*(.08+Math.random()*.35);for(let i=0;i<(reduced?18:64);i++){const a=Math.PI*2*i/64,s=.8+Math.random()*2.5;particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:1,color:colors[i%colors.length],size:1+Math.random()*1.5});}}
  let start=performance.now(),next=0,last=start;
  function frame(now){const t=now-start,delta=Math.min((now-last)/16.67,2);last=now;ctx.clearRect(0,0,r.width,r.height);if(t>next&&t<(reduced?700:5500)){burst();next+=reduced?1000:650;}particles=particles.filter(p=>p.life>0);for(const p of particles){p.x+=p.vx*delta;p.y+=p.vy*delta;p.vy+=.022*delta;p.vx*=.99;p.life-=.008*delta;ctx.globalAlpha=Math.max(0,p.life);ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(p.x,p.y,p.size,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;if(particles.length||t<5500)requestAnimationFrame(frame);else ctx.clearRect(0,0,r.width,r.height);}requestAnimationFrame(frame);
}

loadWishes();
try{
  const {createRoom}=await import('./room.js');room=createRoom($('#scene-container'),pick);$('#loading').hidden=true;
}catch(error){
  console.error('3D room failed:',error);$('#loading').textContent='当前设备未能打开 3D 场景，可使用下方按钮继续探索和完成生日惊喜。';$('#loading').style.padding='40px';$('#loading').style.textAlign='center';
}
