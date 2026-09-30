/* =========================================================
   GROWUP — script.js
   Toute la logique de l'application : profil, navigation,
   habitudes (sommeil / eau / activité), croissance, XP/badges.
   Tout est stocké en localStorage, uniquement sur cet appareil.
   ========================================================= */

const STORAGE_KEY = "growup_data_v1";

/* ---------------------------------------------------------
   1. MODÈLE DE DONNÉES + PERSISTENCE
   --------------------------------------------------------- */
function defaultState(){
  return {
    profile: null, // { name, age, goal, dark }
    sleep: [],      // { date, start, end, hours }
    water: {},      // { "YYYY-MM-DD": count }
    waterGoal: 8,
    activities: [], // { date, category, duration }
    heights: [],    // { date, cm }
    xp: 0,
    badges: [],     // unlocked badge ids
    challenge: { weekStart: null, count: 0, target: 3 }
  };
}

let state = loadState();

function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return defaultState();
    const parsed = JSON.parse(raw);
    return Object.assign(defaultState(), parsed);
  }catch(e){
    console.warn("Impossible de lire les données locales, réinitialisation.", e);
    return defaultState();
  }
}

function saveState(){
  try{
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }catch(e){
    console.warn("Impossible d'enregistrer les données (stockage plein ou indisponible).", e);
    showToast("Impossible d'enregistrer — stockage local indisponible.");
  }
}

/* ---------------------------------------------------------
   2. UTILITAIRES
   --------------------------------------------------------- */
function todayISO(d = new Date()){
  return d.toISOString().slice(0,10);
}
function fmtDateLong(iso){
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long' });
}
function showToast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(()=> t.classList.remove('show'), 2600);
}
function openModal(id){ document.getElementById(id).classList.add('open'); }
function closeModal(el){ el.closest('.modal-overlay').classList.remove('open'); }

/* ---------------------------------------------------------
   3. THÈME (clair / sombre)
   --------------------------------------------------------- */
function applyTheme(dark){
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  const label = document.getElementById('theme-toggle-app-label');
  if(label) label.textContent = dark ? 'Mode clair' : 'Mode sombre';
  const pDark = document.getElementById('p-dark');
  if(pDark) pDark.checked = dark;
}
function toggleTheme(){
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  applyTheme(!isDark);
  if(state.profile){ state.profile.dark = !isDark; saveState(); }
  else{ localStorage.setItem('growup_theme_pref', !isDark ? 'dark':'light'); }
}
(function initTheme(){
  const saved = state.profile ? state.profile.dark : (localStorage.getItem('growup_theme_pref') === 'dark');
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(saved !== undefined && saved !== null ? saved : prefersDark);
})();

/* ---------------------------------------------------------
   4. NAVIGATION LANDING <-> APP, ET ENTRE VUES
   --------------------------------------------------------- */
function showApp(){
  document.getElementById('landing').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
}
function showLanding(){
  document.getElementById('app').classList.add('hidden');
  document.getElementById('landing').classList.remove('hidden');
}

function switchView(view){
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.getElementById('view-'+view).classList.add('active');
  document.querySelectorAll('.side-link, .tab-link').forEach(b=>{
    b.classList.toggle('active', b.dataset.view === view);
  });
  if(view === 'dashboard') renderDashboard();
  if(view === 'wellness') renderWellness();
  if(view === 'growth') renderGrowth();
  if(view === 'progress') renderProgress();
  if(view === 'profile') renderProfileView();
}

document.querySelectorAll('[data-view]').forEach(btn=>{
  btn.addEventListener('click', ()=> switchView(btn.dataset.view));
});

/* ---------------------------------------------------------
   5. ONBOARDING (création de profil)
   --------------------------------------------------------- */
function initOnboarding(){
  if(state.profile){
    showApp();
    switchView('dashboard');
  } else {
    openModal('modal-onboarding');
  }
}

document.getElementById('form-onboarding').addEventListener('submit', e=>{
  e.preventDefault();
  state.profile = {
    name: document.getElementById('ob-name').value.trim(),
    age: document.getElementById('ob-age').value,
    goal: document.getElementById('ob-goal').value,
    dark: document.documentElement.getAttribute('data-theme') === 'dark'
  };
  saveState();
  document.getElementById('modal-onboarding').classList.remove('open');
  showApp();
  switchView('dashboard');
  showToast('Profil créé — bienvenue sur GROWUP !');
});

