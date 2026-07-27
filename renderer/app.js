/* =====================================================================
   專案管理 APP — 渲染層邏輯（繁體中文）
   ===================================================================== */
(() => {
  'use strict';

  /* ---------- 常數 ---------- */
  const STATUSES = [
    { key: 'todo', label: '待辦' },
    { key: 'doing', label: '進行中' },
    { key: 'done', label: '已完成' }
  ];
  const PRIORITIES = [
    { key: 'high', label: '高' },
    { key: 'medium', label: '中' },
    { key: 'low', label: '低' }
  ];
  const THEMES = [
    { key: 'dark', label: '暗色', swatch: '#1f2430' },
    { key: 'light', label: '亮色', swatch: '#ffffff' },
    { key: 'forest', label: '森林', swatch: '#1d2e25' }
  ];
  const VIEW_TITLES = { board: '看板', list: '列表', calendar: '日曆', stats: '統計', settings: '設定' };

  /* ---------- 全域狀態 ---------- */
  let state = null;
  let currentView = 'board';
  let calYear, calMonth;
  const notified = new Set();

  /* ---------- 工具 ---------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const uid = () => Math.random().toString(36).slice(2, 10);
  const todayStr = () => new Date().toISOString().slice(0, 10);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function isoDay(d) { return d.toISOString().slice(0, 10); }
  function fmtDue(due) {
    if (!due) return '';
    const t = new Date(due + 'T00:00:00');
    return (t.getMonth() + 1) + '/' + t.getDate();
  }
  function isOverdue(t) { return t.due && t.status !== 'done' && t.due < todayStr(); }
  function isSoon(t) {
    if (!t.due || t.status === 'done') return false;
    const diff = (new Date(t.due + 'T00:00:00') - new Date(todayStr() + 'T00:00:00')) / 86400000;
    return diff >= 0 && diff <= 2;
  }
  function subProgress(t) {
    const subs = t.subtasks || [];
    return { done: subs.filter((s) => s.done).length, total: subs.length };
  }
  function fmtSize(b) {
    if (b < 1024) return b + ' B';
    if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
    return (b / 1024 / 1024).toFixed(1) + ' MB';
  }
  function subMetaHTML(t) {
    const sp = subProgress(t);
    return sp.total ? '<span class="due" title="子清單進度">? ' + sp.done + '/' + sp.total + '</span>' : '';
  }
  function attMetaHTML(t) {
    const n = (t.attachments || []).length;
    return n ? '<span class="due" title="附件數量">? ' + n + '</span>' : '';
  }

  async function saveState() { await window.api.saveData(state); }

  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(el._t);
    el._t = setTimeout(() => (el.hidden = true), 2200);
  }

  /* ---------- 預設種子資料 ---------- */
  function seedData() {
    const p1 = uid();
    const m1 = uid(), m2 = uid();
    const tg1 = uid(), tg2 = uid(), tg3 = uid();
    const d = new Date();
    const inDays = (n) => { const x = new Date(d); x.setDate(x.getDate() + n); return isoDay(x); };
    return {
      projects: [
        { id: p1, name: '我的第一個專案', color: '#5b8cff' },
        { id: uid(), name: '網站改版', color: '#34d399' }
      ],
      members: [
        { id: m1, name: '小明', color: '#5b8cff' },
        { id: m2, name: '小美', color: '#f472b6' }
      ],
      tags: [
        { id: tg1, name: '設計', color: '#7c5bff' },
        { id: tg2, name: '開發', color: '#34d399' },
        { id: tg3, name: '緊急', color: '#ff5d6c' }
      ],
      tasks: [
        { id: uid(), projectId: p1, title: '規劃產品需求', desc: '整理使用者故事與優先級', status: 'done', priority: 'high', due: inDays(-2), tags: [tg1], assignee: m1, createdAt: inDays(-5), completedAt: inDays(-1) },
        { id: uid(), projectId: p1, title: '設計首頁介面', desc: '', status: 'doing', priority: 'medium', due: inDays(0), tags: [tg1], assignee: m2, createdAt: inDays(-4), completedAt: null,
          subtasks: [
            { id: uid(), text: '收集參考案例', done: true },
            { id: uid(), text: '繪製線框圖', done: true },
            { id: uid(), text: '製作高保真稿', done: false },
            { id: uid(), text: '與團隊評審', done: false }
          ], attachments: [] },
        { id: uid(), projectId: p1, title: '搭建前端框架', desc: '初始化專案與路由', status: 'doing', priority: 'high', due: inDays(1), tags: [tg2], assignee: m1, createdAt: inDays(-3), completedAt: null,
          subtasks: [
            { id: uid(), text: '初始化專案', done: true },
            { id: uid(), text: '設定路由', done: false }
          ], attachments: [] },
        { id: uid(), projectId: p1, title: '修復登入錯誤', desc: '緊急問題', status: 'todo', priority: 'high', due: inDays(-1), tags: [tg3, tg2], assignee: m2, createdAt: inDays(-1), completedAt: null },
        { id: uid(), projectId: p1, title: '撰寫使用手冊', desc: '', status: 'todo', priority: 'low', due: inDays(4), tags: [], assignee: null, createdAt: inDays(0), completedAt: null }
      ],
      settings: { theme: 'dark', currentProject: 'all' }
    };
  }

  /* ---------- 篩選 ---------- */
  function getFilters() {
    return {
      q: $('#searchInput').value.trim().toLowerCase(),
      status: $('#filterStatus').value,
      priority: $('#filterPriority').value,
      member: $('#filterMember').value,
      project: state.settings.currentProject
    };
  }
  function getFilteredTasks() {
    const f = getFilters();
    return state.tasks.filter((t) => {
      if (f.project !== 'all' && t.projectId !== f.project) return false;
      if (f.status && t.status !== f.status) return false;
      if (f.priority && t.priority !== f.priority) return false;
      if (f.member && t.assignee !== f.member) return false;
      if (f.q) {
        const proj = state.projects.find((p) => p.id === t.projectId);
        var hay = (t.title + ' ' + (t.desc || '') + ' ' + (proj ? proj.name : '')).toLowerCase();
        if (!hay.includes(f.q)) return false;
      }
      return true;
    });
  }

  function memberById(id) { return state.members.find((m) => m.id === id); }
  function tagById(id) { return state.tags.find((t) => t.id === id); }
  function projectById(id) { return state.projects.find((p) => p.id === id); }

  /* ===================================================================
     渲染：側邊欄
     =================================================================== */
  function renderSidebar() {
    var list = $('#projectList');
    var cur = state.settings.currentProject;
    var countFor = (pid) => state.tasks.filter((t) => t.projectId === pid && t.status !== 'done').length;
    list.innerHTML =
      '<li class="all ' + (cur === 'all' ? 'active' : '') + '" data-project="all">'
    + '  <span class="dot" style="background:var(--accent)"></span> 全部專案'
    + '  <span class="count">' + state.tasks.length + '</span>'
    + '</li>'
    + state.projects.map(function(p) {
        return '<li class="' + (cur === p.id ? 'active' : '') + '" data-project="' + p.id + '">'
             + '<span class="dot" style="background:' + p.color + '"></span> ' + esc(p.name)
             + ' <span class="count">' + countFor(p.id) + '</span></li>';
      }).join('');
    $$('#projectList li').forEach(function(li) {
      li.addEventListener('click', function() {
        state.settings.currentProject = li.dataset.project;
        saveState().then(renderAll);
      });
    });

    // 成員篩選下拉
    var fm = $('#filterMember');
    var curMember = fm.value;
    fm.innerHTML = '<option value="">全部成員</option>' +
      state.members.map(function(m) { return '<option value="' + m.id + '">' + esc(m.name) + '</option>'; }).join('');
    if (state.members.some(function(m) { return m.id === curMember; })) fm.value = curMember;
  }

  /* ===================================================================
     渲染：視圖切換
     =================================================================== */
  function renderAll() {
    renderSidebar();
    $('#viewTitle').textContent = VIEW_TITLES[currentView];
    var proj = state.settings.currentProject === 'all' ? null : projectById(state.settings.currentProject);
    $('#viewSubtitle').textContent = proj ? ' · ' + proj.name : ' · 全部專案';
    $('#addTaskBtn').style.display = currentView === 'settings' ? 'none' : '';
    var c = $('#content');
    c.innerHTML = '';
    if (currentView === 'board') c.appendChild(renderBoard());
    else if (currentView === 'list') c.appendChild(renderList());
    else if (currentView === 'calendar') c.appendChild(renderCalendar());
    else if (currentView === 'stats') c.appendChild(renderStats());
    else if (currentView === 'settings') c.appendChild(renderSettings());
  }

  /* ---------- 看板 ---------- */
  function renderBoard() {
    var wrap = document.createElement('div');
    wrap.className = 'board';
    var tasks = getFilteredTasks();
    STATUSES.forEach(function(st) {
      var col = document.createElement('div');
      col.className = 'board-col';
      var items = tasks.filter(function(t) { return t.status === st.key; });
      col.innerHTML =
        '<div class="col-head"><span class="bar" style="background:var(--' + st.key + ')"></span>' + st.label
      + '  <span class="cnt">' + items.length + '</span></div>'
      + ' <div class="col-body" data-status="' + st.key + '"></div>';
      var body = $('.col-body', col);
      items.forEach(function(t) { body.appendChild(renderCard(t)); });
      var add = document.createElement('div');
      add.className = 'add-card';
      add.textContent = '＋ 新增';
      add.addEventListener('click', function() { openTaskModal(null, st.key); });
      body.appendChild(add);

      body.addEventListener('dragover', function(e) { e.preventDefault(); body.classList.add('drag-over'); });
      body.addEventListener('dragleave', function() { body.classList.remove('drag-over'); });
      body.addEventListener('drop', function(e) {
        e.preventDefault(); body.classList.remove('drag-over');
        var id = e.dataTransfer.getData('text/plain');
        var tt = state.tasks.find(function(x) { return x.id === id; });
        if (tt && tt.status !== st.key) {
          tt.status = st.key;
          tt.completedAt = st.key === 'done' ? todayStr() : null;
          saveState().then(renderAll);
        }
      });
      wrap.appendChild(col);
    });
    return wrap;
  }

  function renderCard(t) {
    var el = document.createElement('div');
    el.className = 'card p-' + t.priority;
    el.draggable = true;
    var tags = (t.tags || []).map(function(id) { var tg = tagById(id); return tg ? '<span class="tag" style="color:' + tg.color + '">' + esc(tg.name) + '</span>' : ''; }).join('');
    var m = memberById(t.assignee);
    var avatar = m ? '<span class="avatar" style="background:' + m.color + '" title="' + esc(m.name) + '">' + esc(m.name[0]) + '</span>' : '';
    var due = '';
    if (t.due) {
      var cls = isOverdue(t) ? 'overdue' : (isSoon(t) ? 'soon' : '');
      due = '<span class="due ' + cls + '">?' + fmtDue(t.due) + '</span>';
    }
    el.innerHTML =
      '<div class="card-title">' + esc(t.title) + '</div>'
    + ' <div class="card-meta">' + due + subMetaHTML(t) + attMetaHTML(t) + tags + avatar + '</div>';
    el.addEventListener('click', function() { openTaskModal(t.id); });
    el.addEventListener('dragstart', function(e) {
      e.dataTransfer.setData('text/plain', t.id);
      el.classList.add('dragging');
    });
    el.addEventListener('dragend', function() { el.classList.remove('dragging'); });
    return el;
  }

  /* ---------- 列表 ---------- */
  function renderList() {
    var tasks = getFilteredTasks().sort(function(a, b) { return (a.due || '9').localeCompare(b.due || '9'); });
    var wrap = document.createElement('div');
    if (!tasks.length) { wrap.innerHTML = emptyHTML(); return wrap; }
    var rows = tasks.map(function(t) {
      var st = STATUSES.find(function(s) { return s.key === t.status; });
      var pr = PRIORITIES.find(function(p) { return p.key === t.priority; });
      var proj = projectById(t.projectId);
      var m = memberById(t.assignee);
      var avatar = m ? '<span class="avatar" style="background:' + m.color + '" title="' + esc(m.name) + '">' + esc(m.name[0]) + '</span>' : '—';
      var due = t.due ? '<span class="' + (isOverdue(t) ? 'due overdue' : (isSoon(t) ? 'due soon' : '')) + '">' + fmtDue(t.due) + '</span>' : '—';
      return '<tr data-id="' + t.id + '">'
        + '<td><span class="prio-dot" style="background:var(--' + (t.priority === 'high' ? 'danger' : t.priority === 'medium' ? 'warning' : 'todo') + ')"></span>' + pr.label + '</td>'
        + '<td>' + esc(t.title) + ' ' + subMetaHTML(t) + ' ' + attMetaHTML(t) + '</td>'
        + '<td><span class="pill ' + t.status + '">' + st.label + '</span></td>'
        + '<td>' + (proj ? esc(proj.name) : '—') + '</td>'
        + '<td>' + avatar + '</td>'
        + '<td>' + due + '</td>'
        + '</tr>';
    }).join('');
    wrap.innerHTML =
      '<table class="list-table">'
    + '  <thead><tr><th>優先級</th><th>任務</th><th>狀態</th><th>專案</th><th>負責人</th><th>截止</th></tr></thead>'
    + '  <tbody>' + rows + '</tbody></table>';
    $$('tbody tr', wrap).forEach(function(tr) { tr.addEventListener('click', function() { openTaskModal(tr.dataset.id); }); });
    return wrap;
  }

  /* ---------- 日曆 ---------- */
  function renderCalendar() {
    var wrap = document.createElement('div');
    var now = new Date();
    if (calYear == null) { calYear = now.getFullYear(); calMonth = now.getMonth(); }
    var first = new Date(calYear, calMonth, 1);
    var startDow = first.getDay();
    var daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    var prevDays = new Date(calYear, calMonth, 0).getDate();
    var tasks = getFilteredTasks();

    var cells = '';
    var dows = ['日', '一', '二', '三', '四', '五', '六'];
    dows.forEach(function(d) { cells += '<div class="cal-dow">' + d + '</div>'; });
    for (var i = startDow - 1; i >= 0; i--) {
      cells += '<div class="cal-cell out"><span class="cal-date">' + prevDays - i + '</span></div>';
    }
    for (var day = 1; day <= daysInMonth; day++) {
      var ds = calYear + '-' + String(calMonth + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
      var isToday = ds === todayStr();
      var evs = tasks.filter(function(tt) { return tt.due === ds; });
      var evHtml = evs.map(function(tt) {
        return '<div class="cal-ev ' + (tt.status === 'done' ? 'done' : '') + ' ' + (isOverdue(tt) ? 'overdue' : '') + '" data-id="' + tt.id + '" style="border-left-color:' + (tt.status === 'done' ? 'var(--done)' : tt.priority === 'high' ? 'var(--danger)' : 'var(--doing)') + '">' + esc(tt.title) + '</div>';
      }).join('');
      cells += '<div class="cal-cell ' + (isToday ? 'today' : '') + '"><span class="cal-date">' + day + '</span>' + evHtml + '</div>';
    }
    var total = startDow + daysInMonth;
    var tail = (7 - (total % 7)) % 7;
    for (var j = 1; j <= tail; j++) cells += '<div class="cal-cell out"><span class="cal-date">' + j + '</span></div>';

    wrap.innerHTML =
      '<div class="cal-head">'
    + '  <button class="cal-nav" id="calPrev">? 上個月</button>'
    + '  <h2>' + calYear + ' 年 ' + (calMonth + 1) + ' 月</h2>'
    + '  <button class="cal-nav" id="calNext">下個月 ?</button>'
    + '  <button class="cal-nav" id="calToday">今天</button>'
    + '</div>'
    + ' <div class="cal-grid">' + cells + '</div>';

    $('#calPrev', wrap).addEventListener('click', function() { calMonth--; if (calMonth < 0) { calMonth = 11; calYear--; } renderAll(); });
    $('#calNext', wrap).addEventListener('click', function() { calMonth++; if (calMonth > 11) { calMonth = 0; calYear++; } renderAll(); });
    $('#calToday', wrap).addEventListener('click', function() { var n = new Date(); calYear = n.getFullYear(); calMonth = n.getMonth(); renderAll(); });
    $$('.cal-ev', wrap).forEach(function(ev) { ev.addEventListener('click', function() { openTaskModal(ev.dataset.id); }); });
    return wrap;
  }

  /* ---------- 統計 ---------- */
  function renderStats() {
    var tasks = state.tasks.filter(function(t) { return state.settings.currentProject === 'all' || t.projectId === state.settings.currentProject; });
    var total = tasks.length;
    var doing = tasks.filter(function(t) { return t.status === 'doing'; }).length;
    var done = tasks.filter(function(t) { return t.status === 'done'; }).length;
    var overdue = tasks.filter(isOverdue).length;
    var doneRate = total ? Math.round((done / total) * 100) : 0;

    var wrap = document.createElement('div');
    wrap.innerHTML =
      '<div class="stats-grid">'
    + '  <div class="stat-card"><div class="num">' + total + '</div><div class="lbl">任務總數</div></div>'
    + '  <div class="stat-card"><div class="num" style="color:var(--doing)">' + doing + '</div><div class="lbl">進行中</div></div>'
    + '  <div class="stat-card"><div class="num" style="color:var(--done)">' + done + '</div><div class="lbl">已完成（' + doneRate + '%）</div></div>'
    + '  <div class="stat-card"><div class="num" style="color:var(--danger)">' + overdue + '</div><div class="lbl">已逾期</div></div>'
    + '</div>'
    + ' <div class="charts">'
    + '  <div class="chart-box"><h3>狀態分布</h3><canvas id="chartStatus" height="220"></canvas></div>'
    + '  <div class="chart-box"><h3>優先級分布</h3><canvas id="chartPrio" height="220"></canvas></div>'
    + '  <div class="chart-box"><h3>各專案任務數</h3><canvas id="chartProj" height="220"></canvas></div>'
    + '  <div class="chart-box"><h3>每週完成趨勢</h3><canvas id="chartTrend" height="220"></canvas></div>'
    + '</div>';

    // 圖示 SVG
    var ICONS = {
      total: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>',
      doing: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>',
      done: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="8 12 11 15 16 9"/></svg>',
      overdue: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h16.9a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'
    };
    var cards = wrap.querySelectorAll('.stats-grid .stat-card');
    ['total', 'doing', 'done', 'overdue'].forEach(function(key, i) {
      var ico = document.createElement('div');
      ico.className = 'stat-ico';
      ico.innerHTML = ICONS[key];
      if (cards[i]) cards[i].appendChild(ico);
    });
    var doneCard = cards[2];
    if (doneCard) {
      var bar = document.createElement('div');
      bar.className = 'stat-bar';
      bar.innerHTML = '<span style="width:' + doneRate + '%"></span>';
      doneCard.appendChild(bar);
    }

    requestAnimationFrame(function() {
      drawBar($('#chartStatus', wrap), ['待辦', '進行中', '已完成'],
        [tasks.filter(function(t) { return t.status === 'todo'; }).length, doing, done],
        ['var(--todo)', 'var(--doing)', 'var(--done)']);
      drawDonut($('#chartPrio', wrap),
        ['高', '中', '低'],
        [tasks.filter(function(t) { return t.priority === 'high'; }).length, tasks.filter(function(t) { return t.priority === 'medium'; }).length, tasks.filter(function(t) { return t.priority === 'low'; }).length],
        ['var(--danger)', 'var(--warning)', 'var(--todo)']);
      var projCounts = state.projects.map(function(p) { return { name: p.name, n: tasks.filter(function(t) { return t.projectId === p.id; }).length, c: p.color }; });
      drawBar($('#chartProj', wrap), projCounts.map(function(p) { return p.name; }), projCounts.map(function(p) { return p.n; }), projCounts.map(function(p) { return p.c; }));
      drawTrend($('#chartTrend', wrap), tasks);
    });
    return wrap;
  }

  /* ---------- 設定 ---------- */
  function renderSettings() {
    var wrap = document.createElement('div');
    wrap.innerHTML =
      '<div class="settings-grid">'
    + '  <div class="set-box">'
    + '    <h3>成員管理</h3>'
    + '    <div id="memberChips">' + state.members.map(function(m) {
        return '<span class="chip"><span class="avatar" style="background:' + m.color + '">' + esc(m.name[0]) + '</span>' + esc(m.name) + '<span class="x" data-mid="' + m.id + '">?</span></span>';
      }).join('') + '</div>'
    + '    <div class="row" style="margin-top:10px">'
    + '      <input id="newMember" placeholder="成員名稱" />'
    + '      <input id="newMemberColor" type="color" value="#5b8cff" style="width:40px;height:36px;border:none;background:none" />'
    + '      <button class="primary-btn" id="addMember">新增</button>'
    + '    </div>'
    + '  </div>'
    + ''
    + '  <div class="set-box">'
    + '    <h3>標籤管理</h3>'
    + '    <div id="tagChips">' + state.tags.map(function(tg) {
        return '<span class="chip"><span class="dot" style="width:10px;height:10px;border-radius:50%;background:' + tg.color + '"></span>' + esc(tg.name) + '<span class="x" data-tid="' + tg.id + '">?</span></span>';
      }).join('') + '</div>'
    + '    <div class="row" style="margin-top:10px">'
    + '      <input id="newTag" placeholder="標籤名稱" />'
    + '      <input id="newTagColor" type="color" value="#7c5bff" style="width:40px;height:36px;border:none;background:none" />'
    + '      <button class="primary-btn" id="addTag">新增</button>'
    + '    </div>'
    + '  </div>'
    + ''
    + '  <div class="set-box">'
    + '    <h3>外觀主題</h3>'
    + '    <div class="row" id="themeOpts">'
    + THEMES.map(function(th) {
        return '<button class="theme-opt ' + (state.settings.theme === th.key ? 'active' : '') + '" data-theme="' + th.key + '">'
             + '<span class="swatch" style="background:' + th.swatch + ';border:1px solid var(--border)"></span>' + th.label + '</button>';
      }).join('')
    + '    </div>'
    + '  </div>'
    + ''
    + '  <div class="set-box">'
    + '    <h3>資料與提醒</h3>'
    + '    <div class="row" style="margin-bottom:10px">'
    + '      <button class="ghost-btn" id="exportBtn">匯出備份 (JSON)</button>'
    + '      <button class="ghost-btn" id="importBtn">匯入備份</button>'
    + '    </div>'
    + '    <div class="row" style="margin-bottom:10px">'
    + '      <button class="ghost-btn" id="remindBtn">立即檢查提醒</button>'
    + '      <button class="ghost-btn" id="seedBtn">載入範例資料</button>'
    + '    </div>'
    + '    <p style="color:var(--text-dim);font-size:12px;line-height:1.6">'
    + '      資料自動儲存在本機應用程式資料夾；提醒會在啟動時與每 5 分鐘檢查逾期與今日到期任務。'
    + '    </p>'
    + '  </div>'
    + '</div>';

    // 成員
    $('#addMember', wrap).addEventListener('click', function() {
      var name = $('#newMember', wrap).value.trim();
      if (!name) return toast('請輸入成員名稱');
      state.members.push({ id: uid(), name: name, color: $('#newMemberColor', wrap).value });
      saveState().then(renderAll);
    });
    $$('#memberChips .x', wrap).forEach(function(x) {
      x.addEventListener('click', function() {
        var id = x.dataset.mid;
        state.members = state.members.filter(function(m) { return m.id !== id; });
        state.tasks.forEach(function(t) { if (t.assignee === id) t.assignee = null; });
        saveState().then(renderAll);
      });
    });
    // 標籤
    $('#addTag', wrap).addEventListener('click', function() {
      var name = $('#newTag', wrap).value.trim();
      if (!name) return toast('請輸入標籤名稱');
      state.tags.push({ id: uid(), name: name, color: $('#newTagColor', wrap).value });
      saveState().then(renderAll);
    });
    $$('#tagChips .x', wrap).forEach(function(x) {
      x.addEventListener('click', function() {
        var id = x.dataset.tid;
        state.tags = state.tags.filter(function(t) { return t.id !== id; });
        state.tasks.forEach(function(t) { t.tags = (t.tags || []).filter(function(g) { return g !== id; }); });
        saveState().then(renderAll);
      });
    });
    // 主題
    $$('#themeOpts .theme-opt', wrap).forEach(function(b) {
      b.addEventListener('click', function() {
        state.settings.theme = b.dataset.theme;
        applyTheme();
        saveState().then(renderAll);
      });
    });
    // 資料
    $('#exportBtn', wrap).addEventListener('click', async function() {
      var r = await window.api.exportData(state);
      if (r.ok) toast('已匯出至 ' + r.filePath);
      else if (!r.canceled) toast('匯出失敗：' + r.error);
    });
    $('#importBtn', wrap).addEventListener('click', async function() {
      var r = await window.api.importData();
      if (r.ok) { state = r.data; await saveState(); renderAll(); toast('匯入成功'); }
      else if (!r.canceled) toast('匯入失敗：' + r.error);
    });
    $('#remindBtn', wrap).addEventListener('click', function() { checkReminders(true); });
    $('#seedBtn', wrap).addEventListener('click', function() { state = seedData(); saveState().then(renderAll); toast('已載入範例資料'); });
    return wrap;
  }

  /* ===================================================================
     任務對話框
     =================================================================== */
  var editingTags = new Set();
  var editingId = null, editingSubtasks = [], editingAttachments = [];
  function openTaskModal(taskId, presetStatus) {
    var isEdit = !!taskId;
    var t = isEdit ? state.tasks.find(function(x) { return x.id === taskId; }) : null;
    editingTags = new Set(t ? (t.tags || []) : []);
    editingId = taskId || uid();
    editingSubtasks = (t ? (t.subtasks || []) : []).map(function(s) { return Object.assign({}, s); });
    editingAttachments = (t ? (t.attachments || []) : []).map(function(a) { return Object.assign({}, a); });
    $('#taskModalTitle').textContent = isEdit ? '編輯任務' : '新增任務';
    $('#taskDeleteBtn').hidden = !isEdit;

    var projOpts = state.projects.map(function(p) { return '<option value="' + p.id + '"' + (t && t.projectId === p.id ? ' selected' : '') + '>' + esc(p.name) + '</option>'; }).join('');
    var statusOpts = STATUSES.map(function(s) { return '<option value="' + s.key + '"' + ((t ? t.status : presetStatus || 'todo') === s.key ? ' selected' : '') + '>' + s.label + '</option>'; }).join('');
    var prioOpts = PRIORITIES.map(function(p) { return '<option value="' + p.key + '"' + ((t ? t.priority : 'medium') === p.key ? ' selected' : '') + '>' + p.label + '</option>'; }).join('');
    var memberOpts = '<option value="">未指派</option>' + state.members.map(function(m) { return '<option value="' + m.id + '"' + (t && t.assignee === m.id ? ' selected' : '') + '>' + esc(m.name) + '</option>'; }).join('');
    var tagChips = state.tags.map(function(tg) {
      return '<span class="tag ' + (editingTags.has(tg.id) ? 'sel' : '') + '" data-tid="' + tg.id + '" style="color:' + tg.color + '">' + esc(tg.name) + '</span>';
    }).join('') || '<span style="color:var(--text-dim)">尚無標籤</span>';

    $('#taskModalBody').innerHTML =
      '<div class="field"><label>標題</label><input id="fTitle" value="' + (t ? esc(t.title) : '') + '" placeholder="輸入任務標題" /></div>'
    + ' <div class="field"><label>描述</label><textarea id="fDesc" rows="3" placeholder="補充說明（選填）">' + (t ? esc(t.desc || '') : '') + '</textarea></div>'
    + ' <div class="row">'
    + '   <div class="field" style="flex:1"><label>專案</label><select id="fProject">' + projOpts + '</select></div>'
    + '   <div class="field" style="flex:1"><label>狀態</label><select id="fStatus">' + statusOpts + '</select></div>'
    + ' </div>'
    + ' <div class="row">'
    + '   <div class="field" style="flex:1"><label>優先級</label><select id="fPrio">' + prioOpts + '</select></div>'
    + '   <div class="field" style="flex:1"><label>負責人</label><select id="fMember">' + memberOpts + '</select></div>'
    + '   <div class="field" style="flex:1"><label>截止日期</label><input id="fDue" type="date" value="' + (t && t.due ? t.due : '') + '" /></div>'
    + ' </div>'
    + ' <div class="field"><label>標籤</label><div class="tag-pick" id="fTags">' + tagChips + '</div></div>'
    + ' <div class="field"><label>子清單</label>'
    + '   <div id="fSubs"></div>'
    + '   <div class="row"><input id="fSubInput" placeholder="新增子項目…" style="flex:1" /><button class="ghost-btn" id="addSub" type="button">＋</button></div>'
    + ' </div>'
    + ' <div class="field"><label>附件</label>'
    + '   <div id="fAttach"></div>'
    + '   <button class="ghost-btn" id="addAttachBtn" type="button">＋ 新增附件</button>'
    + ' </div>';

    $$('#fTags .tag', $('#taskModalBody')).forEach(function(chip) {
      chip.addEventListener('click', function() {
        var id = chip.dataset.tid;
        if (editingTags.has(id)) editingTags.delete(id); else editingTags.add(id);
        chip.classList.toggle('sel');
      });
    });

    // 子清單
    function renderSubs() {
      var box = $('#fSubs', $('#taskModalBody'));
      if (!editingSubtasks.length) { box.innerHTML = '<span style="color:var(--text-dim);font-size:12px">尚無子項目</span>'; return; }
      box.innerHTML = editingSubtasks.map(function(s, i) {
        return '<div class="sub-item">'
      + '  <label><input type="checkbox" data-i="' + i + '" ' + (s.done ? 'checked' : '') + '/> <span class="' + (s.done ? 'sub-done' : '') + '">' + esc(s.text) + '</span></label>'
      + '  <span class="sub-x" data-i="' + i + '" title="刪除">?</span>'
      + '</div>';
      }).join('');
      $$('#fSubs input[type=checkbox]', $('#taskModalBody')).forEach(function(c) {
        c.addEventListener('change', function() { editingSubtasks[+c.dataset.i].done = c.checked; renderSubs(); });
      });
      $$('#fSubs .sub-x', $('#taskModalBody')).forEach(function(x) {
        x.addEventListener('click', function() { editingSubtasks.splice(+x.dataset.i, 1); renderSubs(); });
      });
    }
    $('#addSub', $('#taskModalBody')).addEventListener('click', function() {
      var v = $('#fSubInput', $('#taskModalBody')).value.trim();
      if (!v) return;
      editingSubtasks.push({ id: uid(), text: v, done: false });
      $('#fSubInput', $('#taskModalBody')).value = '';
      renderSubs();
    });
    $('#fSubInput', $('#taskModalBody')).addEventListener('keydown', function(e) { if (e.key === 'Enter') { e.preventDefault(); $('#addSub', $('#taskModalBody')).click(); } });
    renderSubs();

    // 附件
    function renderAttach() {
      var box = $('#fAttach', $('#taskModalBody'));
      if (!editingAttachments.length) { box.innerHTML = '<span style="color:var(--text-dim);font-size:12px">尚無附件</span>'; return; }
      box.innerHTML = editingAttachments.map(function(a, i) {
        return '<div class="attach-item">'
      + '  <span class="attach-ico">?</span>'
      + '  <span class="attach-name" data-i="' + i + '" title="開啟">' + esc(a.name) + '</span>'
      + '  <span class="attach-size">' + fmtSize(a.size) + '</span>'
      + '  <span class="attach-x" data-i="' + i + '" title="移除">?</span>'
      + '</div>';
      }).join('');
      $$('#fAttach .attach-name', $('#taskModalBody')).forEach(function(n) {
        n.addEventListener('click', function() { window.api.openAttachment(editingAttachments[+n.dataset.i].path); });
      });
      $$('#fAttach .attach-x', $('#taskModalBody')).forEach(function(x) {
        x.addEventListener('click', function() {
          var a = editingAttachments[+x.dataset.i];
          window.api.removeAttachment(a.path);
          editingAttachments.splice(+x.dataset.i, 1);
          renderAttach();
        });
      });
    }
    $('#addAttachBtn', $('#taskModalBody')).addEventListener('click', async function() {
      var r = await window.api.addAttachment(editingId);
      if (r.ok) { editingAttachments.push(r.file); renderAttach(); }
      else if (!r.canceled) toast('附件失敗：' + r.error);
    });
    renderAttach();

    $('#taskSaveBtn').onclick = function() {
      var title = $('#fTitle').value.trim();
      if (!title) return toast('請輸入任務標題');
      var projectId = $('#fProject').value;
      var status = $('#fStatus').value;
      var obj = {
        title: title,
        desc: $('#fDesc').value.trim(),
        projectId: projectId || (state.projects[0] && state.projects[0].id),
        status: status,
        priority: $('#fPrio').value,
        assignee: $('#fMember').value || null,
        due: $('#fDue').value || null,
        tags: Array.from(editingTags),
        subtasks: editingSubtasks,
        attachments: editingAttachments,
        completedAt: status === 'done' ? (t && t.completedAt) || todayStr() : null
      };
      if (isEdit) Object.assign(t, obj);
      else state.tasks.push({ id: editingId, createdAt: todayStr() });
      Object.assign(state.tasks[state.tasks.length - 1] || t, obj);
      saveState().then(renderAll);
      closeModal();
      toast(isEdit ? '已更新任務' : '已新增任務');
    };
    $('#taskDeleteBtn').onclick = function() {
      if (!confirm('確定刪除這個任務？')) return;
      var dying = state.tasks.find(function(x) { return x.id === taskId; });
      if (dying && dying.attachments) dying.attachments.forEach(function(a) { window.api.removeAttachment(a.path); });
      state.tasks = state.tasks.filter(function(x) { return x.id !== taskId; });
      saveState().then(renderAll);
      closeModal();
      toast('已刪除');
    };
    $('#taskModal').hidden = false;
  }
  function closeModal() { $('#taskModal').hidden = true; }

  function emptyHTML() {
    return '<div class="empty"><div class="big">??</div>這裡還沒有符合條件的任務<br>點擊右上角「＋ 新增任務」開始吧</div>';
  }

  /* ===================================================================
     圖表（Canvas 手繪）
     =================================================================== */
  function setupCanvas(cv) {
    var dpr = window.devicePixelRatio || 1;
    var w = cv.clientWidth || cv.parentElement.clientWidth;
    var h = cv.height;
    cv.width = w * dpr; cv.height = h * dpr;
    var ctx = cv.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    return { ctx: ctx, w: w, h: h };
  }
  function cssVar(v) { return getComputedStyle(document.body).getPropertyValue(v).trim() || '#888'; }

  function drawBar(cv, labels, data, colors) {
    var s = setupCanvas(cv);
    var pad = 28, max = Math.max.apply(null, data.concat([1]));
    var bw = (s.w - pad * 2) / data.length;
    s.ctx.font = '12px sans-serif';
    data.forEach(function(d, i) {
      var bh = (d / max) * (s.h - pad * 2);
      var x = pad + i * bw + bw * 0.18;
      var y = s.h - pad - bh;
      s.ctx.fillStyle = colors[i].indexOf('var(') === 0 ? cssVar(colors[i].slice(4, -1)) : colors[i];
      s.ctx.fillRect(x, y, bw * 0.64, bh);
      s.ctx.fillStyle = cssVar('--text-dim');
      s.ctx.textAlign = 'center';
      s.ctx.fillText(d, x + bw * 0.32, y - 6);
      s.ctx.fillStyle = cssVar('--text');
      s.ctx.fillText(labels[i], x + bw * 0.32, s.h - 8);
    });
  }
  function drawDonut(cv, labels, data, colors) {
    var s = setupCanvas(cv);
    var total = data.reduce(function(a, b) { return a + b; }, 0);
    var cx = s.w / 2, cy = s.h / 2, r = Math.min(s.w, s.h) / 2 - 16;
    var ang = -Math.PI / 2;
    if (total === 0) {
      s.ctx.fillStyle = cssVar('--border');
      s.ctx.beginPath(); s.ctx.arc(cx, cy, r, 0, Math.PI * 2); s.ctx.fill();
    } else {
      data.forEach(function(d, i) {
        var slice = (d / total) * Math.PI * 2;
        s.ctx.beginPath();
        s.ctx.moveTo(cx, cy);
        s.ctx.arc(cx, cy, r, ang, ang + slice);
        s.ctx.closePath();
        s.ctx.fillStyle = colors[i].indexOf('var(') === 0 ? cssVar(colors[i].slice(4, -1)) : colors[i];
        s.ctx.fill();
        ang += slice;
      });
    }
    s.ctx.fillStyle = cssVar('--bg-elev');
    s.ctx.beginPath(); s.ctx.arc(cx, cy, r * 0.58, 0, Math.PI * 2); s.ctx.fill();
    s.ctx.fillStyle = cssVar('--text'); s.ctx.textAlign = 'center'; s.ctx.font = '13px sans-serif';
    s.ctx.fillText('共 ' + total, cx, cy + 4);
    var ly = s.h - labels.length * 16;
    labels.forEach(function(lb, i) {
      s.ctx.fillStyle = colors[i].indexOf('var(') === 0 ? cssVar(colors[i].slice(4, -1)) : colors[i];
      s.ctx.fillRect(8, ly, 10, 10);
      s.ctx.fillStyle = cssVar('--text-dim'); s.ctx.textAlign = 'left';
      s.ctx.fillText(lb + ': ' + data[i], 24, ly + 9);
      ly += 16;
    });
  }
  function drawTrend(cv, tasks) {
    var s = setupCanvas(cv);
    var pad = 26;
    var weeks = [];
    var now = new Date();
    for (var wi = 5; wi >= 0; wi--) {
      var end = new Date(now); end.setDate(end.getDate() - wi * 7);
      var start = new Date(end); start.setDate(start.getDate() - 6);
      var n = tasks.filter(function(t) { return t.status === 'done' && t.completedAt &&
        t.completedAt >= isoDay(start) && t.completedAt <= isoDay(end); }).length;
      weeks.push(n);
    }
    var max = Math.max.apply(null, weeks.concat([1]));
    var step = (s.w - pad * 2) / (weeks.length - 1);
    s.ctx.strokeStyle = cssVar('--accent'); s.ctx.lineWidth = 2; s.ctx.beginPath();
    weeks.forEach(function(n, i) {
      var x = pad + i * step;
      var y = s.h - pad - (n / max) * (s.h - pad * 2);
      i === 0 ? s.ctx.moveTo(x, y) : s.ctx.lineTo(x, y);
    });
    s.ctx.stroke();
    s.ctx.fillStyle = cssVar('--text-dim'); s.ctx.font = '11px sans-serif'; s.ctx.textAlign = 'center';
    weeks.forEach(function(n, i) { s.ctx.fillText(n, pad + i * step, s.h - 8); });
  }

  /* ===================================================================
     提醒
     =================================================================== */
  function checkReminders(force) {
    var today = todayStr();
    var count = 0;
    state.tasks.forEach(function(t) {
      if (t.status === 'done' || !t.due) return;
      var overdue = t.due < today;
      var dueToday = t.due === today;
      if ((overdue || dueToday) && (force || !notified.has(t.id))) {
        var proj = projectById(t.projectId);
        var title = overdue ? '任務已逾期' : '任務今天到期';
        window.api.notify(title, t.title + (proj ? ' · ' + proj.name : ''));
        notified.add(t.id);
        count++;
      }
    });
    if (force) toast(count ? '已提醒 ' + count + ' 個任務' : '沒有需要提醒的任務');
  }

  /* ===================================================================
     主題 / 初始化
     =================================================================== */
  function applyTheme() {
    document.body.setAttribute('data-theme', state.settings.theme || 'dark');
  }

  function bindGlobal() {
    $$('#navViews .nav-item').forEach(function(b) {
      b.addEventListener('click', function() {
        currentView = b.dataset.view;
        $$('#navViews .nav-item').forEach(function(x) { x.classList.remove('active'); });
        b.classList.add('active');
        renderAll();
      });
    });
    $('#addTaskBtn').addEventListener('click', function() { openTaskModal(null); });
    $('#addProjectBtn').addEventListener('click', function() {
      var name = prompt('請輸入專案名稱：');
      if (!name) return;
      var colors = ['#5b8cff', '#34d399', '#f472b6', '#fbbf24', '#7c5bff', '#22d3ee'];
      state.projects.push({ id: uid(), name: name.trim(), color: colors[state.projects.length % colors.length] });
      saveState().then(renderAll);
    });
    $('#themeToggle').addEventListener('click', function() {
      var order = ['dark', 'light', 'forest'];
      var i = order.indexOf(state.settings.theme || 'dark');
      state.settings.theme = order[(i + 1) % order.length];
      applyTheme(); saveState();
    });
    ['#searchInput', '#filterStatus', '#filterPriority', '#filterMember'].forEach(function(sel) {
      $(sel).addEventListener('input', renderAll);
    });
    $('#taskModalClose').addEventListener('click', closeModal);
    $('#taskCancelBtn').addEventListener('click', closeModal);
    $('#taskModal').addEventListener('click', function(e) { if (e.target.id === 'taskModal') closeModal(); });
  }

  async function init() {
    var loaded = await window.api.loadData();
    state = (loaded && loaded.tasks) ? loaded : seedData();
    applyTheme();
    bindGlobal();
    renderAll();
    checkReminders(false);
    setInterval(function() { checkReminders(false); }, 5 * 60 * 1000);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
