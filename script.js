const authWrapper    = document.querySelector('.auth-wrapper');
const loginTrigger   = document.querySelector('.login-trigger');
const registerTrigger = document.querySelector('.register-trigger');

if (registerTrigger) {
  registerTrigger.addEventListener('click', (e) => {
    e.preventDefault();
    authWrapper.classList.add('toggled');
  });
}

if (loginTrigger) {
  loginTrigger.addEventListener('click', (e) => {
    e.preventDefault();
    authWrapper.classList.remove('toggled');
  });
}

const ui = (function(){
  const API_BASE = "https://your-app.onrender.com";

  // ---- Helpers ----
  function getUser(){ return JSON.parse(localStorage.getItem('fa_user') || 'null'); }
  function setUser(u){ localStorage.setItem('fa_user', JSON.stringify(u)); }
  function clearUser(){ localStorage.removeItem('fa_user'); localStorage.removeItem('fa_user_name'); }

  function showToast(msg, type='info', timeout=3000){
    const container = document.getElementById('toastContainer') || createToastContainer();
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = msg;
    el.style.cssText = "margin:8px;padding:10px;border-radius:8px;background:rgba(0,0,0,0.75);color:#fff;max-width:360px;box-shadow:0 4px 12px rgba(0,0,0,0.4);opacity:0;transition:opacity .22s";
    container.appendChild(el);
    requestAnimationFrame(()=> el.style.opacity = '1');
    setTimeout(()=> { el.style.opacity = '0'; setTimeout(()=> el.remove(), 300); }, timeout);
  }
  function createToastContainer(){
    const c = document.createElement('div');
    c.id = 'toastContainer';
    c.style.cssText = "position:fixed;right:16px;top:16px;z-index:9999";
    document.body.appendChild(c);
    return c;
  }

  async function apiJson(res){ return res.json().catch(()=>({status:'error', message:'Invalid JSON'})); }
  function formatNumber(n){ return Number(n).toLocaleString('en-IN'); }
  function formatDate(d){ return d ? d.slice(0,10) : ''; }
  function todayISO(){ return new Date().toISOString().slice(0,10); }
  function safeUserId(){ const u = getUser(); return u ? (u.id || u.user_id || u.userId) : null; }
  function escapeHtml(s){ return String(s||'').replace(/[&<>"'`=\/]/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','/':'&#x2F;','`':'&#x60;','=':'&#x3D;'}[c]; }); }

  // ---- AUTH ----
  async function login(){
    const email = document.getElementById('loginEmail')?.value?.trim();
    const pw = document.getElementById('loginPassword')?.value?.trim();
    if(!email || !pw){ showToast('Enter email & password','error'); return; }

    try{
      const res = await fetch(`${API_BASE}/login`, {
        method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({email, password: pw})
      });
      const data = await apiJson(res);
      if(res.ok && data.status === 'success'){
        setUser(data.user);
        localStorage.setItem('fa_user_name', data.user.name || data.user.email);
        showToast('Login successful','success');
        setTimeout(()=> window.location.href = 'dashboard.html', 600);
      } else showToast(data.message || 'Login failed','error');
    } catch(e){
      console.error(e); showToast('Server not reachable','error');
    }
  }

  async function signup(){
    const name = document.getElementById('signupName')?.value?.trim();
    const email = document.getElementById('signupEmail')?.value?.trim();
    const pw = document.getElementById('signupPassword')?.value?.trim();
    const pw2 = document.getElementById('signupPassword2')?.value?.trim();
    if(!name || !email || !pw){ showToast('Complete all fields','error'); return; }
    if(pw !== pw2){ showToast('Passwords do not match','error'); return; }

    try{
      const res = await fetch(`${API_BASE}/signup`, {
        method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({name,email,password:pw})
      });
      const data = await apiJson(res);
      if(res.ok && data.status === 'success'){
        showToast('Account created — please login','success');
        setTimeout(()=> { window.location.href = 'index.html'; }, 900);
      } else showToast(data.message || 'Signup failed','error');
    } catch(e){ console.error(e); showToast('Server not reachable','error'); }
  }

  function logout(){
    clearUser();
    showToast('Logged out','info');
    setTimeout(()=> window.location.href = 'index.html', 350);
  }

  async function resetPassword(){
    const email = document.getElementById('resetEmail')?.value?.trim();
    if(!email){ showToast('Enter registered email','error'); return; }
    showToast('Password reset link (demo) — implement email flow later','info', 3500);
  }

  // ---- TRANSACTIONS ----
  async function fetchTransactions(){
    const userId = safeUserId(); if(!userId) return [];
    try{
      const res = await fetch(`${API_BASE}/transactions?user_id=${userId}`);
      if(!res.ok){ showToast('Failed to fetch transactions','error'); return []; }
      const data = await apiJson(res); return data.transactions || [];
    } catch(e){ console.error(e); showToast('Server not reachable','error'); return []; }
  }

  async function addTransaction(){
    const userId = safeUserId(); if(!userId){ showToast('Please login','error'); window.location.href='index.html'; return; }
    const category = document.getElementById('txnCategory')?.value?.trim() || document.getElementById('quickCat')?.value?.trim();
    const amount = Number(document.getElementById('txnAmount')?.value || document.getElementById('quickAmt')?.value);
    const type = document.getElementById('txnType')?.value || document.getElementById('quickType')?.value || 'expense';
    const date = new Date().toISOString().slice(0,10);
    if(!category || !amount){ showToast('Enter category & amount','error'); return; }

    try{
      const res = await fetch(`${API_BASE}/transactions`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ user_id: userId, category, amount, type, date })
      });
      const data = await apiJson(res);
      if(res.ok){
        showToast('Transaction added','success');
        await renderTxns();
        await updateDashboard();
        if(window.location.pathname.split('/').pop().includes('budget')) await fetchAndRenderBudget();
      }
      else showToast(data.message || 'Add failed','error');
    } catch(e){ console.error(e); showToast('Server not reachable','error'); }
  }

  async function renderTxns(){
    const list = document.getElementById('txnList'); if(!list) return;
    list.innerHTML = '<div class="muted">Loading...</div>';
    const txns = await fetchTransactions();
    if(!txns.length){ list.innerHTML = '<div class="muted">No transactions yet</div>'; return; }
    list.innerHTML = '';
    txns.slice(0,200).forEach(t=>{
      const div = document.createElement('div'); div.className='txn-item';
      const dateText = formatDate(t.date || t.created_at || '');
      const amt = Number(t.amount || 0);
      div.innerHTML = `<div><strong>${t.category || '—'}</strong><div class="muted">${dateText}</div></div><div><span style="color:${t.type==='income' ? '#6ee7b7' : '#ff8a8a'}">₹${formatNumber(amt)}</span></div>`;
      list.appendChild(div);
    });
  }

  // ---- GOALS (ENHANCED) ----
  async function fetchGoals(){
    const userId = safeUserId(); if(!userId) return [];
    try{
      const res = await fetch(`${API_BASE}/goals?user_id=${userId}`);
      if(!res.ok){ showToast('Failed to fetch goals','error'); return []; }
      const data = await apiJson(res); return data.goals || [];
    } catch(e){ console.error(e); showToast('Server not reachable','error'); return []; }
  }

  async function addGoal(){
    const userId = safeUserId(); if(!userId){ showToast('Please login','error'); window.location.href='index.html'; return; }
    const name = document.getElementById('goalName')?.value?.trim();
    const target = Number(document.getElementById('goalAmount')?.value);
    const date = document.getElementById('goalDate')?.value;
    if(!name || !target || !date){ showToast('Complete goal form','error'); return; }
    try{
      const res = await fetch(`${API_BASE}/goals`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ user_id: userId, name, target, saved:0, date })
      });
      const data = await apiJson(res);
      if(res.ok){ showToast('Goal added','success'); document.getElementById('goalName').value=''; document.getElementById('goalAmount').value=''; document.getElementById('goalDate').value=''; await renderGoals(); await updateDashboard(); }
      else showToast(data.message || 'Add goal failed','error');
    } catch(e){ console.error(e); showToast('Server not reachable','error'); }
  }

  async function renderGoals(){
    const container = document.getElementById('goalList'); if(!container) return;
    container.innerHTML = '<div class="muted">Loading...</div>';
    const goals = await fetchGoals();
    if(!goals.length){ container.innerHTML = '<div class="muted">No goals yet</div>'; updateGoalSummary(0,0,0); return; }

    let total = goals.length, completed = 0, inprogress = 0;
    goals.forEach(g => {
      const st = (g.status || '').toLowerCase();
      if(st === 'completed' || (Number(g.saved||0) >= Number(g.target||0))) completed++; else inprogress++;
    });
    updateGoalSummary(total, inprogress, completed);

    container.innerHTML = '';
    goals.forEach(g=>{
      const saved = Number(g.saved || 0);
      const target = Number(g.target || 0);
      const prog = Math.min(100, Math.round((saved/Math.max(target,1))*100));
      const dateText = formatDate(g.date || '');
      const daysLeft = getRemainingDays(g.date);

      const div = document.createElement('div'); div.className='goal-card';
      div.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:flex-start">
          <div>
            <strong style="font-size:16px">${escapeHtml(g.name || g.goal_name)}</strong>
            <div class="muted" style="margin-top:4px">${dateText} • ${daysLeft >= 0 ? daysLeft + ' days left' : 'Past due'}</div>
          </div>
          <div style="text-align:right">
            <div class="muted small">Status</div>
            <div style="font-weight:700;color:${(g.status==='completed' || saved>=target) ? '#22c55e' : '#A8B3CF'}">${(g.status==='completed' || saved>=target) ? 'completed' : (g.status || 'in_progress')}</div>
          </div>
        </div>
        <div style="margin-top:8px">Target: ₹${formatNumber(target)} • Saved: ₹${formatNumber(saved)}</div>
        <div style="margin-top:8px;background:rgba(255,255,255,0.02);height:12px;border-radius:8px;overflow:hidden">
          <div class="goal-progress-fill" data-goal="${g.goal_id}" style="width:${prog}%;height:12px;background:linear-gradient(90deg,#00C6FF,#00FFA3)"></div>
        </div>
        <div style="display:flex;gap:8px;margin-top:10px;justify-content:flex-end">
          <button class="btn-outline" data-action="add-money" data-id="${g.goal_id}">Add Money</button>
          <button class="btn-outline" data-action="history" data-id="${g.goal_id}">History</button>
          <button class="btn-outline" data-action="edit" data-goal='${JSON.stringify(g).replace(/'/g,"\\'")}'>Edit</button>
          <button class="btn-outline danger" data-action="delete" data-id="${g.goal_id}">Delete</button>
        </div>
      `;
      container.appendChild(div);
    });

    // attach event handlers
    container.querySelectorAll('[data-action]').forEach(btn=>{
      btn.addEventListener('click', async (e)=>{
        const action = btn.getAttribute('data-action');
        if(action === 'add-money'){
          const gid = btn.getAttribute('data-id');
          openAddMoneyModal(gid);
        } else if(action === 'history'){
          const gid = btn.getAttribute('data-id');
          openHistoryModal(gid);
        } else if(action === 'edit'){
          const g = JSON.parse(btn.getAttribute('data-goal'));
          openEditGoalModal(g);
        } else if(action === 'delete'){
          const gid = btn.getAttribute('data-id');
          openDeleteConfirmModal(gid);
        }
      });
    });
  }

  function updateGoalSummary(total, inprogress, completed){
    const totalEl = document.getElementById('totalGoals');
    const inEl = document.getElementById('inProgressGoals');
    const compEl = document.getElementById('completedGoals');
    if(totalEl) totalEl.textContent = total;
    if(inEl) inEl.textContent = inprogress;
    if(compEl) compEl.textContent = completed;
  }

  function getRemainingDays(dateStr){
    if(!dateStr) return -1;
    const now = new Date(); const d = new Date(dateStr + 'T00:00:00');
    const diff = Math.ceil((d - now) / (1000*60*60*24));
    return diff;
  }

  // ---- MODAL HELPERS (create dynamic modals, single-instance) ----
  function ensureModalRoot(){
    let root = document.getElementById('uiModalRoot');
    if(root) return root;
    root = document.createElement('div'); root.id = 'uiModalRoot';
    root.style.cssText = 'position:fixed;left:0;top:0;right:0;bottom:0;pointer-events:none;z-index:9998';
    document.body.appendChild(root);
    return root;
  }
  function createModal({title='', contentNode, width=420, onClose=null}){
    const root = ensureModalRoot();
    const backdrop = document.createElement('div');
    backdrop.style.cssText = `position:fixed;left:0;top:0;right:0;bottom:0;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;pointer-events:auto;z-index:9999;`;
    const card = document.createElement('div');
    card.style.cssText = `width:${width}px;max-width:calc(100% - 32px);background:#0f1724;color:#fff;border-radius:10px;padding:16px;box-shadow:0 12px 40px rgba(2,6,23,0.6);`;
    const h = document.createElement('div'); h.style.cssText='font-weight:700;margin-bottom:8px'; h.textContent = title;
    const body = document.createElement('div');
    if(contentNode) body.appendChild(contentNode);

    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'Close';
    closeBtn.style.cssText = 'margin-top:12px;padding:8px 12px;border-radius:8px;background:transparent;border:1px solid rgba(255,255,255,0.06);color:#fff;cursor:pointer';
    closeBtn.addEventListener('click', ()=> {
      backdrop.remove();
      if(onClose) onClose();
    });

    backdrop.addEventListener('click', (ev)=> {
      if(ev.target === backdrop){ backdrop.remove(); if(onClose) onClose(); }
    });

    card.appendChild(h);
    card.appendChild(body);
    card.appendChild(closeBtn);
    backdrop.appendChild(card);
    root.appendChild(backdrop);
    return {backdrop, card};
  }

  // ---- ADD MONEY MODAL ----
  function openAddMoneyModal(goalId){
    const content = document.createElement('div');

    const nameRow = document.createElement('div');
    nameRow.style.cssText='margin-bottom:8px';
    nameRow.innerHTML = `<div style="font-size:13px;color:#A8B3CF;margin-bottom:6px">Goal</div><div id="addmoneyGoalName" class="muted">Loading...</div>`;
    content.appendChild(nameRow);

    const amtRow = document.createElement('div');
    amtRow.style.cssText = 'margin-bottom:8px';
    amtRow.innerHTML = `<div style="font-size:13px;color:#A8B3CF;margin-bottom:6px">Amount (₹)</div><input id="addmoneyAmount" type="number" step="0.01" style="width:100%;padding:8px;border-radius:6px;border:1px solid #ccc;background:#0b1220;color:#fff">`;
    content.appendChild(amtRow);

    const dateRow = document.createElement('div');
    dateRow.style.cssText = 'margin-bottom:8px';
    dateRow.innerHTML = `<div style="font-size:13px;color:#A8B3CF;margin-bottom:6px">Date</div><input id="addmoneyDate" type="date" style="width:100%;padding:8px;border-radius:6px;border:1px solid #ccc;background:#0b1220;color:#fff">`;
    content.appendChild(dateRow);

    const noteRow = document.createElement('div');
    noteRow.style.cssText = 'margin-bottom:6px';
    noteRow.innerHTML = `<div style="font-size:13px;color:#A8B3CF;margin-bottom:6px">Note (optional)</div><input id="addmoneyNote" type="text" placeholder="e.g., pocket money" style="width:100%;padding:8px;border-radius:6px;border:1px solid #ccc;background:#0b1220;color:#fff">`;
    content.appendChild(noteRow);

    const actions = document.createElement('div'); actions.style.cssText='display:flex;gap:8px;justify-content:flex-end;margin-top:8px';
    const submitBtn = document.createElement('button'); submitBtn.textContent='Add'; submitBtn.style.cssText='padding:8px 12px;border-radius:8px;background:#06b6d4;border:none;color:#000;cursor:pointer';
    const cancelBtn = document.createElement('button'); cancelBtn.textContent='Cancel'; cancelBtn.style.cssText='padding:8px 12px;border-radius:8px;background:transparent;border:1px solid rgba(255,255,255,0.06);color:#fff;cursor:pointer';
    actions.appendChild(cancelBtn); actions.appendChild(submitBtn);
    content.appendChild(actions);

    const {backdrop} = createModal({title:'Add money to goal', contentNode:content, width:480});

    document.getElementById('addmoneyDate').value = todayISO();
    const goalNameEl = document.querySelector(`[data-action="add-money"][data-id="${goalId}"]`)?.closest('.goal-card')?.querySelector('strong');
    if(goalNameEl) document.getElementById('addmoneyGoalName').textContent = goalNameEl.textContent;
    else document.getElementById('addmoneyGoalName').textContent = 'Goal';

    cancelBtn.addEventListener('click', ()=> backdrop.remove());
    submitBtn.addEventListener('click', async ()=>{
      const amt = Number(document.getElementById('addmoneyAmount').value);
      const dt = document.getElementById('addmoneyDate').value;
      const note = document.getElementById('addmoneyNote').value.trim() || null;
      if(!amt || !dt){ showToast('Enter amount & date','error'); return; }

      // call API
      try{
        const userId = safeUserId();
        const payload = { goal_id: Number(goalId), amount: amt, date: dt, note, user_id: userId };
        const res = await fetch(`${API_BASE}/add_goal_money`, {
          method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload)
        });
        const data = await apiJson(res);
        if(res.ok && data.status === 'success'){ showToast('Amount added','success'); backdrop.remove(); await renderGoals(); await updateDashboard(); }
        else showToast(data.message || 'Failed to add money','error');
      } catch(e){ console.error(e); showToast('Server not reachable','error'); }
    });
  }

  // ---- HISTORY MODAL ----
  async function openHistoryModal(goalId){
    const content = document.createElement('div');
    content.innerHTML = `<div id="historyList" class="muted small">Loading history...</div>`;
    const {backdrop} = createModal({title:'Savings history', contentNode:content, width:520});

    try{
      const userId = safeUserId();
      const res = await fetch(`${API_BASE}/goal_money_history?user_id=${encodeURIComponent(userId)}&goal_id=${encodeURIComponent(goalId)}`);
      const data = await apiJson(res);
      if(!res.ok || data.status !== 'success'){
        document.getElementById('historyList').textContent = data.message || 'Failed to fetch history';
        return;
      }
      const rows = data.history || [];
      if(!rows.length){ document.getElementById('historyList').textContent = 'No savings yet'; return; }
      const list = document.createElement('div');
      rows.forEach(r=>{
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.03)';
        const left = document.createElement('div');
        left.innerHTML = `<strong>₹${formatNumber(r.amount)}</strong><div class="muted small">${formatDate(r.date)} • ${r.note? escapeHtml(r.note):''}</div>`;
        const right = document.createElement('div');
        right.className = 'muted small';
        right.textContent = formatDate(r.created_at||r.date);
        row.appendChild(left); row.appendChild(right);
        list.appendChild(row);
      });
      const holder = document.getElementById('historyList'); holder.innerHTML = ''; holder.appendChild(list);
    } catch(e){ console.error(e); document.getElementById('historyList').textContent = 'Server not reachable'; }
  }

  // ---- EDIT GOAL MODAL ----
  function openEditGoalModal(goal){
    const content = document.createElement('div');

    content.innerHTML = `
      <div style="margin-bottom:8px"><div style="font-size:13px;color:#A8B3CF;margin-bottom:6px">Name</div><input id="editGoalName" type="text" value="${escapeHtml(goal.name||goal.goal_name)}" style="width:100%;padding:8px;border-radius:6px;border:1px solid #ccc;background:#0b1220;color:#fff"></div>
      <div style="margin-bottom:8px"><div style="font-size:13px;color:#A8B3CF;margin-bottom:6px">Target (₹)</div><input id="editGoalTarget" type="number" value="${Number(goal.target||0)}" style="width:100%;padding:8px;border-radius:6px;border:1px solid #ccc;background:#0b1220;color:#fff"></div>
      <div style="margin-bottom:8px"><div style="font-size:13px;color:#A8B3CF;margin-bottom:6px">Target date</div><input id="editGoalDate" type="date" value="${formatDate(goal.date)||todayISO()}" style="width:100%;padding:8px;border-radius:6px;border:1px solid #ccc;background:#0b1220;color:#fff"></div>
    `;
    const actions = document.createElement('div'); actions.style.cssText='display:flex;gap:8px;justify-content:flex-end';
    const cancelBtn = document.createElement('button'); cancelBtn.textContent='Cancel'; cancelBtn.style.cssText='padding:8px;border-radius:8px;background:transparent;color:#fff;border:1px solid rgba(255,255,255,0.06)';
    const saveBtn = document.createElement('button'); saveBtn.textContent='Save'; saveBtn.style.cssText='padding:8px;border-radius:8px;background:#06b6d4;border:none;color:#000';
    actions.appendChild(cancelBtn); actions.appendChild(saveBtn);
    content.appendChild(actions);

    const {backdrop} = createModal({title:'Edit goal', contentNode:content, width:480});
    cancelBtn.addEventListener('click', ()=> backdrop.remove());
    saveBtn.addEventListener('click', async ()=>{
      const newName = document.getElementById('editGoalName').value.trim();
      const newTarget = Number(document.getElementById('editGoalTarget').value);
      const newDate = document.getElementById('editGoalDate').value;
      if(!newName || !newTarget || !newDate){ showToast('Complete all fields','error'); return; }
      try{
        const payload = { goal_id: goal.goal_id, name: newName, target: newTarget, date: newDate };
        const res = await fetch(`${API_BASE}/update_goal`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
        const data = await apiJson(res);
        if(res.ok && data.status === 'success'){ showToast('Goal updated','success'); backdrop.remove(); await renderGoals(); await updateDashboard(); }
        else showToast(data.message || 'Update failed','error');
      } catch(e){ console.error(e); showToast('Server not reachable','error'); }
    });
  }

  // ---- DELETE CONFIRM ----
  function openDeleteConfirmModal(goalId){
    const content = document.createElement('div');
    content.innerHTML = `<div class="muted small" style="margin-bottom:12px">Are you sure you want to delete this goal? This will remove its savings history.</div>`;
    const actions = document.createElement('div'); actions.style.cssText='display:flex;gap:8px;justify-content:flex-end';
    const cancelBtn = document.createElement('button'); cancelBtn.textContent='Cancel'; cancelBtn.style.cssText='padding:8px;border-radius:8px;background:transparent;color:#fff;border:1px solid rgba(255,255,255,0.06)';
    const delBtn = document.createElement('button'); delBtn.textContent='Delete'; delBtn.style.cssText='padding:8px;border-radius:8px;background:#ef4444;border:none;color:#fff';
    actions.appendChild(cancelBtn); actions.appendChild(delBtn);
    content.appendChild(actions);

    const {backdrop} = createModal({title:'Delete goal', contentNode:content, width:420});
    cancelBtn.addEventListener('click', ()=> backdrop.remove());
    delBtn.addEventListener('click', async ()=>{
      try{
        const res = await fetch(`${API_BASE}/delete_goal`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ goal_id: Number(goalId) }) });
        const data = await apiJson(res);
        if(res.ok && data.status === 'success'){ showToast('Goal deleted','success'); backdrop.remove(); await renderGoals(); await updateDashboard(); }
        else showToast(data.message || 'Delete failed','error');
      } catch(e){ console.error(e); showToast('Server not reachable','error'); }
    });
  }

  // ---- PREDICTIONS ----
  async function renderPredictionPage(){
    const userId = safeUserId(); if(!userId){ showToast('Please login','error'); return; }
    const el = document.getElementById('nextPred');
    const ctx = document.getElementById('predChart');
    try{
      const res = await fetch(`${API_BASE}/predictions?user_id=${userId}`);
      const data = await apiJson(res);
      if(res.ok && data.status === 'success'){
        el && (el.textContent = `₹${formatNumber(data.next_pred || 0)}`);
        if(ctx && window.Chart){
          if(window.predChartInst) window.predChartInst.destroy();
          window.predChartInst = new Chart(ctx, {
            type:'bar',
            data:{ labels: data.labels.length? data.labels : ['Next Month'], datasets:[
              { label:'Actual', data: data.actual.length? data.actual : [], backgroundColor:'rgba(255,110,110,0.6)' },
              { label:'Predicted', data: data.predicted.length? data.predicted : [], backgroundColor:'rgba(0,198,255,0.6)' }
            ]},
            options:{ responsive:true, plugins:{legend:{labels:{color:'#fff'}}}, scales:{x:{ticks:{color:'#A8B3CF'}}, y:{ticks:{color:'#A8B3CF'}}} }
          });
        }
      } else showToast(data.message || 'Prediction fetch failed','error');
    } catch(e){ console.error(e); showToast('Server not reachable','error'); }
  }

  // ---- BUDGET ----
  async function addBudget(){
    const userId = safeUserId(); if(!userId){ showToast('Please login','error'); window.location.href='index.html'; return; }
    const amount = Number(document.getElementById('budgetAmount')?.value);
    if(!amount || amount <= 0){ showToast('Enter a valid budget amount','error'); return; }

    try{
      const res = await fetch(`${API_BASE}/add_budget`, {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ user_id: userId, amount })
      });
      const data = await apiJson(res);
      if(res.ok && data.status === 'success'){
        showToast('Budget saved for current month','success');
        document.getElementById('budgetAmount').value = '';
        await fetchAndRenderBudget();
      } else {
        showToast(data.message || 'Failed to save budget','error');
      }
    } catch(e){
      console.error(e); showToast('Server not reachable','error');
    }
  }

  async function fetchAndRenderBudget(){
    const userId = safeUserId(); if(!userId) return;
    const summaryEl = document.getElementById('budgetSummary');
    const prevEl = document.getElementById('prevBudgetList');
    if(summaryEl) summaryEl.innerHTML = '<div class="muted">Loading...</div>';
    if(prevEl) prevEl.innerHTML = '';

    try{
      const res = await fetch(`${API_BASE}/get_budget?user_id=${userId}`);
      const data = await apiJson(res);
      if(!res.ok || data.status !== 'success'){
        if(summaryEl) summaryEl.innerHTML = '<div class="muted">Failed to load budget</div>';
        showToast(data.message || 'Failed to fetch budget','error');
        return;
      }

      const cur = data.current || { month_year:'', amount:0, spent:0, remaining:0, remaining_days:0, note:'' };
      if(summaryEl){
        if(cur.amount && cur.amount > 0){
          const color = cur.spent > cur.amount ? '#ff7b7b' : (cur.remaining < (cur.amount*0.2) ? '#facc15' : '#22c55e');
          summaryEl.innerHTML = `
            <div style="background:rgba(255,255,255,0.03);padding:14px;border-radius:10px">
              <div style="display:flex;justify-content:space-between;align-items:center">
                <div>
                  <h3 style="margin:0">₹${formatNumber(cur.amount)}</h3>
                  <div class="muted">Budget — ${cur.month_year}</div>
                </div>
                <div style="text-align:right">
                  <div style="font-weight:700;color:${color}">Remaining ₹${formatNumber(cur.remaining)}</div>
                  <div class="muted">${cur.remaining_days} days left</div>
                </div>
              </div>
              <div style="margin-top:10px;color:#fff">${cur.note}</div>
              <div style="margin-top:10px" class="muted">Spent: ₹${formatNumber(cur.spent)}</div>
            </div>`;
        } else {
          summaryEl.innerHTML = `<div class="muted">No budget set for this month</div>`;
        }
      }

      const prev = data.previous || [];
      if(prevEl){
        if(!prev.length) prevEl.innerHTML = '<div class="muted">No previous budget records found</div>';
        else {
          prevEl.innerHTML = '';
          prev.forEach(m=>{
            const item = document.createElement('div');
            item.className = 'txn-item';
            item.innerHTML = `<div><strong>${m.month_year}</strong><div class="muted">Budget: ₹${formatNumber(m.amount)}</div></div>
                              <div style="text-align:right">Spent: ₹${formatNumber(m.spent)}</div>`;
            prevEl.appendChild(item);
          });
        }
      }

    } catch(e){
      console.error(e);
      if(summaryEl) summaryEl.innerHTML = '<div class="muted">Error loading budget</div>';
      showToast('Server not reachable','error');
    }
  }

  // ---- DASHBOARD ----
  async function updateDashboard(){
    const userId = safeUserId(); if(!userId) { window.location.href='index.html'; return; }

    const userNameEl = document.getElementById('userName');
    if(userNameEl) userNameEl.textContent = (localStorage.getItem('fa_user_name') || 'User');

    const txns = await fetchTransactions();
    const income = txns.filter(t=>t.type==='income').reduce((s,n)=>s+Number(n.amount||0),0);
    const expense = txns.filter(t=>t.type==='expense').reduce((s,n)=>s+Number(n.amount||0),0);
    const saving = income - expense;

    if(document.getElementById('incomeCard')) document.getElementById('incomeCard').textContent = `₹${formatNumber(income)}`;
    if(document.getElementById('expenseCard')) document.getElementById('expenseCard').textContent = `₹${formatNumber(expense)}`;
    if(document.getElementById('saveCard')) document.getElementById('saveCard').textContent = `₹${formatNumber(saving)}`;

    try {
      const goals = await fetchGoals();
      const activeCount = Array.isArray(goals) ? goals.filter(g => {
        const status = (g.status || '').toLowerCase();
        return status !== 'completed' && status !== 'done' && status !== 'closed';
      }).length : 0;

      const activeGoalsEl = document.getElementById('activeGoals');
      if(activeGoalsEl) activeGoalsEl.textContent = activeCount;

    } catch(err) {
      console.error('Error fetching goals for dashboard:', err);
    }

    if(document.getElementById('budgetSummary') || document.getElementById('prevBudgetList')){
      await fetchAndRenderBudget();
    }

    // Budget alerts: count months (current + previous) where spent > budget
    try {
      const bRes = await fetch(`${API_BASE}/get_budget?user_id=${userId}`);
      const bData = await apiJson(bRes);
      if(bRes.ok && bData.status === 'success'){
        let alerts = 0;
        const cur = bData.current || {};
        if(cur.amount > 0 && cur.spent > cur.amount) alerts++;
        (bData.previous || []).forEach(m => { if(m.amount > 0 && m.spent > m.amount) alerts++; });
        const alertEl = document.getElementById('budgetAlerts');
        if(alertEl) alertEl.textContent = alerts;
      }
    } catch(e){ console.error(e); }
  }

  // ---- DASHBOARD MODAL & CHART ----
  async function setupDashboardUI(){
    const modal = document.getElementById('quickModal');
    const addBtn = document.getElementById('quickAddBtn');
    const closeBtn = document.getElementById('quickClose');
    const saveBtn = document.getElementById('quickSave');
    const chartCanvas = document.getElementById('expenseChart');

    if (!addBtn || !modal) return;
    modal.style.display = "none";

    addBtn.addEventListener('click', () => modal.style.display = "flex");
    closeBtn.addEventListener('click', () => modal.style.display = "none");

    saveBtn.addEventListener('click', async () => {
      modal.style.display = "none";
      await addTransaction();
      await renderExpenseChart();
      await updateDashboard();
    });

    async function renderExpenseChart(){
      const userId = safeUserId(); if(!userId) return;
      try {
        const res = await fetch(`${API_BASE}/predictions?user_id=${userId}`);
        const data = await res.json();
        const ctx = chartCanvas.getContext('2d');
        if(window.expChart) window.expChart.destroy();

        window.expChart = new Chart(ctx, {
          type: 'bar',
          data: {
            labels: data.labels.length ? data.labels : ['No Data'],
            datasets: [
              { label: 'Actual', data: data.actual || [0], backgroundColor: 'rgba(255,110,110,0.6)' },
              { label: 'Predicted', data: data.predicted || [0], backgroundColor: 'rgba(0,198,255,0.6)' }
            ]
          },
          options: {
            plugins: { legend: { labels: { color: '#fff' } } },
            scales: { x: { ticks: { color: '#A8B3CF' } }, y: { ticks: { color: '#A8B3CF' } } }
          }
        });
      } catch (err) {
        console.error('Chart error:', err);
      }
    }

    await renderExpenseChart();
  }

  // ---- INIT ----
  async function pageInit(){
    const path = window.location.pathname.split('/').pop();
    if(path.includes('dashboard')){
      await updateDashboard();
      await setupDashboardUI();
    }
    if(path.includes('transactions')) await renderTxns();
    if(path.includes('goals')) await renderGoals();
    if(path.includes('prediction')) await renderPredictionPage();
    if(path.includes('budget')) await fetchAndRenderBudget();
  }

  // expose public API
  return {
    login, signup, logout, resetPassword,
    addTransaction, renderTxns, addGoal, renderGoals,
    renderPredictionPage, updateDashboard, pageInit,
    addBudget, fetchAndRenderBudget,
    openAddMoneyModal, openHistoryModal, openEditGoalModal
  };
})();

window.addEventListener('load', ()=>{ try{ ui.pageInit(); }catch(e){ console.error(e); } });