['cta-start-top','cta-start-hero'].forEach(id=>{
  document.getElementById(id).addEventListener('click', ()=>{
    if(state.profile){ showApp(); switchView('dashboard'); }
    else openModal('modal-onboarding');
  });
});

document.querySelectorAll('[data-close-modal]').forEach(b=> b.addEventListener('click', e=> closeModal(e.target)));
document.querySelectorAll('.modal-overlay').forEach(ov=>{
  ov.addEventListener('click', e=>{ if(e.target === ov) ov.classList.remove('open'); });
});
document.querySelectorAll('[data-open]').forEach(b=>{
  b.addEventListener('click', ()=> openModal(b.dataset.open));
});

/* ---------------------------------------------------------
   6. XP, NIVEAUX, BADGES
   --------------------------------------------------------- */
const XP_PER_LEVEL = 100;
const BADGE_DEFS = [
  { id:'first_sleep', icon:'🌙', name:'Première nuit', check: s => s.sleep.length >= 1 },
  { id:'first_water', icon:'💧', name:'Bien hydraté·e', check: s => Object.values(s.water).some(c=>c>=8) },
  { id:'first_activity', icon:'🏃', name:'En mouvement', check: s => s.activities.length >= 1 },
  { id:'five_activities', icon:'🔥', name:'Régularité', check: s => s.activities.length >= 5 },
  { id:'first_height', icon:'📏', name:'Explorateur croissance', check: s => s.heights.length >= 1 },
  { id:'level5', icon:'⭐', name:'Niveau 5', check: s => Math.floor(s.xp / XP_PER_LEVEL)+1 >= 5 },
  { id:'week_streak', icon:'📅', name:'Semaine active', check: s => countActiveDays(s, 7) >= 5 },
  { id:'ten_activities', icon:'🏆', name:'Sportif confirmé', check: s => s.activities.length >= 10 },
];

function countActiveDays(s, days){
  const set = new Set();
  s.activities.forEach(a=> set.add(a.date));
  s.sleep.forEach(a=> set.add(a.date));
  Object.entries(s.water).forEach(([d,c])=>{ if(c>0) set.add(d); });
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate()-days);
  let n = 0;
  set.forEach(d=>{ if(new Date(d) >= cutoff) n++; });
  return n;
}

function addXP(amount, reason){
  state.xp += amount;
  checkBadges();
  saveState();
  showToast(`+${amount} XP — ${reason}`);
}

function checkBadges(){
  BADGE_DEFS.forEach(b=>{
    if(!state.badges.includes(b.id) && b.check(state)){
      state.badges.push(b.id);
      setTimeout(()=> showToast(`🎉 Badge débloqué — ${b.name}`), 400);
    }
  });
}

function getLevel(){ return Math.floor(state.xp / XP_PER_LEVEL) + 1; }
function getLevelProgress(){ return state.xp % XP_PER_LEVEL; }

/* ---------------------------------------------------------
   7. DASHBOARD
   --------------------------------------------------------- */
