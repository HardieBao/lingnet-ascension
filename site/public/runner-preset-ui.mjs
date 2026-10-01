export function presetWorkbenchPage(token) {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="lingnet-workbench" content="${token}"><title>本机功法殿 · 灵网纪元</title><link rel="icon" href="data:,">
<style nonce="${token}">
:root{color-scheme:dark;font-family:Arial,"Microsoft YaHei",sans-serif;color:#e4eee9;background:#071113;font-size:16px;line-height:1.65}
*{box-sizing:border-box}body{margin:0}main{max-width:1120px;margin:auto;padding:40px 28px}h1{font-size:30px;line-height:1.3;margin:0 0 16px}h2{font-size:21px;margin:0 0 16px}h3{font-size:18px;margin:0}
p{margin:8px 0;max-width:72ch;overflow-wrap:anywhere}.muted,.help{color:#adc5be}.help{font-size:14px}header{padding-bottom:24px;border-bottom:1px solid #254044}.toolbar{display:flex;gap:16px;align-items:center;flex-wrap:wrap;margin:24px 0 12px}
.layout{display:grid;grid-template-columns:minmax(0,380px) minmax(0,1fr);gap:40px}.layout>section{min-width:0}form,fieldset{display:grid;gap:16px}fieldset{border:0;padding:0;margin:0;min-width:0}label{display:grid;gap:6px;font-size:15px}.parameters{display:grid;grid-template-columns:1fr 1fr;gap:16px}
input,select,textarea{font:inherit;background:#0e1c1e;color:inherit;border:1px solid #365452;border-radius:6px;padding:10px;width:100%;min-width:0}textarea{resize:vertical}input:focus-visible,select:focus-visible,textarea:focus-visible,button:focus-visible,summary:focus-visible{outline:2px solid #9ae3d1;outline-offset:3px}
button,.export-link{font:inherit;min-height:44px;border:1px solid #446560;border-radius:6px;padding:9px 16px;color:inherit;background:#152729;cursor:pointer;text-decoration:none;display:inline-block}button:hover:not(:disabled),.export-link:hover{background:#243e3d}.export-link:focus-visible{outline:2px solid #9ae3d1;outline-offset:3px}button.primary{background:#9ae3d1;color:#082021;border-color:#9ae3d1;font-weight:700}button.primary:hover:not(:disabled){background:#b7efdf}button:disabled,input:disabled,select:disabled,textarea:disabled{opacity:.55;cursor:not-allowed}
.notice{min-height:32px;margin:12px 0 20px;color:#9ae3d1}.notice.error{color:#eea497}.preset{padding:20px 0;border-bottom:1px solid #254044}.preset:first-child{padding-top:0}.preset-top,.actions{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:center}.actions{justify-content:flex-start;margin-top:14px}.badge{font-size:13px;color:#adc5be}.preset details{margin-top:12px}.preset summary{cursor:pointer;color:#b7dfd0}.preset details p{white-space:pre-wrap}.danger{color:#f0b8a8}.confirm{margin:12px 0}.id-field{font-size:14px;margin-top:12px}.empty{padding:24px 0}.import{margin-top:30px;padding-top:20px;border-top:1px solid #254044}footer{margin-top:36px;padding-top:20px;border-top:1px solid #254044;font-size:14px;color:#adc5be}
@media(max-width:700px){main{padding:24px 18px}.layout{grid-template-columns:1fr;gap:32px}h1{font-size:26px}.parameters{grid-template-columns:1fr}.toolbar{gap:10px}.layout>section+section{border-top:1px solid #254044;padding-top:24px}}
</style></head><body>
<!-- THESIS: Manage the real Runner presets in one local shared store; no parallel browser cache.
OWN-WORLD: Inherit Lingnet's dark green operational surfaces, mint primary actions, system controls and quiet separators.
STORY: Identify local scope, create or import a safe definition, export or explicitly delete, then use it manually in Runner.
FIRST VIEWPORT: Scope and safety copy above a two-column editor/list; mobile stacks the editor then existing presets.
FORM: Precisely scoped preset-management extension, no open visual-world or composition selection.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md -->
<main><header><h1>本机功法殿</h1><p>灵网纪元的功法预设只保存在当前修士的本机 Runner 目录。本页不启动模型，不上传提示词，也不改变任务额度。</p><p class="muted" id="scope">正在核对本机槽位…</p></header>
<div class="toolbar"><button id="refresh" type="button">刷新本机记录</button><span class="help">装备变化后，请停止此页并用新下载的 v4 任务包重新打开。</span></div>
<p id="notice" class="notice" role="status" aria-live="polite"></p>
<div class="layout"><section aria-labelledby="create-title"><h2 id="create-title">保存新功法</h2>
<form id="create" autocomplete="off"><fieldset id="fields"><label for="name">功法名称<input id="name" required maxlength="40" placeholder="例如：谨慎修订"></label>
<div class="parameters"><label for="effort">推理档位<select id="effort"><option>low</option><option>none</option><option>medium</option><option>high</option><option>xhigh</option><option>max</option></select></label>
<label for="output">单次输出上限<input id="output" type="number" min="1" max="2048" step="1" value="1024" required></label></div>
<p class="help">输出上限必须为 1–2,048。它只是单次限制，不会增加任务的 30,000 模型 Token 总额度；模型 Token 不是游戏余额或现金价格上限。</p>
<label for="prompt">补充提示<textarea id="prompt" rows="4" maxlength="1024" spellcheck="false" placeholder="只写开发偏好，不填写密钥、私人配置或自定义命令。"></textarea></label>
<button id="save" class="primary" type="submit" disabled>保存到本机槽位</button><p class="help" id="capacity">基础 1 槽，传功玉简后 2 槽；槽位按当前修士在本机共用。</p></fieldset></form>
<div class="import"><h3>导入已有功法</h3><label for="import">选择 JSON 配置<input id="import" type="file" accept=".json,application/json" disabled></label><p class="help">不超过 8 KiB，只允许名称、推理档位、补充提示和输出上限。导入也占同一槽位，不能导入密钥或任务预算。</p></div></section>
<section aria-labelledby="list-title"><h2 id="list-title">本机已存功法</h2><div id="presets" aria-busy="true"><p class="muted">正在读取记录…</p></div></section></div>
<footer><p>使用功法仍需在 Runner 中手动选择编号，并明确确认模型费用。本页不能替代真实代理限额核验；当前真实运行未自动放行。</p><p>关闭网页不会停止服务。请回到启动终端输入 stop 或按 Ctrl+C；停止只关闭本次管理服务，已存功法和历史运行记录保留。</p></footer></main>
<script nonce="${token}">
const token=document.querySelector('meta[name="lingnet-workbench"]').content;
const notice=document.querySelector('#notice'), list=document.querySelector('#presets'), form=document.querySelector('#create');
let state=null,busy=false;
function element(tag,text,className){const item=document.createElement(tag);if(text!==undefined)item.textContent=text;if(className)item.className=className;return item;}
function message(text,error=false){notice.textContent=text;notice.classList.toggle('error',error);}
function controls(){document.querySelectorAll('button,input,select,textarea').forEach(item=>{item.disabled=busy;});const full=!state||state.presets.length>=state.context.slots;document.querySelector('#save').disabled=busy||full;document.querySelector('#import').disabled=busy||full;}
async function api(path='/api/presets',body,method='POST'){
  const response=await fetch(path,{method:body===undefined?'GET':method,cache:'no-store',headers:{'X-Lingnet-Workbench':token,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const result=await response.json();if(!response.ok)throw new Error(result.error||'操作结果未确认，请先刷新核对记录。');return result;
}
async function refresh(){state=await api();render();controls();}
async function act(work,success){if(busy)return false;busy=true;controls();message('正在核对并处理…');try{await work();await refresh();message(success);return true;}catch(error){message(error instanceof Error?error.message:'结果未确认，请先刷新核对记录。',true);return false;}finally{busy=false;controls();}}
function render(){
  document.querySelector('#scope').textContent='当前修士：'+state.context.cultivatorId+' · 此任务包槽位 '+state.context.slots+' · 已存 '+state.presets.length+' · 有效至 '+new Date(state.context.expiresAt).toLocaleString('zh-CN');
  document.querySelector('#capacity').textContent=state.presets.length>=state.context.slots?'当前槽位已满。先导出备份，再明确删除旧功法，或装备玉简后重新下载任务包。':'基础 1 槽，玉简后 2 槽；所有认领共用，不因打开本页增加槽位。';
  list.replaceChildren();list.setAttribute('aria-busy','false');
  if(!state.presets.length){list.append(element('p','还没有功法。可使用「保存新功法」表单保存开发偏好，或导入安全 JSON 配置；不需要模型密钥。','empty muted'));return;}
  for(const preset of state.presets){
    const row=element('article',undefined,'preset'), top=element('div',undefined,'preset-top');top.append(element('h3',preset.name),element('span',preset.available?'当前槽位可用':'超出当前槽位 · 保留但不可启用','badge'));row.append(top);
    row.append(element('p','推理 '+preset.reasoningEffort+' · 单次输出最多 '+preset.maxOutputTokens+' 模型 Token','muted'));
    const prompt=element('details'), summary=element('summary','查看补充提示');prompt.append(summary,element('p',preset.promptSupplement||'没有补充提示。'));row.append(prompt);
    const idLabel=element('label','功法编号（用于 Runner 手动选择）','id-field'), id=element('input');id.value=preset.id;id.readOnly=true;idLabel.append(id);row.append(idLabel);
    const actions=element('div',undefined,'actions'), exportButton=element('a','导出安全 JSON','export-link');exportButton.href='/api/presets/'+preset.id+'/export';exportButton.download='lingnet-preset.json';
    exportButton.addEventListener('click',()=>message('已请求导出安全字段，请核对浏览器下载记录；没有上传到平台。'));
    actions.append(exportButton);row.append(actions);
    const discard=element('details',undefined,'confirm'), discardSummary=element('summary','删除此功法'), buttons=element('div',undefined,'actions'), confirm=element('button','确认删除此功法','danger'), cancel=element('button','保留功法');
    confirm.type=cancel.type='button';cancel.addEventListener('click',()=>{discard.open=false;discardSummary.focus();});confirm.addEventListener('click',()=>act(()=>api('/api/presets/'+preset.id,{confirm:preset.id},'DELETE'),'已删除指定本机功法。任务成果和历史运行记录仍保留。').then(ok=>{if(ok)document.querySelector('#refresh').focus();}));
    buttons.append(cancel,confirm);discard.append(discardSummary,element('p','只删除这一预设，不能撤销。建议先导出备份；任务成果和历史运行记录不会删除。'),buttons);row.append(discard);list.append(row);
  }
}
form.addEventListener('submit',async event=>{event.preventDefault();if(!form.reportValidity())return;const value={name:document.querySelector('#name').value,reasoningEffort:document.querySelector('#effort').value,maxOutputTokens:Number(document.querySelector('#output').value),promptSupplement:document.querySelector('#prompt').value};if(await act(()=>api('/api/presets',value),'已保存到本机共享槽位。')){form.reset();document.querySelector('#name').focus();}});
document.querySelector('#import').addEventListener('change',async event=>{const file=event.target.files[0];if(!file)return;if(file.size>8192){message('配置超过 8 KiB，未导入。',true);event.target.value='';return;}let value;try{value=JSON.parse(await file.text());}catch{message('JSON 配置无效，未导入；请检查文件格式。',true);event.target.value='';return;}if(await act(()=>api('/api/presets',value),'已导入同一本机槽位。'))event.target.value='';});
document.querySelector('#refresh').addEventListener('click',()=>act(()=>Promise.resolve(),'本机记录已刷新。'));
busy=true;controls();refresh().catch(()=>message('暂时无法读取本机记录。请确认终端中的服务仍在运行，刷新核对后再操作。',true)).finally(()=>{busy=false;controls();});
</script></body></html>`;
}
