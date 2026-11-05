'use strict';
const API=String(window.NYC_API_URL||'').replace(/\/$/,'');
const $=selector=>document.querySelector(selector);
const state={token:'',user:null,query:'',offset:0,total:0,users:[],headers:[],current:null,options:[],accounts:[],importRows:[],importErrors:[],exportErrors:[],exportRows:[],exportHeaders:[],importBusy:false};
const environment=String(window.NYC_ENVIRONMENT||'production').trim().toLowerCase();
const HEAD_CODES=['A ID','B Code','C Campus ID','D Email','E Prefix TH','F Prefix EN','G First TH','H Last TH','I First EN','J Last EN','K Birth date','L Gender','M Type','N Associated Student ID','O Degree','P Study year','Q Faculty ID','R Department ID','S Curriculum ID','T Nationality','U Citizen ID','V Passport ID','W Status'];
const GROUPS={prefix:'คำนำหน้าชื่อ',gender:'เพศ',role:'ประเภทผู้ใช้',degree:'วุฒิที่สำเร็จแล้ว',studyYear:'ชั้นปี',currentLevel:'ระดับที่กำลังศึกษา',department:'สาขาวิชา',nationality:'สัญชาติ'};
const EXPECTED=['ID','Code','Campus id','Email','Prefix(TH)','Prefix(EN)','First name(TH)','Last name(TH)','First name(EN)','Last name(EN)','Birth date','Gender','Type','Associated Student ID','Degree','Study year','Faculty id','Department id','Curriculum id','Nationality','Citizen id','Passport id','Status'];
function message(selector,text,ok=false){const el=$(selector);if(!el)return;el.textContent=text;el.className='form-message '+(ok?'ok':'bad');}
function node(tag,text,className=''){const el=document.createElement(tag);if(text!==undefined)el.textContent=String(text);if(className)el.className=className;return el;}
let pendingOperations = 0;
function beginLoading() {
  let status = document.getElementById('operation-loading');
  if (!status) {
    status = document.createElement('div');
    status.id = 'operation-loading';
    status.setAttribute('role', 'status');
    Object.assign(status.style, {position:'fixed',bottom:'1rem',right:'1rem',zIndex:'1000',padding:'.75rem 1rem',borderRadius:'.75rem',background:'#12333b',color:'white',boxShadow:'0 4px 20px #0003'});
    const progress = document.createElement('progress');
    progress.setAttribute('aria-label','กำลังดำเนินการ');
    progress.style.width = '2.5rem';
    status.append(progress, ' กำลังดำเนินการ…');
    document.body.append(status);
  }
  pendingOperations++;
  status.hidden = false;
  return () => { status.hidden = --pendingOperations === 0; };
}
async function request(path,data={}){if(!API)throw Error('ไม่ได้ตั้งค่า API');if(!state.token&&path!=='login')throw Error('กรุณาเข้าสู่ระบบ');const done=beginLoading();const headers={'Content-Type':'application/json'};if(state.token)headers.Authorization='Bearer '+state.token;const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),28000);try{const response=await fetch(`${API}/api/admin/${path}`,{method:'POST',headers,body:JSON.stringify(data),cache:'no-store',signal:controller.signal});let result;try{result=await response.json();}catch{throw Error('API ไม่ตอบข้อมูล JSON');}if(!response.ok||!result.ok){if(response.status===401&&path!=='login')endSession();throw Error(result.error||'เกิดข้อผิดพลาด');}return result;}catch(error){if(error.name==='AbortError')throw Error('คำขอหมดเวลา กรุณาตรวจผลล่าสุดก่อนลองอีกครั้ง');throw error;}finally{clearTimeout(timer);done();}}
function dataTable(headers,rows,action){const table=node('table');table.className='data-table';const head=node('thead'),headRow=node('tr');headers.forEach(value=>headRow.append(node('th',value)));head.append(headRow);const body=node('tbody');for(const row of rows){const tr=node('tr');row.forEach(value=>tr.append(node('td',value)));if(action){const td=node('td'),button=node('button','จัดการ','btn secondary small');button.type='button';button.onclick=()=>action(row);td.append(button);tr.append(td);}body.append(tr);}table.append(head,body);return table;}
const SESSION_KEY = 'nyc-admin-session:' + API;
function saveSession(result) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({
      token: result.token,
      expiresAt: result.expiresAt
    }));
  } catch {}
}
async function restoreSession() {
  let saved;
  try { saved = JSON.parse(sessionStorage.getItem(SESSION_KEY)); } catch {}
  if (!saved || !/^[A-Za-z0-9_-]{40,180}$/.test(saved.token) ||
      !Number.isFinite(Date.parse(saved.expiresAt)) || Date.parse(saved.expiresAt) <= Date.now()) {
    endSession();
    return;
  }
  state.token = saved.token;
  $('#login').hidden = true;
  try {
    const result = await request('dashboard');
    if (!result.user) throw Error('ตรวจสอบบัญชีไม่ได้');
    state.user = result.user;
    showAdmin(result);
  } catch (error) {
    // A temporary outage should not discard a still-valid server session.
    state.token = '';
    $('#login').hidden = false;
    message('#login-msg', error.message);
  }
}
function showAdmin(dashboard) {
  $('#login').hidden = true;
  $('#app').hidden = false;
  applyRole();
  message('#login-msg', '');
  if (dashboard) renderStats(dashboard);
  else activateTab('overview');
}
function endSession(){try{sessionStorage.removeItem(SESSION_KEY);}catch{}state.token='';state.user=null;$('#app').hidden=true;$('#login').hidden=false;$('#user-editor').hidden=true;$('#reset-box').hidden=true;}
function applyRole(){const superAdmin=state.user?.role==='SUPER_ADMIN';document.querySelectorAll('.super-only').forEach(el=>el.hidden=!superAdmin);$('#session-username').textContent=state.user?.username||'';$('#session-role').textContent=superAdmin?'Super Admin':'Admin';}
function activateTab(name){document.querySelectorAll('[data-tab]').forEach(el=>el.classList.toggle('active',el.dataset.tab===name));document.querySelectorAll('.pane').forEach(el=>el.classList.toggle('active',el.id===`pane-${name}`));$('#admin-menu').classList.remove('mobile-open');$('#menu-toggle').setAttribute('aria-expanded','false');const loaders={overview:loadStats,users:loadUsers,options:loadOptions,accounts:loadAccounts,settings:loadSettings,export:validateExport};if(loaders[name])loaders[name]().catch(error=>alert(error.message));}
function renderCounts(selector,values){const out=$(selector);out.replaceChildren();const items=Object.entries(values||{}).sort((a,b)=>b[1]-a[1]);if(!items.length){out.textContent='ยังไม่มีข้อมูล';return;}items.forEach(([label,value])=>{const row=node('div');row.append(node('span',label),node('strong',value));out.append(row);});}
async function loadStats(){renderStats(await request('dashboard'));}
function renderStats(result){$('#stats').replaceChildren();for(const [label,value] of [['ทะเบียนทั้งหมด',result.stats.total],['เปิดใช้งาน',result.stats.active],['นักเรียน/นักศึกษา',result.stats.student],['ครู/บุคลากร',result.stats.staff]]){const card=node('div',undefined,'stat-card');card.append(node('small',label),node('strong',value));$('#stats').append(card);}renderCounts('#types',result.stats.type);renderCounts('#degrees',result.stats.degree);$('#stats-status').textContent='โหลดข้อมูลล่าสุดแล้ว';}
async function loadUsers(){const result=await request('users',{query:state.query,offset:state.offset});state.users=result.rows;state.headers=result.headers;state.total=result.total;const rows=result.rows.map(row=>[row[0],row[1],`${row[6]} ${row[7]}`.trim(),row[3],row[12],row[22]]);const out=$('#users-result');out.replaceChildren();out.append(dataTable(['ID','Code','ชื่อ','อีเมล','ประเภท','สถานะ',''],rows,shown=>editUser(result.rows.find(row=>row[0]===shown[0]))));$('#user-page').textContent=`${state.total?state.offset+1:0}–${Math.min(state.offset+30,state.total)} จาก ${state.total}`;}
function renderRecordFields(container,values,editableId=false){container.replaceChildren();values.forEach((value,index)=>{const label=node('label',HEAD_CODES[index]),input=node('input');input.value=value;input.dataset.i=String(index);input.maxLength=180;if((index===0&&!editableId)||index===2)input.disabled=true;label.append(input);container.append(label);});}
function editUser(row){if(!row)return;state.current=row.slice();$('#user-editor').hidden=false;$('#editing-id').textContent=row[0];renderRecordFields($('#editor-fields'),row);$('#user-history').replaceChildren();message('#edit-message','');$('#user-editor').scrollIntoView({behavior:'smooth',block:'start'});}
function currentEditorValues(){const values=state.current.slice();$('#editor-fields').querySelectorAll('input').forEach(input=>{if(!input.disabled)values[Number(input.dataset.i)]=input.value.trim();});return values;}
function blankRecord(){const values=Array(23).fill('');values[2]='1';values[22]='Active';return values;}
async function loadOptions(){const result=await request('options');state.options=result.options;renderOptions();}
function populateLevelSelect(selected=[]){const select=$('#option-levels');select.replaceChildren();state.options.filter(item=>item.category==='currentLevel'&&item.enabled).forEach(item=>{const option=new Option(item.labelTh,item.code);option.selected=selected.includes(item.code);select.add(option);});}
function renderOptions(){const category=$('#option-category').value,items=state.options.filter(item=>item.category===category).sort((a,b)=>a.sort-b.sort),relation=['studyYear','department'].includes(category);$('#option-levels-label').hidden=!relation;populateLevelSelect();const out=$('#option-list');out.replaceChildren();const rows=items.map(item=>[item.code,item.labelTh,item.labelEn,item.enabled?'เปิด':'ปิด',item.levelCodes?.join(', ')||'ทุกระดับ',item.facultyId||'',item.departmentId||'',item.curriculumId||'']);out.append(dataTable(['รหัส','ไทย','English','สถานะ','ระดับที่สัมพันธ์','Q','R','S',''],rows,shown=>{const item=items.find(value=>value.code===shown[0]),form=$('#option-form');for(const name of ['code','labelTh','labelEn','sort','audience','facultyId','departmentId','curriculumId'])form.elements[name].value=item[name]??'';form.elements.enabled.checked=item.enabled;populateLevelSelect(item.levelCodes||[]);form.scrollIntoView({behavior:'smooth'});}));}
async function loadSettings(){const result=await request('settings'),form=$('#settings-form');for(const [key,value] of Object.entries(result.settings||{})){const field=form.elements[key];if(!field)continue;if(field.type==='checkbox')field.checked=String(value)==='true';else field.value=value;}Array.from(form.elements).forEach(field=>{if(field.name!=='otpRequired')field.disabled=Boolean(result.readOnly);});}
async function loadAccounts() {
  if (state.user?.role !== 'SUPER_ADMIN') return;
  state.accounts = (await request('accounts')).accounts;
  renderAccounts();
}
function renderAccounts() {
  const query = $('#account-search')?.value.trim().toLowerCase() || '';
  const accounts = state.accounts.filter(a => [a.displayName,a.username,a.role,a.status].some(v=>String(v||'').toLowerCase().includes(query)));
  const out = $('#account-list');
  out.replaceChildren();
  if (!accounts.length) { out.textContent = 'ไม่พบบัญชีผู้ดูแล'; return; }
  const table = dataTable(['ชื่อ','Username','บทบาท','สถานะ','เปลี่ยนรหัสล่าสุด','จัดการ'], accounts.map(a=>[a.displayName,a.username,a.role,a.status,a.passwordChangedAt||'-']), row=>editAccount(accounts.find(a=>a.username===row[1])));
  Array.from(table.tBodies[0].rows).forEach((row,i)=>{
    const account = accounts[i];
    if (account.status !== 'ACTIVE' || account.id === state.user?.id) return;
    const button = node('button','ปิดใช้งาน','btn secondary');
    button.type = 'button';
    button.onclick = async () => {
      if (!confirm('ปิดใช้งานบัญชี '+account.username+' หรือไม่? สามารถเปิดใช้งานอีกครั้งได้')) return;
      button.disabled = true;
      try {
        await request('account-save',{id:account.id,username:account.username,displayName:account.displayName,role:account.role,status:'DISABLED'});
        if ($('#account-form').elements.id.value===account.id) clearAccountForm();
        await loadAccounts();
        message('#account-msg','ปิดใช้งานบัญชีแล้ว',true);
      } catch (error) { message('#account-msg',error.message); }
      finally { button.disabled=false; }
    };
    row.lastElementChild.append(' ',button);
  });
  out.append(table);
}
$('#account-search')?.addEventListener('input',renderAccounts);
function editAccount(account){const form=$('#account-form');form.elements.id.value=account.id;form.elements.displayName.value=account.displayName;form.elements.username.value=account.username;form.elements.role.value=account.role;form.elements.status.value=account.status;form.elements.password.value='';$('#new-account-password-label').hidden=true;$('#account-form-title').textContent='แก้ไขบัญชีผู้ดูแล';form.scrollIntoView({behavior:'smooth'});const reset=$('#reset-form');reset.elements.id.value=account.id;$('#reset-account-name').textContent=account.username;$('#reset-box').hidden=false;}
function clearAccountForm(){const form=$('#account-form');form.reset();form.elements.id.value='';form.elements.status.value='ACTIVE';form.elements.role.value='ADMIN';$('#new-account-password-label').hidden=false;$('#account-form-title').textContent='เพิ่มบัญชีผู้ดูแล';$('#reset-box').hidden=true;message('#account-msg','');}
function csvCell(value){let text=String(value??'');if(/^[\s]*[=+@\-]/.test(text))text="'"+text;return `"${text.replace(/"/g,'""')}"`;}
function download(name,rows){const csv='\ufeff'+rows.map(row=>row.map(csvCell).join(',')).join('\r\n'),url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),a=node('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function normalizeRow(row){const out=Array.from({length:23},(_,i)=>String(row[i]??'').trim());out[2]='1';if(!out[22])out[22]='Active';if(/^\d+(\.\d+)?$/.test(out[10])){const n=Number(out[10]);if(n>20000&&n<70000)out[10]=new Date(Date.UTC(1899,11,30)+n*86400000).toISOString().slice(0,10);}return out;}
async function validateExport(){const button=$('#export-btn');button.disabled=true;button.setAttribute('aria-busy','true');state.exportErrors=[];state.exportRows=[];state.exportHeaders=[];message('#export-msg','กำลังตรวจสอบข้อมูล...');try{let total=0,passed=0,failed=0;for(let offset=0;;offset+=100){const result=await request('export',{offset,excludedOffset:offset});state.exportHeaders=result.headers;state.exportRows.push(...result.rows);state.exportErrors.push(...(result.excluded||[]));total=result.totalRegistrations;passed=result.passedCount;failed=result.failedCount;if(!result.hasMore&&!result.excludedHasMore)break;if(offset>50000)throw Error('ข้อมูลเกิน 50,000 รายการ');}$('#export-total').textContent=total;$('#export-passed').textContent=passed;$('#export-failed').textContent=failed;$('#download-export').disabled=!state.exportRows.length;$('#export-report').disabled=!state.exportErrors.length;renderExportErrors();message('#export-msg',`ตรวจสอบแล้ว ${total} รายการ · ผ่าน ${passed} · ไม่ผ่าน ${failed}`,true);}catch(error){message('#export-msg','ตรวจสอบไม่สำเร็จ: '+error.message);}finally{button.disabled=false;button.removeAttribute('aria-busy');}}
function renderExportErrors(){const out=$('#exclusions');out.replaceChildren();if(!state.exportErrors.length){out.append(node('p','ไม่มีรายการที่ไม่ผ่าน'));return;}const table=node('table');table.className='data-table';const head=node('tr');['ID','ประเภท','คอลัมน์/ฟิลด์','สาเหตุ',''].forEach(value=>head.append(node('th',value)));const thead=node('thead');thead.append(head);table.append(thead);const body=node('tbody');for(const item of state.exportErrors){const tr=node('tr'),fields=(item.issues||[]).map(issue=>`${issue.column} ${issue.field}`).join(', ');[item.id,item.type||'',fields,item.reason].forEach(value=>tr.append(node('td',value)));const td=node('td'),button=node('button','แก้ไขข้อมูล','btn secondary small');button.type='button';button.onclick=async()=>{state.query=item.reference;state.offset=0;$('#query').value=item.reference;activateTab('users');await loadUsers();const row=state.users.find(value=>value[0]===item.reference);if(row)editUser(row);};td.append(button);tr.append(td);body.append(tr);}table.append(body);out.append(table);}

document.querySelectorAll('[data-password-target]').forEach(button=>button.onclick=()=>{const input=document.getElementById(button.dataset.passwordTarget),show=input.type==='password';input.type=show?'text':'password';button.textContent=show?'ซ่อน':'แสดง';button.setAttribute('aria-pressed',String(show));});
$('#login-form').onsubmit=async event=>{event.preventDefault();const form=event.currentTarget,button=form.querySelector('[type=submit]'),data=Object.fromEntries(new FormData(form));button.disabled=true;button.setAttribute('aria-busy','true');message('#login-msg','กำลังตรวจสอบ...');try{const result=await request('login',data);state.token=result.token;state.user=result.user;saveSession(result);form.reset();showAdmin();}catch(error){message('#login-msg','เข้าสู่ระบบไม่สำเร็จ: '+error.message);}finally{button.disabled=false;button.removeAttribute('aria-busy');}};
$('#logout').onclick=async()=>{try{await request('logout');}catch{}endSession();};
$('#menu-toggle').onclick=()=>{const open=$('#admin-menu').classList.toggle('mobile-open');$('#menu-toggle').setAttribute('aria-expanded',String(open));};
document.querySelectorAll('[data-tab]').forEach(button=>button.onclick=()=>activateTab(button.dataset.tab));
$('#reload-stats').onclick=()=>loadStats().catch(error=>message('#stats-status',error.message));
$('#refresh-users').onclick=()=>loadUsers().catch(error=>alert(error.message));
$('#search-users').onclick=()=>{state.query=$('#query').value.trim();state.offset=0;loadUsers().catch(error=>alert(error.message));};
$('#prev-users').onclick=()=>{state.offset=Math.max(0,state.offset-30);loadUsers().catch(error=>alert(error.message));};
$('#next-users').onclick=()=>{if(state.offset+30<state.total)state.offset+=30;loadUsers().catch(error=>alert(error.message));};
$('#open-create-user').onclick=()=>{const values=blankRecord();renderRecordFields($('#create-fields'),values,true);$('#create-fields').querySelector('[data-i="2"]').disabled=true;$('#user-create').hidden=false;message('#create-message','');};
$('#cancel-create-user').onclick=()=>{$('#user-create').hidden=true;};
$('#create-user').onclick=async()=>{const values=blankRecord();$('#create-fields').querySelectorAll('input').forEach(input=>values[Number(input.dataset.i)]=input.value.trim());try{await request('user-create',{values,currentLevel:$('#create-current-level').value.trim(),major:$('#create-major').value.trim(),dataAck:$('#create-data-ack').checked,bankPermission:$('#create-bank-permission').checked,confirmAuthority:$('#create-authority').checked});message('#create-message','เพิ่มรายการและบันทึก Audit แล้ว',true);$('#user-create').hidden=true;await loadUsers();}catch(error){message('#create-message',error.message);}};
$('#save-user').onclick=async()=>{if(!state.current)return;try{await request('user-save',{id:state.current[0],values:currentEditorValues()});message('#edit-message','บันทึกสำเร็จ',true);$('#user-editor').hidden=true;await loadUsers();}catch(error){message('#edit-message',error.message);}};
$('#deactivate-user').onclick=async()=>{if(!state.current||!confirm('ยืนยันปิดใช้งานรายการนี้? ข้อมูลจะยังคงอยู่และกู้คืนได้'))return;try{await request('user-deactivate',{id:state.current[0],confirm:true});message('#edit-message','ปิดใช้งานแล้ว ข้อมูลยังคงอยู่และแก้กลับได้',true);await loadUsers();}catch(error){message('#edit-message',error.message);}};
$('#load-user-history').onclick=async()=>{if(!state.current)return;try{const result=await request('user-history',{id:state.current[0]}),out=$('#user-history');out.replaceChildren();if(!result.history.length)out.textContent='ยังไม่มีประวัติ';result.history.forEach(item=>out.append(node('p',`${item.timestamp} · ${item.action} · ${item.actorId}`)));}catch(error){message('#edit-message',error.message);}};
$('#reload-options').onclick=()=>loadOptions().catch(error=>alert(error.message));
$('#option-category').onchange=renderOptions;
$('#option-form').onsubmit=async event=>{event.preventDefault();const form=event.currentTarget,data=Object.fromEntries(new FormData(form));data.enabled=form.elements.enabled.checked;data.category=$('#option-category').value;data.levelCodes=Array.from($('#option-levels').selectedOptions).map(option=>option.value);try{await request('option-save',data);message('#option-msg','บันทึกตัวเลือกแล้ว',true);await loadOptions();}catch(error){message('#option-msg',error.message);}};
$('#reload-accounts').onclick=()=>loadAccounts().catch(error=>alert(error.message));
$('#account-form').onsubmit=async event=>{event.preventDefault();const form=event.currentTarget,data=Object.fromEntries(new FormData(form));try{await request('account-save',data);message('#account-msg','บันทึกบัญชีแล้ว',true);clearAccountForm();await loadAccounts();}catch(error){message('#account-msg',error.message);}};
$('#clear-account-form').onclick=clearAccountForm;
$('#reset-form').onsubmit=async event=>{event.preventDefault();const form=event.currentTarget,data=Object.fromEntries(new FormData(form));if(!confirm('ยืนยันรีเซ็ตรหัสผ่านและเพิกถอน Session ของบัญชีนี้?'))return;try{await request('password-reset',data);form.elements.password.value='';message('#reset-msg','รีเซ็ตรหัสผ่านและเพิกถอน Session แล้ว',true);}catch(error){message('#reset-msg',error.message);}};
$('#password-form').onsubmit=async event=>{event.preventDefault();const form=event.currentTarget,data=Object.fromEntries(new FormData(form));try{const result=await request('password-change',data);if(result.reauthenticate){form.reset();endSession();message('#login-msg','เปลี่ยนรหัสผ่านแล้ว กรุณาเข้าสู่ระบบใหม่',true);}}catch(error){message('#password-msg',error.message);}};
$('#settings-form').onsubmit=async event=>{event.preventDefault();const form=event.currentTarget,data=Object.fromEntries(new FormData(form));data.registrationOpen=form.elements.registrationOpen.checked;data.bankExportEnabled=form.elements.bankExportEnabled.checked;data.otpRequired=true;if(data.bankExportEnabled&&!confirm('ยืนยันเปิดการจัดเตรียมไฟล์ธนาคาร?'))return;try{await request('settings-save',data);message('#settings-msg','บันทึกการตั้งค่าแล้ว',true);}catch(error){message('#settings-msg',error.message);}};
$('#file').onchange=async event=>{const file=event.target.files[0];state.importRows=[];state.importErrors=[];$('#import-report').hidden=true;$('#import-btn').disabled=true;if(!file)return;const done=beginLoading();try{const rows=await NYCXLSX.parse(file);if(rows.length<2)throw Error('ไฟล์ไม่มีข้อมูล');if(rows[0].length!==23||rows[0].some((value,index)=>!String(value||'').toLowerCase().startsWith(EXPECTED[index].toLowerCase())))throw Error('หัวคอลัมน์ไม่ตรงแม่แบบ A–W');state.importRows=rows.slice(1).map((row,index)=>({rowNumber:index+2,row})).filter(item=>item.row.some(value=>String(value).trim())).map(item=>({rowNumber:item.rowNumber,row:normalizeRow(item.row)}));$('#import-preview').textContent=`ตรวจหัวตารางผ่าน · ${state.importRows.length} รายการ`;$('#import-btn').disabled=!state.importRows.length;}catch(error){$('#import-preview').textContent='ไม่สำเร็จ: '+error.message;}finally{done();}};
$('#import-report').onclick=()=>download('NYC_Import_Errors.csv',[['แถว Excel','ID (ปกปิด)','ช่องที่ผิด','สาเหตุ'],...state.importErrors.map(item=>[item.row,item.id||'',(item.fields||[]).join(' / '),item.reason])]);
$('#import-btn').onclick=async()=>{if(!state.importRows.length||state.importBusy||!confirm(`ยืนยันนำเข้า ${state.importRows.length} รายการ?`))return;const button=$('#import-btn');state.importBusy=true;button.disabled=true;state.importErrors=[];let added=0,rejected=0,processed=0;try{for(let i=0;i<state.importRows.length;i+=30){const batch=state.importRows.slice(i,i+30),result=await request('import',{rows:batch.map(item=>item.row),rowNumbers:batch.map(item=>item.rowNumber),startRow:i+2});added+=result.added||0;rejected+=result.rejected||0;processed+=batch.length;state.importErrors.push(...(result.errors||[]));message('#import-msg',`ตรวจ ${processed}/${state.importRows.length} · เพิ่ม ${added} · ไม่ผ่าน ${rejected}`,true);}await loadStats();}catch(error){message('#import-msg',`หยุดหลัง ${processed} รายการ: ${error.message}`);}finally{state.importBusy=false;button.disabled=false;$('#import-report').hidden=!state.importErrors.length;}};
$('#export-btn').onclick=validateExport;
$('#download-export').onclick=()=>download('NYC_Krungthai_Import_A-W_REVIEW.csv',[state.exportHeaders,...state.exportRows]);
$('#export-report').onclick=()=>download('NYC_Export_Errors.csv',[['ID (ปกปิด)','ประเภท','คอลัมน์','ฟิลด์','สาเหตุ'],...state.exportErrors.flatMap(item=>(item.issues||[]).map(issue=>[item.id,item.type||'',issue.column,issue.field,issue.message]))]);
const badge=$('#environment-badge');if(badge)badge.hidden=environment!=='staging';

restoreSession();