function renderDashboard(){
  const name = state.profile.name ? state.profile.name : '';
  document.getElementById('welcome-msg').textContent = name ? `Bonjour ${name} 👋` : 'Bonjour 👋';
  document.getElementById('today-date').textContent = capitalize(fmtDateLong(todayISO()));

  // XP chip
  document.getElementById('level-badge').textContent = `Niv. ${getLevel()}`;
  document.getElementById('xp-bar-fill').style.width = getLevelProgress() + '%';

  // Objectifs du jour : sommeil renseigné aujourd'hui-ish, eau atteinte, 1 activité aujourd'hui
  const today = todayISO();
  const sleptRecently = state.sleep.some(s=> s.date === today || s.date === todayISO(new Date(Date.now()-86400000)));
  const waterToday = state.water[today] || 0;
  const waterOk = waterToday >= state.waterGoal;
  const activeToday = state.activities.some(a=> a.date === today);
  const goalsMet = [sleptRecently, waterOk, activeToday].filter(Boolean).length;
  const pct = Math.round((goalsMet/3)*100);
  document.getElementById('daily-percent').textContent = pct + '%';
  const ring = document.getElementById('daily-ring');
  const circumference = 314;
  ring.style.strokeDashoffset = circumference - (circumference*pct/100);

  // Sommeil dernière nuit
  const lastSleep = state.sleep[state.sleep.length-1];
  document.getElementById('sleep-last').textContent = lastSleep ? `${lastSleep.hours.toFixed(1)} h` : '—';

  // Hydratation
  document.getElementById('water-count').textContent = waterToday;
  document.getElementById('water-goal').textContent = state.waterGoal;

  // Activité 7 jours
  const bars = document.getElementById('activity-bars');
  bars.innerHTML = '';
  const days = lastNDays(7);
  const maxMinutes = Math.max(1, ...days.map(d => sumDuration(d)));
  days.forEach(d=>{
    const mins = sumDuration(d);
    const i = document.createElement('i');
    i.style.setProperty('--h', Math.max(6, Math.round((mins/maxMinutes)*100)) + '%');
    i.title = `${d}: ${mins} min`;
    bars.appendChild(i);
  });

  // Dernières activités
  const list = document.getElementById('recent-activities');
  const recent = [...state.activities].slice(-5).reverse();
  list.innerHTML = recent.length ? recent.map(a=>
    `<li><span>${a.category}${a.duration ? ' — '+a.duration+' min' : ''}</span><span class="muted">${a.date}</span></li>`
  ).join('') : '<li class="empty-row">Aucune activité pour l\'instant.</li>';

  // Calendrier des habitudes (14 jours)
  const cal = document.getElementById('habit-calendar');
  cal.innerHTML = '';
  lastNDays(14).forEach(d=>{
    const level = habitLevel(d);
    const cell = document.createElement('div');
    cell.className = 'habit-day';
    cell.dataset.level = level;
    cell.title = d;
    cell.textContent = d.slice(8,10);
    cal.appendChild(cell);
  });
}

function lastNDays(n){
  const arr = [];
  for(let i=n-1; i>=0; i--){
    const d = new Date(); d.setDate(d.getDate()-i);
    arr.push(todayISO(d));
  }
  return arr;
}
function sumDuration(dateISO){
  return state.activities.filter(a=>a.date===dateISO).reduce((s,a)=> s + (a.duration||15), 0);
}
function habitLevel(dateISO){
  let score = 0;
  if(state.sleep.some(s=>s.date===dateISO)) score++;
  if((state.water[dateISO]||0) > 0) score++;
  if(state.activities.some(a=>a.date===dateISO)) score++;
  return score; // 0..3
}
function capitalize(s){ return s.charAt(0).toUpperCase()+s.slice(1); }

document.getElementById('quick-water').addEventListener('click', ()=> addWater());

/* ---------------------------------------------------------
   8. BIEN-ÊTRE — Sommeil / Hydratation / Activité / Alimentation
   --------------------------------------------------------- */
document.querySelectorAll('.tab').forEach(tab=>{
  tab.addEventListener('click', ()=>{
    document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p=>p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('panel-'+tab.dataset.tab).classList.add('active');
  });
});

function renderWellness(){
  renderSleepHistory();
  renderWaterUI();
  renderActivityHistory();
  document.getElementById('water-goal-input').value = state.waterGoal;
}

// Sommeil
function computeHours(start, end){
  const [sh,sm] = start.split(':').map(Number);
  const [eh,em] = end.split(':').map(Number);
  let startMin = sh*60+sm, endMin = eh*60+em;
  if(endMin <= startMin) endMin += 24*60; // passe minuit
  return (endMin-startMin)/60;
}
function logSleep(start, end){
  const hours = computeHours(start, end);
  state.sleep.push({ date: todayISO(), start, end, hours: Math.round(hours*10)/10 });
  addXP(10, 'sommeil enregistré');
  renderSleepHistory();
  renderDashboard();
}
document.getElementById('form-sleep').addEventListener('submit', e=>{
  e.preventDefault();
  logSleep(document.getElementById('sleep-start').value, document.getElementById('sleep-end').value);
  e.target.reset();
  showToast('Nuit enregistrée.');
});
document.getElementById('form-sleep-quick').addEventListener('submit', e=>{
  e.preventDefault();
  logSleep(document.getElementById('qs-start').value, document.getElementById('qs-end').value);
  e.target.reset();
  document.getElementById('modal-sleep').classList.remove('open');
  showToast('Nuit enregistrée.');
});
function renderSleepHistory(){
  const el = document.getElementById('sleep-history');
  const recent = [...state.sleep].slice(-7).reverse();
  el.innerHTML = recent.length ? recent.map(s=>
    `<li><span>${s.date}</span><span>${s.start} → ${s.end} (${s.hours.toFixed(1)} h)</span></li>`
  ).join('') : '<li class="empty-row">Pas encore de données.</li>';
}

