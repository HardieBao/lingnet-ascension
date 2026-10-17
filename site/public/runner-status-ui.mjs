export function runnerStatusPage(token) {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="lingnet-status" content="${token}"><title>本机闭关状态 · 灵网纪元</title><link rel="icon" href="data:,">
<style nonce="${token}">
:root{color-scheme:dark;font-family:Arial,"Microsoft YaHei",sans-serif;font-size:16px;line-height:1.65;color:#e4eee9;background:#071113}*{box-sizing:border-box}body{margin:0}main{max-width:1120px;margin:auto;padding:40px 28px}h1{font-size:30px;line-height:1.3;margin:0 0 16px}h2{font-size:21px;margin:0 0 16px}h3{font-size:18px;margin:0}p{margin:8px 0;max-width:72ch;overflow-wrap:anywhere}.muted{color:#adc5be}header{padding-bottom:24px;border-bottom:1px solid #254044}.toolbar{display:flex;gap:20px;align-items:center;flex-wrap:wrap;margin:24px 0 12px}button{font:inherit;min-height:44px;padding:9px 16px;border:1px solid #9ae3d1;border-radius:6px;background:#9ae3d1;color:#082021;font-weight:700;cursor:pointer}button:hover:not(:disabled){background:#b7efdf}button:disabled{opacity:.55;cursor:not-allowed}button:focus-visible,input:focus-visible{outline:2px solid #9ae3d1;outline-offset:3px}label{display:flex;align-items:center;gap:10px;min-height:44px;cursor:pointer}input{width:18px;height:18px;accent-color:#9ae3d1}.connection{min-height:32px;margin:12px 0 20px;color:#9ae3d1}.connection.error,.warning{color:#f0b8a8}.layout{display:grid;grid-template-columns:minmax(0,360px) minmax(0,1fr);gap:40px}.layout>section{min-width:0}dl{margin:16px 0}dl>div{display:flex;justify-content:space-between;gap:20px;padding:10px 0;border-bottom:1px solid #254044}dt{color:#adc5be}dd{margin:0;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}meter{width:100%;height:24px;accent-color:#9ae3d1}.checkpoint{padding:20px 0;border-bottom:1px solid #254044}.checkpoint:first-child{padding-top:0}code{font-size:14px;overflow-wrap:anywhere}.checkpoint p{margin:6px 0}.warning{margin:16px 0}footer{margin-top:36px;padding-top:20px;border-top:1px solid #254044;color:#adc5be;font-size:14px}[hidden]{display:none!important}
@media(max-width:700px){main{padding:24px 18px}h1{font-size:26px}.layout{grid-template-columns:1fr;gap:32px}.layout>section+section{border-top:1px solid #254044;padding-top:24px}.toolbar{gap:10px}}
</style></head><body>
<!-- THESIS: Inspect the same local Runner budget and checkpoint metadata without spending or changing them.
OWN-WORLD: Existing dark green operation surface, mint native controls, readable system type and flat rows.
STORY: Read local observations, distinguish confirmed usage from reservations and unknowns, then return to the Runner terminal.
FIRST VIEWPORT: Task scope and refresh above budget details beside checkpoint rows; mobile reads budget first.
FORM: Precisely specified read-only companion to the existing local preset workbench; no new-world or comp selection.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md -->
<main><header><h1>本机闭关状态</h1><p>查看 Runner 的执行阶段、预算和检查点。本页只读，具体执行操作仍在终端完成。</p><p class="muted" id="scope">正在读取本机任务包…</p><p class="muted" id="expiry">任务包截止状态待核对。</p></header>
<div class="toolbar"><button id="refresh" type="button">刷新本机状态</button><label><input id="auto" type="checkbox" checked>每2秒自动读取（只读）</label></div>
<p class="connection" id="connection" role="status" aria-live="polite">正在读取本机状态…</p>
<section aria-labelledby="progress-title"><h2 id="progress-title">执行进度</h2><div id="progress" aria-live="polite"><p>正在读取 Runner 进度…</p></div><p class="muted">心跳来自本机 Runner，每2秒记录一次，超过10秒未更新显示失联。成果就绪后，请回到任务页面提交；平台租约与提交结果以任务页面为准。</p></section>
<div class="layout"><section aria-labelledby="budget-title"><h2 id="budget-title">模型额度与用量</h2><p class="muted">模型 Token 不是游戏 Token、账户余额或现金价格上限。</p>
<dl><div><dt>任务总额度</dt><dd id="total">未知</dd></div><div><dt>本机网关已确认消耗</dt><dd id="spent">未知</dd></div><div><dt>预留 / 未核清额度</dt><dd id="reserved">未知</dd></div><div><dt>剩余可请求额度</dt><dd id="remaining">未知</dd></div><div><dt>单次输出上限</dt><dd id="output">未知</dd></div></dl>
<meter id="occupancy" min="0" max="30000" value="0" aria-label="已确认消耗与保守预留合计占用" hidden></meter><p id="occupied" class="muted">当前额度占用未知。</p><p id="warning" class="warning" hidden>额度占用已达到90%，包括保守预留。请核对记录，不要重置额度或删除异常锁后重试。</p><p id="halt" class="muted">预算状态待核对。</p><p id="updated" class="muted">预算记录更新时间未知。</p><p class="muted">模型进程与平台心跳：未核验。本机文件、锁或本页连接正常，都不能证明模型仍在运行。</p></section>
<section aria-labelledby="checkpoint-title"><h2 id="checkpoint-title">本机检查点元数据</h2><p class="muted" id="slots">正在读取共用槽位…</p><div id="checkpoints" aria-busy="true"><p class="muted">正在读取元数据…</p></div><p class="muted">这里只展示元数据，不检查产物可恢复性。过期记录保留原状，恢复标记存在也不证明恢复已完成。</p></section></div>
<footer><p>本机观察不是平台租约、可信用量上传、真实费用或正式成果的证明。任务包到期只能观察，不能据此恢复、延长或补回模型额度。</p><p>关闭网页不会停止模型或状态服务。请回到启动终端输入 stop 或按 Ctrl+C，仅关闭本页的状态服务；原记录保留。</p></footer></main>
<script nonce="${token}">
const token=document.querySelector('meta[name="lingnet-status"]').content, button=document.querySelector('#refresh'), auto=document.querySelector('#auto');
let busy=false,lastClaim=null,lastObserved=null,lastProgress=null;
const text=(id,value)=>{document.getElementById(id).textContent=value;};
const date=value=>Number.isFinite(value)?new Date(value).toLocaleString('zh-CN'):'未知';
const count=value=>Number.isSafeInteger(value)?value.toLocaleString('zh-CN'):'未知';
function element(tag,value){const item=document.createElement(tag);if(value!==undefined)item.textContent=value;return item;}
function claimState(){if(!lastClaim)return;text('scope','任务 '+lastClaim.missionId+' · 认领 '+lastClaim.id);text('expiry',Date.now()>=lastClaim.expiresAt?'任务包已到期，仅供只读观察；不能据此继续执行。':'任务包截止：'+date(lastClaim.expiresAt)+'；平台当前租约仍未核验。');}
function unknown(){lastProgress=null;for(const id of ['total','spent','reserved','remaining','output'])text(id,'未知');document.querySelector('#occupancy').hidden=true;document.querySelector('#warning').hidden=true;text('occupied','当前额度占用未知。');text('halt','预算状态未知，请核对本机记录，不要删除异常锁。');text('updated','预算记录更新时间未知。');text('slots','检查点槽位与记录状态未知。');const list=document.querySelector('#checkpoints');list.replaceChildren(element('p','当前检查点元数据未知，未删除或恢复任何记录。'));list.setAttribute('aria-busy','false');document.querySelector('#progress').replaceChildren(element('p','运行进度暂不可用，请核对 Runner 终端。'));}
function progressState(){
  if(!lastProgress)return;
  const progress=lastProgress,progressList=document.querySelector('#progress');progressList.replaceChildren();
  const phases={preparing:'准备环境与固定基线',restoring:'恢复检查点',model:'调用本机执行器',validating:'校验成果范围',exporting:'导出成果',preflight:'运行本地预检',ready:'成果就绪，等待提交',failed:'本次执行失败，请查看终端'};
  if(progress.status==='unavailable')progressList.append(element('p','进度记录暂不可用，请核对 Runner 终端。'));
  else if(progress.status!=='observed')progressList.append(element('p','尚无执行进度，运行任务后自动显示。'));
  else if(!progress.entries.length)progressList.append(element('p','当前任务尚无执行记录。'));
  for(const entry of progress.entries??[]){const stale=Date.now()-entry.updatedAt>10000;const row=element('article');row.className='checkpoint';row.append(element('h3',phases[entry.phase]??'阶段未知'),element('p',entry.heartbeat==='ended'?'本次执行已结束':stale?'超过10秒未取得新心跳，当前执行状态未知':'最近收到 Runner 心跳'),element('p','最后更新：'+date(entry.updatedAt)),element('code',entry.id));progressList.append(row);}
}
function render(state){
  lastClaim=state.claim;lastObserved=state.observedAt;lastProgress=state.progress;claimState();progressState();const budget=state.budget;
  text('total',count(budget.tokenBudget));text('output',count(budget.maxOutputTokens));text('spent',count(budget.knownSpent));text('reserved',count(budget.reserved));text('remaining',count(budget.remaining));
  const known=budget.status==='observed', meter=document.querySelector('#occupancy');meter.hidden=!known;if(known){meter.max=budget.tokenBudget;meter.value=budget.tokenBudget-budget.remaining;}
  text('occupied',known?'额度占用 '+count(budget.tokenBudget-budget.remaining)+' / '+count(budget.tokenBudget)+'，包括保守预留。':'缺失或异常记录，当前额度占用未知，不记作零。');document.querySelector('#warning').hidden=budget.nearLimit!==true;
  text('halt',!known?'预算记录未知或不可用，请核对本机记录。':budget.halted?'网关记录有预留或待核对状态；这不是恢复或模型进程活性证明。':'网关记录未标记待核对；是否有模型进程仍需本机核对。');text('updated','预算记录更新时间：'+date(budget.modifiedAt));
  const checkpoints=state.checkpoints,list=document.querySelector('#checkpoints');list.replaceChildren();list.setAttribute('aria-busy','false');text('slots','任务包检查点槽位：'+count(checkpoints.slots)+'，按当前修士在本机共用。');
  if(checkpoints.status!=='observed')list.append(element('p','缺失或异常记录，当前检查点元数据未知；未知不当作没有检查点。'));
  else if(!checkpoints.entries.length)list.append(element('p','当前读取到的本机目录没有检查点元数据；本页不会创建记录。'));
  for(const record of checkpoints.entries){const row=element('article');row.className='checkpoint';row.append(element('h3',record.forCurrentClaim?'此认领的检查点':'同修士另一认领的检查点'),element('code',record.id),element('p','创建：'+date(record.createdAt)),element('p','保留至：'+date(record.retainUntil)+(record.expired?' · 已到期，本页不清理':'')),element('p',record.context.status==='model-failed'?'元数据记录：保存于模型失败后。':'元数据记录：保存于模型完成后。'));if(record.restoreMarker)row.append(element('p','已有恢复标记：需核对本机恢复结果，不能据此重复恢复。'));list.append(row);}
}
async function refresh(){if(busy)return;busy=true;button.disabled=true;button.textContent='正在读取…';try{const response=await fetch('/api/status',{cache:'no-store',headers:{'X-Lingnet-Status':token},signal:AbortSignal.timeout(5000)});if(!response.ok)throw new Error('Unavailable');render(await response.json());text('connection','已读取本机记录：'+date(lastObserved)+'。这不是模型心跳。');document.querySelector('#connection').classList.remove('error');}catch{unknown();claimState();text('connection','本机服务失联或状态不可用，当前观察为未知。请核对启动终端，再刷新；不会自动启动或恢复模型。'+(lastObserved?' 上次成功读取：'+date(lastObserved)+'。':''));document.querySelector('#connection').classList.add('error');}finally{busy=false;button.disabled=false;button.textContent='刷新本机状态';}}
button.addEventListener('click',refresh);setInterval(()=>{claimState();progressState();if(auto.checked&&!document.hidden)refresh();},2000);refresh();
</script></body></html>`;
}