// Hydratation
function addWater(){
  const today = todayISO();
  state.water[today] = (state.water[today]||0) + 1;
  const reached = state.water[today] === state.waterGoal;
  saveState();
  renderWaterUI();
  renderDashboard();
  if(reached) addXP(15, 'objectif d\'hydratation atteint'); else showToast('Verre ajouté 💧');
}
document.getElementById('add-water-btn').addEventListener('click', addWater);
document.getElementById('water-goal-input').addEventListener('change', e=>{
  state.waterGoal = Math.max(1, parseInt(e.target.value)||8);
  saveState();
  renderWaterUI();
  renderDashboard();
});
function renderWaterUI(){
  const today = todayISO();
  const count = state.water[today] || 0;
  const goal = state.waterGoal;
  const wrap = document.getElementById('water-glasses');
  wrap.innerHTML = '';
  for(let i=0;i<goal;i++){
    const g = document.createElement('div');
    g.className = 'glass' + (i < count ? ' filled' : '');
    wrap.appendChild(g);
  }
}
document.getElementById('water-reminders').addEventListener('change', updateReminderStatus);
document.getElementById('water-reminder-interval').addEventListener('change', updateReminderStatus);
function updateReminderStatus(){
  const on = document.getElementById('water-reminders').checked;
  const mins = document.getElementById('water-reminder-interval').value;
  const label = { '60':'1 heure', '90':'1h30', '120':'2 heures' }[mins];
  document.getElementById('water-reminder-status').textContent = on
    ? `Rappel visuel toutes les ${label} (pendant que l'onglet reste ouvert).`
    : 'Rappels désactivés.';
  clearInterval(updateReminderStatus._timer);
  if(on){
    updateReminderStatus._timer = setInterval(()=> showToast('💧 Pense à boire un peu d\'eau !'), parseInt(mins)*60*1000);
  }
}

// Activité
document.getElementById('form-activity').addEventListener('submit', e=>{
  e.preventDefault();
  const category = document.getElementById('activity-category').value;
  const duration = parseInt(document.getElementById('activity-duration').value) || null;
  state.activities.push({ date: todayISO(), category, duration });
  addXP(12, 'activité enregistrée');
  renderActivityHistory();
  renderDashboard();
  e.target.reset();
  showToast('Activité ajoutée.');
});
function renderActivityHistory(){
  const el = document.getElementById('activity-history');
  const recent = [...state.activities].slice(-8).reverse();
  el.innerHTML = recent.length ? recent.map(a=>
    `<li><span>${a.category}${a.duration ? ' — '+a.duration+' min' : ''}</span><span class="muted">${a.date}</span></li>`
  ).join('') : '<li class="empty-row">Pas encore d\'activité enregistrée.</li>';
}

/* ---------------------------------------------------------
   9. CROISSANCE
   --------------------------------------------------------- */
function renderGrowth(){
  const dateInput = document.getElementById('height-date');
  if(!dateInput.value) dateInput.value = todayISO();
  drawHeightChart();
}
document.getElementById('form-height').addEventListener('submit', e=>{
  e.preventDefault();
  const date = document.getElementById('height-date').value || todayISO();
  const cm = parseFloat(document.getElementById('height-value').value);
  if(!cm) return;
  state.heights.push({ date, cm });
  state.heights.sort((a,b)=> a.date.localeCompare(b.date));
  addXP(8, 'mesure de taille ajoutée');
  document.getElementById('height-value').value = '';
  drawHeightChart();
  showToast('Mesure ajoutée.');
});
function drawHeightChart(){
  const canvas = document.getElementById('height-chart');
  const empty = document.getElementById('height-empty');
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0,0,canvas.width,canvas.height);
  if(state.heights.length < 1){ empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');

  const pad = 30;
  const w = canvas.width - pad*2, h = canvas.height - pad*2;
  const values = state.heights.map(d=>d.cm);
  const min = Math.min(...values) - 2, max = Math.max(...values) + 2;
  const styles = getComputedStyle(document.documentElement);
  const accent = styles.getPropertyValue('--accent').trim() || '#2F7D6B';
  const line = styles.getPropertyValue('--line').trim() || '#ddd';

  // axes
  ctx.strokeStyle = line; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(pad, pad); ctx.lineTo(pad, pad+h); ctx.lineTo(pad+w, pad+h); ctx.stroke();

  // line
  ctx.strokeStyle = accent; ctx.lineWidth = 3; ctx.lineJoin='round'; ctx.lineCap='round';
  ctx.beginPath();
  state.heights.forEach((pt,i)=>{
    const x = pad + (state.heights.length===1 ? w/2 : (i/(state.heights.length-1))*w);
    const y = pad + h - ((pt.cm-min)/(max-min))*h;
    if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  });
  ctx.stroke();

  ctx.fillStyle = accent;
  state.heights.forEach((pt,i)=>{
    const x = pad + (state.heights.length===1 ? w/2 : (i/(state.heights.length-1))*w);
    const y = pad + h - ((pt.cm-min)/(max-min))*h;
    ctx.beginPath(); ctx.arc(x,y,4,0,Math.PI*2); ctx.fill();
  });
}

/* ---------------------------------------------------------
   10. PROGRESSION
   --------------------------------------------------------- */
function renderProgress(){
  document.getElementById('progress-level').textContent = getLevel();
  document.getElementById('progress-xp-fill').style.width = getLevelProgress() + '%';
  document.getElementById('progress-xp-label').textContent = `${getLevelProgress()} / ${XP_PER_LEVEL} XP`;

  const grid = document.getElementById('badge-grid');
  grid.innerHTML = BADGE_DEFS.map(b=>{
    const unlocked = state.badges.includes(b.id);
    return `<div class="badge ${unlocked?'unlocked':''}"><span class="badge-icon">${b.icon}</span><span class="badge-name">${b.name}</span></div>`;
  }).join('');

  // Défi hebdomadaire : 3 activités cette semaine
  const weekStart = getWeekStart();
  if(state.challenge.weekStart !== weekStart){
    state.challenge = { weekStart, count: 0, target: 3 };
  }
  const count = state.activities.filter(a=> a.date >= weekStart).length;
  state.challenge.count = count;
  saveState();
  const pct = Math.min(100, Math.round((count/state.challenge.target)*100));
  document.getElementById('challenge-fill').style.width = pct + '%';
  document.getElementById('challenge-progress-label').textContent = `${Math.min(count,state.challenge.target)} / ${state.challenge.target}`;
}
function getWeekStart(){
  const d = new Date();
  const day = d.getDay() || 7;
  if(day !== 1) d.setDate(d.getDate() - (day-1));
  return todayISO(d);
}

/* ---------------------------------------------------------
   11. PROFIL
   --------------------------------------------------------- */
function renderProfileView(){
  if(!state.profile) return;
  document.getElementById('p-name').value = state.profile.name || '';
  document.getElementById('p-age').value = state.profile.age;
  document.getElementById('p-goal').value = state.profile.goal;
  document.getElementById('p-dark').checked = document.documentElement.getAttribute('data-theme') === 'dark';
}
document.getElementById('form-profile-edit').addEventListener('submit', e=>{
  e.preventDefault();
  state.profile.name = document.getElementById('p-name').value.trim();
  state.profile.age = document.getElementById('p-age').value;
  state.profile.goal = document.getElementById('p-goal').value;
  saveState();
  showToast('Profil mis à jour.');
  renderDashboard();
});
document.getElementById('p-dark').addEventListener('change', toggleTheme);

document.getElementById('delete-data-btn').addEventListener('click', ()=>{
  if(confirm('Supprimer définitivement toutes tes données GROWUP sur cet appareil ? Cette action est irréversible.')){
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem('growup_theme_pref');
    state = defaultState();
    applyTheme(false);
    showLanding();
    showToast('Toutes tes données ont été supprimées.');
  }
});

/* ---------------------------------------------------------
   12. THEME TOGGLES (landing + app)
   --------------------------------------------------------- */
document.getElementById('theme-toggle-landing').addEventListener('click', toggleTheme);
document.getElementById('theme-toggle-app').addEventListener('click', toggleTheme);

/* ---------------------------------------------------------
   13. REVEAL AU DÉFILEMENT (landing page)
   --------------------------------------------------------- */
const io = new IntersectionObserver(entries=>{
  entries.forEach(en=>{ if(en.isIntersecting) en.target.classList.add('in'); });
}, { threshold: .15 });
document.querySelectorAll('.reveal').forEach(el=> io.observe(el));

/* ---------------------------------------------------------
   14. DÉMARRAGE
   --------------------------------------------------------- */
initOnboarding();
