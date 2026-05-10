const STORAGE_KEY = "s7robotics-crm-v3";
const SESSION_KEY = "s7robotics-session-v1";
const API_URL = "api/index.php";
const TOKEN_KEY = "s7robotics-api-token";

const seed = {
  users: [],
  students: [],
  payments: [],
  attendance: [],
  feedback: [],
  schedule: [],
  lessonChecks: [],
  tasks: [],
  xpAdjustments: [],
};

const statusText = {
  active: "Активен",
  trial: "Пробное",
  pause: "Пауза",
  paid: "Оплачен",
  soon: "Скоро",
  overdue: "Просрочен",
  present: "Был",
  absent: "Не был",
  missed: "Нет отметки",
};

const appShell = document.querySelector(".app-shell");
const authScreen = document.querySelector("#authScreen");
const appView = document.querySelector("#appView");
const pageTitle = document.querySelector("#pageTitle");
const modalRoot = document.querySelector("#modalRoot");
const globalSearch = document.querySelector("#globalSearch");
const currentUserName = document.querySelector("#currentUserName");
const currentUserRole = document.querySelector("#currentUserRole");
const logoutButton = document.querySelector("#logoutButton");
const authError = document.querySelector("#authError");

let state = loadState();
let currentUser = null;
let backendEnabled = false;
let activeView = "dashboard";
let searchTerm = "";
let attendanceGroup = "all";

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return structuredClone(seed);
  try {
    const parsed = JSON.parse(saved);
    return normalizeState({ ...structuredClone(seed), ...parsed });
  } catch {
    return structuredClone(seed);
  }
}

function normalizeState(nextState) {
  nextState.users = nextState.users || [];
  nextState.students = nextState.students || [];
  nextState.payments = nextState.payments || [];
  nextState.feedback = nextState.feedback || [];
  nextState.schedule = nextState.schedule || [];
  nextState.lessonChecks = nextState.lessonChecks || [];
  nextState.tasks = nextState.tasks || [];
  nextState.xpAdjustments = nextState.xpAdjustments || [];
  nextState.attendance = (nextState.attendance || []).map((item, index) => ({
    id: item.id || Date.now() + index,
    ...item,
    studentId: Number(item.studentId),
  }));
  return nextState;
}

function saveState() {
  if (!backendEnabled) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }
}

async function apiRequest(action, payload = {}) {
  const token = localStorage.getItem(TOKEN_KEY);
  const response = await fetch(`${API_URL}?action=${encodeURIComponent(action)}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Backend недоступен");
  }
  if (!response.ok) {
    throw new Error(data.error || "Ошибка сервера");
  }
  backendEnabled = true;
  return data;
}

async function refreshData() {
  const data = await apiRequest("data");
  currentUser = data.user;
  state = normalizeState({ ...structuredClone(seed), ...data.state });
  renderShell();
}

function applyAuthResponse(data) {
  if (data.token) {
    localStorage.setItem(TOKEN_KEY, data.token);
  }
  currentUser = data.user;
  state = normalizeState({ ...structuredClone(seed), ...data.state });
  activeView = "dashboard";
  renderShell();
}

function setSession(user) {
  currentUser = user;
  localStorage.setItem(SESSION_KEY, String(user.id));
  activeView = "dashboard";
  renderShell();
}

function logout() {
  if (backendEnabled) {
    apiRequest("logout").catch(() => {});
  }
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(SESSION_KEY);
  currentUser = null;
  renderShell();
}

function isAdmin() {
  return currentUser?.role === "admin";
}

function canUse(view) {
  if (!currentUser) return false;
  if (isAdmin()) return true;
  return ["dashboard", "students", "attendance", "feedback", "tasks", "team"].includes(view);
}

function visibleStudents() {
  if (!currentUser) return [];
  if (isAdmin()) return state.students;
  const groups = new Set(currentUser.groups || []);
  return state.students.filter((student) => groups.has(student.group) || student.mentor === currentUser.name);
}

function visibleStudentIds() {
  return new Set(visibleStudents().map((student) => Number(student.id)));
}

function visiblePayments() {
  const ids = visibleStudentIds();
  return state.payments.filter((payment) => ids.has(Number(payment.studentId)));
}

function visibleAttendance() {
  const ids = visibleStudentIds();
  return state.attendance.filter((item) => ids.has(Number(item.studentId)));
}

function visibleFeedback() {
  const ids = visibleStudentIds();
  return state.feedback.filter((item) => ids.has(Number(item.studentId)));
}

function visibleSchedule() {
  if (isAdmin()) return state.schedule;
  const groups = new Set(currentUser?.groups || []);
  return state.schedule.filter((lesson) => groups.has(lesson.group) || lesson.mentor === currentUser?.name);
}

function filteredStudents() {
  const term = searchTerm.trim().toLowerCase();
  const students = visibleStudents();
  if (!term) return students;
  return students.filter((student) =>
    [student.name, student.course, student.group, student.parent, student.phone, student.mentor]
      .join(" ")
      .toLowerCase()
      .includes(term),
  );
}

function formatMoney(value) {
  return new Intl.NumberFormat("ru-KZ").format(value) + " ₸";
}

function formatDate(date) {
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(new Date(date));
}

function byId(id) {
  return state.students.find((student) => student.id === Number(id));
}

function uniqueGroups() {
  return [...new Set(visibleStudents().map((student) => student.group))].sort();
}

function latestFeedbackDate(studentId) {
  return visibleFeedback()
    .filter((note) => Number(note.studentId) === Number(studentId))
    .map((note) => note.date)
    .sort()
    .at(-1);
}

function crmTasks() {
  const students = visibleStudents();
  const tasks = [];
  students
    .filter((student) => student.lessonsLeft <= 2)
    .forEach((student) => {
      tasks.push({
        title: `${student.name}: осталось ${student.lessonsLeft} занятий`,
        hint: isAdmin() ? "Проверить продление абонемента" : "Сообщить админу о продлении",
        view: isAdmin() ? "payments" : "students",
        tone: student.lessonsLeft === 0 ? "overdue" : "soon",
      });
    });
  students
    .filter((student) => !latestFeedbackDate(student.id))
    .forEach((student) => {
      tasks.push({
        title: `${student.name}: нет фидбека`,
        hint: "Добавить короткий комментарий после урока",
        view: "feedback",
        tone: "neutral",
      });
    });
  if (isAdmin()) {
    state.payments
      .filter((payment) => payment.status === "overdue")
      .forEach((payment) => {
        const student = byId(payment.studentId);
        tasks.push({
          title: `${student?.name ?? "Ученик"}: просрочена оплата`,
          hint: `${payment.plan} · ${formatMoney(payment.amount)}`,
          view: "payments",
          tone: "overdue",
        });
      });
  }
  if (!isAdmin()) {
    tasks.push({
      title: "Проверить структуру следующего урока",
      hint: "Цель, практика, контроль, фидбек",
      view: "team",
      tone: "soon",
    });
  }
  return tasks.slice(0, 6);
}

function mentorQualityStats(user = currentUser) {
  const checks = (state.lessonChecks || []).filter((check) => check.mentor === user?.name);
  const userStudents = user?.role === "admin" ? state.students : state.students.filter((student) => (user?.groups || []).includes(student.group) || student.mentor === user?.name);
  const userStudentIds = new Set(userStudents.map((student) => Number(student.id)));
  const userFeedback = (state.feedback || []).filter((note) => userStudentIds.has(Number(note.studentId)) || note.mentor === user?.name);
  const userAttendance = (state.attendance || []).filter((item) => userStudentIds.has(Number(item.studentId)));
  const manualXp = (state.xpAdjustments || [])
    .filter((item) => item.mentor === user?.name)
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const today = new Date().toISOString().slice(0, 10);
  const totalScore = checks.reduce((sum, check) => sum + Number(check.score || 0), 0);
  const avg = checks.length ? Math.round(totalScore / checks.length) : 0;
  const xp = Math.max(0, totalScore + userFeedback.length * 15 + userAttendance.length * 3 + manualXp);
  const rank = mentorRank(xp, avg);
  const todayChecks = checks.filter((check) => check.date === today).length;
  const todayAttendance = userAttendance.filter((item) => item.date === today).length;
  const todayFeedback = userFeedback.filter((item) => item.date === today).length;
  const perfectChecks = checks.filter((check) => Number(check.score) >= 90).length;
  const streak = mentorStreak(checks);
  const tasks = [
    dailyTask("Отметить посещаемость", todayAttendance > 0, `${todayAttendance} отметок сегодня`),
    dailyTask("Добавить фидбек", todayFeedback > 0, `${todayFeedback} заметок сегодня`),
    dailyTask("Проверить урок", todayChecks > 0, `${todayChecks} проверок сегодня`),
    dailyTask("Закрыть качество 85+", checks.some((check) => check.date === today && Number(check.score) >= 85), "цель на день"),
  ];
  const achievements = [
    achievement("Первый контроль", checks.length >= 1, "Сделать первую проверку урока"),
    achievement("Стабильный стандарт", perfectChecks >= 3, "3 урока с качеством 90+"),
    achievement("Фидбек-мастер", userFeedback.length >= Math.max(3, userStudents.length), "Фидбеков не меньше числа учеников"),
    achievement("Серия наставника", streak >= 3, "3 дня подряд с проверками"),
  ];
  return { checks, avg, xp, manualXp, rank, tasks, achievements, next: rank.next, streak };
}

function mentorRank(xp, avg) {
  const ranks = [
    { title: "Rookie Mentor", min: 0, next: "Набрать 300 XP и средний балл 60+" },
    { title: "Builder Mentor", min: 300, next: "Набрать 750 XP и средний балл 75+" },
    { title: "Pro Mentor", min: 750, next: "Набрать 1400 XP и средний балл 85+" },
    { title: "Master Mentor", min: 1400, next: "Держать 90+ и помогать другим менторам" },
  ];
  let rank = ranks[0];
  if (xp >= 1400 && avg >= 85) rank = ranks[3];
  else if (xp >= 750 && avg >= 75) rank = ranks[2];
  else if (xp >= 300 && avg >= 60) rank = ranks[1];
  return rank;
}

function mentorStreak(checks) {
  const dates = [...new Set(checks.map((check) => check.date))].sort().reverse();
  let streak = 0;
  const cursor = new Date();
  for (const date of dates) {
    const expected = cursor.toISOString().slice(0, 10);
    if (date !== expected) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function dailyTask(title, done, hint) {
  return { title, done, hint };
}

function achievement(title, unlocked, hint) {
  return { title, unlocked, hint };
}

function renderShell() {
  if (!currentUser) {
    authScreen.hidden = false;
    appShell.hidden = true;
    updateAuthMode();
    return;
  }

  authScreen.hidden = true;
  appShell.hidden = false;
  currentUserName.textContent = currentUser.name;
  currentUserRole.textContent = isAdmin() ? "Админ" : `Ментор · ${currentUser.groups.join(", ") || "нет групп"}`;
  if (!canUse(activeView)) activeView = "dashboard";
  updatePageTitle();
  syncNavigation();
  render();
}

function updateAuthMode() {
  const tabs = document.querySelector(".auth-tabs");
  const loginTab = document.querySelector('[data-auth-tab="login"]');
  const registerTab = document.querySelector('[data-auth-tab="register"]');
  const loginForm = document.querySelector("#loginForm");
  const registerForm = document.querySelector("#registerForm");
  const roleSelect = document.querySelector('#registerForm select[name="role"]');
  const groupsInput = document.querySelector('#registerForm input[name="groups"]');
  if (!tabs || !roleSelect || !groupsInput || !loginTab || !registerTab || !loginForm || !registerForm) return;
  if (state.users.length === 0) {
    tabs.hidden = false;
    registerTab.hidden = false;
    roleSelect.value = "admin";
    roleSelect.disabled = true;
    groupsInput.disabled = true;
    groupsInput.placeholder = "Первый аккаунт получает полный доступ";
  } else {
    registerTab.hidden = true;
    loginTab.classList.add("active");
    registerTab.classList.remove("active");
    loginForm.hidden = false;
    registerForm.hidden = true;
  }
}

function syncNavigation() {
  document.querySelectorAll(".nav-item").forEach((item) => {
    const allowed = canUse(item.dataset.view);
    item.hidden = !allowed;
    item.classList.toggle("active", item.dataset.view === activeView);
  });
}

function setView(view) {
  if (!canUse(view)) return;
  activeView = view;
  syncNavigation();
  updatePageTitle();
  render();
}

function updatePageTitle() {
  pageTitle.textContent = {
    dashboard: "Обзор",
    students: "Ученики",
    attendance: "Табель посещаемости",
    payments: "Абонементы",
    feedback: "Фидбек",
    tasks: "Задачи",
    team: "Команда",
  }[activeView];
}

function render() {
  const renderers = {
    dashboard: renderDashboard,
    students: renderStudents,
    attendance: renderAttendance,
    payments: renderPayments,
    feedback: renderFeedback,
    tasks: renderTasks,
    team: renderTeam,
  };
  appView.innerHTML = renderers[activeView]();
  bindViewActions();
  updateToday();
}

function updateToday() {
  document.querySelector("#todayLabel").textContent = new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
  }).format(new Date());
  const day = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"][new Date().getDay()];
  const lessons = visibleSchedule().filter((item) => item.day === day).length;
  document.querySelector("#todayClasses").textContent = `${lessons} занятий`;
}

function renderDashboard() {
  const students = visibleStudents();
  const payments = isAdmin() ? state.payments : visiblePayments();
  const attendance = visibleAttendance();
  const active = students.filter((student) => student.status === "active").length;
  const due = payments.filter((payment) => payment.status !== "paid").length;
  const revenue = payments
    .filter((payment) => payment.status === "paid")
    .reduce((sum, payment) => sum + payment.amount, 0);
  const avgProgress = students.length
    ? Math.round(students.reduce((sum, student) => sum + student.progress, 0) / students.length)
    : 0;
  const present = attendance.filter((item) => item.status === "present").length;

  return `
    ${dashboardLanding(students.length, active, present)}
    <div class="stats-grid">
      ${stat("Ученики", students.length, isAdmin() ? "все группы" : "мои группы")}
      ${stat("Активные", active, "учатся сейчас")}
      ${stat("Посещений", present, "отмечено")}
      ${stat(isAdmin() ? "Выручка" : "Прогресс", isAdmin() ? formatMoney(revenue) : `${avgProgress}%`, isAdmin() ? `${due} оплат к контролю` : "средний по группам")}
    </div>
    <div class="module-grid">
      <article class="card">
        <div class="card-header">
          <h3>${isAdmin() ? "Ближайшие оплаты" : "Мои ученики"}</h3>
          <button class="button secondary" data-view-jump="${isAdmin() ? "payments" : "students"}" type="button">Открыть</button>
        </div>
        <div class="card-body list">
          ${
            isAdmin()
              ? payments.map((payment) => paymentRow(payment)).join("")
              : students.map((student) => studentProgressRow(student)).join("")
          }
        </div>
      </article>
      <article class="card">
        <div class="card-header"><h3>Прогресс</h3><span class="badge neutral">${avgProgress}%</span></div>
        <div class="card-body list">
          ${students.map((student) => studentProgressRow(student)).join("") || `<div class="empty">Нет учеников</div>`}
        </div>
      </article>
    </div>
    <article class="card">
      <div class="card-header"><h3>Задачи CRM</h3><span class="badge neutral">${crmTasks().length} активных</span></div>
      <div class="card-body list">
        ${
          crmTasks()
            .map(
              (task) => `
                <button class="task-row" data-view-jump="${task.view}" type="button">
                  <span class="badge ${task.tone}">${task.tone === "overdue" ? "Важно" : task.tone === "soon" ? "Скоро" : "Фидбек"}</span>
                  <span><strong>${task.title}</strong><small>${task.hint}</small></span>
                </button>`,
            )
            .join("") || `<div class="empty">Все спокойно: критичных задач нет</div>`
        }
      </div>
    </article>
    <article class="card">
      <div class="card-header"><h3>Расписание</h3><span class="badge neutral">${isAdmin() ? "все группы" : "мои группы"}</span></div>
      <div class="card-body attendance-grid">${scheduleCells()}</div>
    </article>
  `;
}

function dashboardLanding(totalStudents, activeStudents, visits) {
  return `
    <section class="landing-dashboard">
      <div class="landing-copy">
        <span class="landing-kicker">S7 Robotics Mangystau</span>
        <h2>Образовательная экосистема робототехники для детей и подростков.</h2>
        <p>Центр, где ученики собирают роботов, пишут код, готовятся к соревнованиям и получают понятную траекторию развития.</p>
        <div class="landing-actions">
          <button class="button primary" data-view-jump="students" type="button">Ученики</button>
          <button class="button secondary" data-view-jump="attendance" type="button">Табель</button>
          ${isAdmin() ? `<button class="button ghost" data-view-jump="team" type="button">Команда</button>` : ""}
        </div>
      </div>
      <div class="network-visual" aria-label="Сеть S7 Robotics">
        <div class="network-node hub">S7</div>
        <div class="network-node n1">15</div>
        <div class="network-node n2">19</div>
        <div class="network-node n3">NIS</div>
        <div class="network-node n4">32</div>
        <div class="network-line l1"></div>
        <div class="network-line l2"></div>
        <div class="network-line l3"></div>
        <div class="network-line l4"></div>
      </div>
    </section>

    <div class="landing-panels">
      <article class="card branch-map-card">
        <div class="card-header">
          <h3>Карта присутствия в Мангистауской области</h3>
          <span class="badge neutral">филиалы и архив</span>
        </div>
        <div class="map-layout">
          ${mangystauMap()}
          <div class="branch-list">
            ${branchRow("15 мкр, 70 здание", "Филиал S7 Robotics", "active")}
            ${branchRow("19 мкр, 23/1", "Филиал S7 Robotics", "active")}
            ${branchRow("32 ЖББМ", "Школьная площадка", "soon")}
            ${branchRow("ТОО Tanym School", "Партнерская площадка", "neutral")}
            ${branchRow("АОО NIS", "Партнерская площадка", "neutral")}
          </div>
        </div>
      </article>
      <article class="card landing-metrics-card">
        <div class="card-header"><h3>Операционные показатели</h3><span class="badge active">live</span></div>
        <div class="landing-metrics">
          ${landingMetric(totalStudents, "учеников в CRM")}
          ${landingMetric(activeStudents, "активных")}
          ${landingMetric(visits, "отметок посещения")}
          ${landingMetric(uniqueGroups().length, "групп")}
        </div>
      </article>
    </div>
  `;
}

function landingMetric(value, label) {
  return `<div><strong>${value}</strong><span>${label}</span></div>`;
}

function branchRow(name, label, tone) {
  return `
    <div class="branch-row">
      <span class="map-dot ${tone}"></span>
      <div>
        <strong>${name}</strong>
        <small>${label}</small>
      </div>
    </div>`;
}

function mangystauMap() {
  return `
    <div class="mangystau-map" aria-label="Карта Мангистауской области">
      <svg viewBox="0 0 520 380" role="img">
        <path class="sea" d="M0 0h174c-34 38-47 82-37 132 11 56-12 98-58 130-35 25-56 64-64 118H0z" />
        <path class="region" d="M168 26c63 6 106 28 130 67 29 47 70 61 125 50 50-10 84 10 92 59 8 53-20 95-77 126-61 33-130 36-206 10-71-24-117-64-138-120-17-46-5-88 35-126 19-19 32-41 39-66z" />
        <path class="road" d="M174 238c64-25 123-39 178-42 53-3 95 4 128 22" />
        <path class="road" d="M214 107c38 41 67 85 87 132 13 31 20 61 21 91" />
        ${mapMarker(230, 170, "15 мкр", "active")}
        ${mapMarker(252, 188, "19 мкр", "active")}
        ${mapMarker(280, 155, "32 ЖББМ", "soon")}
        ${mapMarker(305, 205, "Tanym", "neutral")}
        ${mapMarker(214, 140, "NIS", "neutral")}
      </svg>
    </div>
  `;
}

function mapMarker(x, y, label, tone) {
  return `
    <g class="map-marker ${tone}" transform="translate(${x} ${y})">
      <circle r="11"></circle>
      <circle r="4"></circle>
      <text x="16" y="5">${label}</text>
    </g>`;
}

function stat(label, value, hint) {
  return `<article class="card stat"><span>${label}</span><strong>${value}</strong><small>${hint}</small></article>`;
}

function studentProgressRow(student) {
  return `
    <div class="list-row">
      <div>
        <strong>${student.name}</strong>
        <small>${student.course} · ${student.group}</small>
      </div>
      <div class="progress-cell">
        <div class="progress"><span style="width:${student.progress}%"></span></div>
        <small>${student.progress}%</small>
      </div>
    </div>`;
}

function renderStudents() {
  const students = filteredStudents();
  return `
    <div class="toolbar">
      <div class="filters">
        ${isAdmin() ? `<button class="button primary" data-add-student type="button">+ Ученик</button>` : ""}
        ${isAdmin() ? `<button class="button ghost" data-reset-demo type="button">Сброс демо</button>` : ""}
      </div>
      <span class="badge neutral">${students.length} записей</span>
    </div>
    <article class="card">
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Ученик</th>
              <th>Курс</th>
              <th>Родитель</th>
              <th>Ментор</th>
              <th>Абонемент</th>
              <th>Статус</th>
              <th>Действия</th>
            </tr>
          </thead>
          <tbody>
            ${students
              .map(
                (student) => `
                  <tr>
                    <td><strong>${student.name}</strong><small>${student.group} · ${student.phone}</small></td>
                    <td>${student.course}<small>Прогресс ${student.progress}%</small></td>
                    <td>${student.parent}</td>
                    <td>${student.mentor}</td>
                    <td>${student.lessonsLeft} занятий<small>${isAdmin() ? `оплата ${formatDate(student.nextPayment)}` : "детали у админа"}</small></td>
                    <td><span class="badge ${student.status}">${statusText[student.status]}</span></td>
                    <td>
                      <div class="row-actions">
                        <button class="button ghost compact" data-open-student="${student.id}" type="button">Профиль</button>
                        ${isAdmin() ? `<button class="button danger compact" data-delete-student="${student.id}" type="button">Удалить</button>` : ""}
                      </div>
                    </td>
                  </tr>`,
              )
              .join("") || `<tr><td colspan="7"><div class="empty">Ничего не найдено</div></td></tr>`}
          </tbody>
        </table>
      </div>
    </article>
  `;
}

function renderAttendance() {
  const groups = uniqueGroups();
  if (attendanceGroup !== "all" && !groups.includes(attendanceGroup)) attendanceGroup = "all";
  const students = visibleStudents().filter((student) => attendanceGroup === "all" || student.group === attendanceGroup);
  const selectedIds = new Set(students.map((student) => Number(student.id)));
  const dates = attendanceDates(selectedIds);
  const records = visibleAttendance();

  return `
    <div class="toolbar">
      <div class="filters">
        <button class="button primary" data-add-attendance type="button">+ Отметка</button>
        <button class="button ghost" data-export-attendance type="button">Экспорт CSV</button>
        <label class="inline-filter">Группа
          <select id="attendanceGroupFilter">
            <option value="all">Все доступные</option>
            ${groups.map((group) => `<option value="${group}" ${group === attendanceGroup ? "selected" : ""}>${group}</option>`).join("")}
          </select>
        </label>
      </div>
      <span class="badge neutral">${isAdmin() ? "админ видит все группы" : "только мои группы"}</span>
    </div>
    <article class="card">
      <div class="card-header">
        <h3>Табель посещаемости</h3>
        <span class="badge neutral">${students.length} учеников</span>
      </div>
      <div class="table-wrap">
        <table class="attendance-table">
          <thead>
            <tr>
              <th>Ученик</th>
              <th>Группа</th>
              ${dates.map((date) => `<th>${formatDate(date)}</th>`).join("")}
              <th>Итого</th>
            </tr>
          </thead>
          <tbody>
            ${
              students
                .map((student) => {
                  const rowRecords = records.filter((item) => Number(item.studentId) === Number(student.id));
                  const presentCount = rowRecords.filter((item) => item.status === "present").length;
                  return `
                    <tr>
                      <td><strong>${student.name}</strong><small>${student.course}</small></td>
                      <td>${student.group}<small>${student.mentor}</small></td>
                      ${dates.map((date) => attendanceCell(student.id, date, records)).join("")}
                      <td><strong>${presentCount}/${dates.length}</strong><small>посещений</small></td>
                    </tr>`;
                })
                .join("") || `<tr><td colspan="${dates.length + 3}"><div class="empty">Нет учеников в выбранной группе</div></td></tr>`
            }
          </tbody>
        </table>
      </div>
    </article>
  `;
}

function attendanceDates(studentIds = visibleStudentIds()) {
  const dates = [
    ...new Set(
      visibleAttendance()
        .filter((item) => studentIds.has(Number(item.studentId)))
        .map((item) => item.date),
    ),
  ].sort();
  return dates.length ? dates : [new Date().toISOString().slice(0, 10)];
}

function attendanceCell(studentId, date, records) {
  const record = records.find((item) => Number(item.studentId) === Number(studentId) && item.date === date);
  if (!record) {
    return `<td><button class="mark missed" data-toggle-attendance="${studentId}:${date}" title="Поставить был" type="button">-</button></td>`;
  }
  const mark = record.status === "present" ? "Б" : "Н";
  return `<td><button class="mark ${record.status}" data-toggle-attendance="${studentId}:${date}" title="${record.topic}" type="button">${mark}</button><small>${record.topic}</small></td>`;
}

function renderPayments() {
  if (!isAdmin()) return `<div class="empty">Абонементы доступны только администратору.</div>`;
  const total = state.payments.reduce((sum, payment) => sum + payment.amount, 0);
  return `
    <div class="stats-grid">
      ${stat("Начислено", formatMoney(total), "все абонементы")}
      ${stat("Оплачено", state.payments.filter((p) => p.status === "paid").length, "закрытые счета")}
      ${stat("Скоро оплата", state.payments.filter((p) => p.status === "soon").length, "напомнить")}
      ${stat("Просрочено", state.payments.filter((p) => p.status === "overdue").length, "связаться")}
    </div>
    <article class="card">
      <div class="card-header">
        <h3>Абонементы и оплаты</h3>
        <div class="filters">
          <button class="button ghost" data-export-payments type="button">Экспорт CSV</button>
          <button class="button primary" data-add-payment type="button">+ Оплата</button>
        </div>
      </div>
      <div class="card-body list">
        ${state.payments.map((payment) => paymentRow(payment)).join("")}
      </div>
    </article>
  `;
}

function paymentRow(payment) {
  const student = byId(payment.studentId);
  return `
    <div class="list-row">
      <div>
        <strong>${student?.name ?? "Удаленный ученик"}</strong>
        <small>${payment.plan} · ${formatDate(payment.date)}</small>
      </div>
      <div>
        <strong>${formatMoney(payment.amount)}</strong>
        <span class="badge ${payment.status}">${statusText[payment.status]}</span>
      </div>
    </div>`;
}

function renderFeedback() {
  const notes = visibleFeedback();
  return `
    <div class="toolbar">
      <button class="button primary" data-add-feedback type="button">+ Фидбек</button>
      <span class="badge neutral">${notes.length} заметок</span>
    </div>
    <div class="kanban">
      ${filteredStudents()
        .map((student) => {
          const studentNotes = notes.filter((note) => note.studentId === student.id);
          return `
            <section class="lane">
              <h3>${student.name}</h3>
              <div class="list">
                ${
                  studentNotes
                    .map(
                      (note) => `
                        <article class="feedback-note">
                          <strong>${note.skill}</strong>
                          <small>${note.mentor} · ${formatDate(note.date)}</small>
                          <p>${note.text}</p>
                        </article>`,
                    )
                    .join("") || `<div class="empty">Пока нет фидбека</div>`
                }
              </div>
            </section>`;
        })
        .join("")}
    </div>
  `;
}

function visibleTasks() {
  if (isAdmin()) return state.tasks || [];
  return (state.tasks || []).filter((task) => task.assignee === currentUser?.name || task.createdBy === currentUser?.name);
}

function renderTasks() {
  const tasks = visibleTasks();
  const lanes = [
    ["todo", "Новые"],
    ["progress", "В работе"],
    ["done", "Готово"],
  ];
  return `
    <div class="toolbar">
      <button class="button primary" data-add-task type="button">+ Задача</button>
      <span class="badge neutral">${isAdmin() ? "вся команда" : "мои задачи"}</span>
    </div>
    <div class="task-board">
      ${lanes
        .map(([status, title]) => {
          const laneTasks = tasks.filter((task) => task.status === status);
          return `
            <section class="task-lane">
              <div class="task-lane-head">
                <h3>${title}</h3>
                <span class="badge neutral">${laneTasks.length}</span>
              </div>
              <div class="list">
                ${
                  laneTasks
                    .map(
                      (task) => `
                        <article class="team-task">
                          <div class="task-topline">
                            <span class="badge ${task.priority}">${taskPriorityText(task.priority)}</span>
                            <small>${task.dueDate ? formatDate(task.dueDate) : "без дедлайна"}</small>
                          </div>
                          <strong>${task.title}</strong>
                          <p>${task.description || "Описание не добавлено"}</p>
                          <div class="task-footer">
                            <small>Ответственный: ${task.assignee || "не назначен"}</small>
                            <div class="task-actions">
                              <select data-task-status="${task.id}">
                                <option value="todo" ${task.status === "todo" ? "selected" : ""}>Новые</option>
                                <option value="progress" ${task.status === "progress" ? "selected" : ""}>В работе</option>
                                <option value="done" ${task.status === "done" ? "selected" : ""}>Готово</option>
                              </select>
                              <button class="button danger compact" data-delete-task="${task.id}" type="button">Удалить</button>
                            </div>
                          </div>
                        </article>`,
                    )
                    .join("") || `<div class="empty">Пусто</div>`
                }
              </div>
            </section>`;
        })
        .join("")}
    </div>
  `;
}

function taskPriorityText(priority) {
  return {
    active: "Низкий",
    soon: "Средний",
    overdue: "Высокий",
  }[priority] || "Средний";
}

function renderTeam() {
  const users = isAdmin() ? state.users : [currentUser];
  const mentors = users.filter((user) => user.role === "mentor");
  return `
    ${
      isAdmin()
        ? `<div class="toolbar">
            <button class="button primary" data-add-user type="button">+ Аккаунт</button>
            <span class="badge neutral">регистрация только через админа</span>
          </div>`
        : ""
    }
    <div class="team-grid">
      ${users
        .map(
          (user) => {
            const count = user.role === "admin" ? state.students.length : state.students.filter((student) => user.groups.includes(student.group)).length;
            return `
              <article class="card profile">
                <div class="avatar">${user.name.split(" ").map((part) => part[0]).join("")}</div>
                <h3>${user.name}</h3>
                <p>${user.role === "admin" ? "Администратор" : "Ментор"}</p>
                <div class="mini-metrics">
                  <span><strong>${user.role === "admin" ? "Все" : user.groups.length}</strong>группы</span>
                  <span><strong>${count}</strong>учеников</span>
                  <span><strong>${user.email}</strong>email</span>
                  <span><strong>${user.role}</strong>доступ</span>
                </div>
                ${isAdmin() && user.id !== currentUser.id ? `<button class="button danger compact profile-delete" data-delete-user="${user.id}" type="button">Удалить аккаунт</button>` : ""}
              </article>`;
          },
        )
        .join("")}
    </div>
    <article class="card">
      <div class="card-header"><h3>Логика доступа</h3><span class="badge neutral">${isAdmin() ? "Админ" : "Ментор"}</span></div>
      <div class="card-body list">
        <div class="list-row"><strong>Админ</strong><small>Все ученики, группы, оплаты, табели, аккаунты и фидбек.</small></div>
        <div class="list-row"><strong>Ментор</strong><small>Только свои группы, отметки посещаемости, ученики и фидбек.</small></div>
      </div>
    </article>
    ${mentors.map((mentor) => mentorGamificationCard(mentor)).join("") || `<div class="empty">Создайте аккаунт ментора, чтобы включить геймификацию</div>`}
  `;
}

function mentorGamificationCard(mentor) {
  const quality = mentorQualityStats(mentor);
  const adjustments = (state.xpAdjustments || []).filter((item) => item.mentor === mentor.name).slice(0, 3);
  return `
    <article class="card">
      <div class="card-header">
        <h3>${mentor.name} · личная проверка уроков</h3>
        <div class="filters">
          <button class="button primary" data-add-lesson-check="${mentor.name}" type="button">+ Проверить урок</button>
          ${isAdmin() ? `<button class="button secondary" data-adjust-xp="${mentor.name}" type="button">XP + / -</button>` : ""}
        </div>
      </div>
      <div class="quality-layout">
        <div class="mentor-level">
          <span>Личный ранг</span>
          <strong>${quality.rank.title}</strong>
          <div class="level-ring" style="--score:${quality.avg}%">${quality.avg}</div>
          <small>${quality.xp} XP · ручной XP ${quality.manualXp >= 0 ? "+" : ""}${quality.manualXp}</small>
          <small>Серия ${quality.streak} дней · ${quality.next}</small>
        </div>
        <div class="lesson-checklist">
          ${lessonCriterion("Цель и результат", "Ученик понимает, что создаёт и как выглядит успех.")}
          ${lessonCriterion("Практика и темп", "Большая часть занятия уходит на сборку, код и эксперименты.")}
          ${lessonCriterion("Вопросы и диагностика", "Ментор проверяет понимание, а не просто показывает решение.")}
          ${lessonCriterion("Дисциплина и безопасность", "Рабочее место, инструменты и поведение под контролем.")}
          ${lessonCriterion("Индивидуальный прогресс", "Есть следующий шаг для каждого ученика.")}
          ${lessonCriterion("Фидбек и CRM", "После урока заполнены отметки и комментарии.")}
        </div>
      </div>
      <div class="gamification-grid">
        <section>
          <h4>Ежедневные задания</h4>
          <div class="mission-list">${quality.tasks.map((task) => missionRow(task)).join("")}</div>
        </section>
        <section>
          <h4>Достижения</h4>
          <div class="achievement-list">${quality.achievements.map((item) => achievementRow(item)).join("")}</div>
        </section>
      </div>
      <div class="card-body list">
        ${
          quality.checks
            .slice(0, 6)
            .map(
              (check) => `
                <div class="list-row">
                  <div>
                    <strong>${check.group}</strong>
                    <small>${formatDate(check.date)} · ${check.comment || "без комментария"}</small>
                  </div>
                  <span class="badge ${check.score >= 80 ? "active" : check.score >= 60 ? "soon" : "overdue"}">${check.score} баллов</span>
                </div>`,
            )
            .join("") || `<div class="empty">Пока нет личных проверок уроков</div>`
        }
        ${
          adjustments.length
            ? `<div class="xp-history">
                <strong>Ручные изменения XP</strong>
                ${adjustments
                  .map(
                    (item) => `
                      <div>
                        <span class="${item.amount >= 0 ? "xp-plus" : "xp-minus"}">${item.amount >= 0 ? "+" : ""}${item.amount} XP</span>
                        <small>${formatDate(item.date)} · ${item.reason}</small>
                      </div>`,
                  )
                  .join("")}
              </div>`
            : ""
        }
      </div>
    </article>`;
}

function lessonCriterion(title, text) {
  return `
    <div class="criterion">
      <strong>${title}</strong>
      <small>${text}</small>
    </div>`;
}

function missionRow(task) {
  return `
    <div class="mission ${task.done ? "done" : ""}">
      <span>${task.done ? "✓" : "•"}</span>
      <div>
        <strong>${task.title}</strong>
        <small>${task.hint}</small>
      </div>
    </div>`;
}

function achievementRow(item) {
  return `
    <div class="achievement ${item.unlocked ? "unlocked" : ""}">
      <span>${item.unlocked ? "★" : "☆"}</span>
      <div>
        <strong>${item.title}</strong>
        <small>${item.hint}</small>
      </div>
    </div>`;
}

function scheduleCells() {
  const days = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
  const lessons = visibleSchedule();
  return days
    .map((day) => {
      const dayLessons = lessons.filter((lesson) => lesson.day === day);
      return `
        <div class="day-cell">
          <strong>${day}</strong>
          ${
            dayLessons.length
              ? dayLessons.map((lesson) => `<span class="lesson-pill">${lesson.group} ${lesson.time}</span>`).join("")
              : `<small>Выходной</small>`
          }
        </div>`;
    })
    .join("");
}

function bindViewActions() {
  document.querySelectorAll("[data-view-jump]").forEach((button) => {
    button.addEventListener("click", () => setView(button.dataset.viewJump));
  });
  document.querySelectorAll("[data-open-student]").forEach((button) => {
    button.addEventListener("click", () => openStudentProfile(Number(button.dataset.openStudent)));
  });
  document.querySelectorAll("[data-delete-student]").forEach((button) => {
    button.addEventListener("click", () => deleteStudent(Number(button.dataset.deleteStudent)));
  });
  document.querySelectorAll("[data-delete-user]").forEach((button) => {
    button.addEventListener("click", () => deleteUser(Number(button.dataset.deleteUser)));
  });
  document.querySelectorAll("[data-delete-task]").forEach((button) => {
    button.addEventListener("click", () => deleteTask(Number(button.dataset.deleteTask)));
  });
  document.querySelectorAll("[data-toggle-attendance]").forEach((button) => {
    button.addEventListener("click", () => toggleAttendance(button.dataset.toggleAttendance));
  });
  document.querySelector("[data-add-student]")?.addEventListener("click", openStudentModal);
  document.querySelector("[data-add-user]")?.addEventListener("click", openUserModal);
  document.querySelector("[data-add-task]")?.addEventListener("click", openTaskModal);
  document.querySelectorAll("[data-task-status]").forEach((select) => {
    select.addEventListener("change", () => updateTaskStatus(Number(select.dataset.taskStatus), select.value));
  });
  document.querySelectorAll("[data-add-lesson-check]").forEach((button) => {
    button.addEventListener("click", () => openLessonCheckModal(button.dataset.addLessonCheck || ""));
  });
  document.querySelectorAll("[data-adjust-xp]").forEach((button) => {
    button.addEventListener("click", () => openXpModal(button.dataset.adjustXp));
  });
  document.querySelector("[data-add-attendance]")?.addEventListener("click", openAttendanceModal);
  document.querySelector("[data-add-payment]")?.addEventListener("click", () => openPaymentModal());
  document.querySelector("[data-add-feedback]")?.addEventListener("click", () => openFeedbackModal());
  document.querySelector("[data-export-attendance]")?.addEventListener("click", exportAttendanceCsv);
  document.querySelector("[data-export-payments]")?.addEventListener("click", exportPaymentsCsv);
  document.querySelector("#attendanceGroupFilter")?.addEventListener("change", (event) => {
    attendanceGroup = event.target.value;
    render();
  });
  document.querySelector("[data-reset-demo]")?.addEventListener("click", () => {
    state = structuredClone(seed);
    saveState();
    localStorage.setItem(SESSION_KEY, String(seed.users[0].id));
    currentUser = state.users[0];
    renderShell();
  });
}

async function toggleAttendance(payload) {
  const [studentId, date] = payload.split(":");
  const student = visibleStudents().find((item) => Number(item.id) === Number(studentId));
  if (!student) return;
  if (backendEnabled) {
    await apiRequest("toggle_attendance", { studentId: Number(studentId), date });
    await refreshData();
    return;
  }
  const record = state.attendance.find((item) => Number(item.studentId) === Number(studentId) && item.date === date);
  if (!record) {
    state.attendance.unshift({
      id: Date.now(),
      studentId: Number(studentId),
      date,
      status: "present",
      topic: "Быстрая отметка",
    });
  } else if (record.status === "present") {
    record.status = "absent";
  } else {
    state.attendance = state.attendance.filter((item) => item.id !== record.id);
  }
  saveState();
  render();
}

function openStudentProfile(studentId) {
  const student = visibleStudents().find((item) => Number(item.id) === Number(studentId));
  if (!student) return;
  const attendance = visibleAttendance().filter((item) => Number(item.studentId) === Number(studentId));
  const feedback = visibleFeedback().filter((item) => Number(item.studentId) === Number(studentId));
  const payments = isAdmin() ? state.payments.filter((item) => Number(item.studentId) === Number(studentId)) : [];
  const present = attendance.filter((item) => item.status === "present").length;
  openModal(
    student.name,
    `<div class="profile-modal">
      <div class="profile-summary">
        ${stat("Группа", student.group, student.course)}
        ${stat("Посещаемость", `${present}/${attendance.length || 0}`, "по отметкам")}
        ${stat("Прогресс", `${student.progress}%`, "текущий уровень")}
        ${stat("Занятий", student.lessonsLeft, "осталось")}
      </div>
      <div class="module-grid profile-sections">
        <section class="card">
          <div class="card-header"><h3>Контакты</h3><span class="badge ${student.status}">${statusText[student.status]}</span></div>
          <div class="card-body list">
            <div class="list-row"><strong>Родитель</strong><small>${student.parent}</small></div>
            <div class="list-row"><strong>Телефон</strong><small>${student.phone}</small></div>
            <div class="list-row"><strong>Ментор</strong><small>${student.mentor}</small></div>
            ${isAdmin() ? `<button class="button secondary" data-quick-payment="${student.id}" type="button">Добавить оплату</button>` : ""}
          </div>
        </section>
        <section class="card">
          <div class="card-header"><h3>Фидбек</h3><button class="button secondary" data-quick-feedback="${student.id}" type="button">Добавить</button></div>
          <div class="card-body list">
            ${
              feedback
                .map((note) => `<div class="feedback-note"><strong>${note.skill}</strong><small>${note.mentor} · ${formatDate(note.date)}</small><p>${note.text}</p></div>`)
                .join("") || `<div class="empty">Пока нет заметок</div>`
            }
          </div>
        </section>
      </div>
      ${
        isAdmin()
          ? `<section class="card">
              <div class="card-header"><h3>Оплаты</h3><span class="badge neutral">${payments.length}</span></div>
              <div class="card-body list">${payments.map((payment) => paymentRow(payment)).join("") || `<div class="empty">Нет оплат</div>`}</div>
            </section>`
          : ""
      }
    </div>`,
  );
  modalRoot.querySelector("[data-quick-feedback]")?.addEventListener("click", () => {
    closeModal();
    openFeedbackModal(student.id);
  });
  modalRoot.querySelector("[data-quick-payment]")?.addEventListener("click", () => {
    closeModal();
    openPaymentModal(student.id);
  });
}

function openModal(title, content) {
  modalRoot.hidden = false;
  modalRoot.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-label="${title}">
      <div class="modal-head">
        <h2>${title}</h2>
        <button class="button ghost" data-close-modal type="button">Закрыть</button>
      </div>
      ${content}
    </div>
  `;
  modalRoot.querySelectorAll("[data-close-modal]").forEach((button) => {
    button.addEventListener("click", closeModal);
  });
}

function closeModal() {
  modalRoot.hidden = true;
  modalRoot.innerHTML = "";
}

function openUserModal() {
  if (!isAdmin()) return;
  openModal(
    "Новый аккаунт",
    `<form class="modal-form" id="userForm">
      <label>Имя<input name="name" required placeholder="Имя и фамилия" /></label>
      <label>Email<input name="email" type="email" required placeholder="mentor@s7.kz" /></label>
      <label>Пароль<input name="password" type="password" required minlength="4" placeholder="Временный пароль" /></label>
      <label>Роль<select name="role"><option value="mentor">Ментор</option><option value="admin">Админ</option></select></label>
      <label style="grid-column:1/-1">Группы ментора<input name="groups" placeholder="A1, B2, Senior" /></label>
      <div class="form-actions">
        <button class="button ghost" data-close-modal type="button">Отмена</button>
        <button class="button primary" type="submit">Создать</button>
      </div>
    </form>`,
  );
  modalRoot.querySelector("#userForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(event.currentTarget).entries());
    const email = form.email.trim().toLowerCase();
    if (state.users.some((user) => user.email.toLowerCase() === email)) {
      modalRoot.querySelector("#userForm").insertAdjacentHTML(
        "afterbegin",
        `<div class="form-alert">Такой email уже есть.</div>`,
      );
      return;
    }
    const user = {
      id: Date.now(),
      name: form.name.trim(),
      email,
      password: form.password,
      role: form.role,
      groups: form.role === "admin" ? [] : form.groups.split(",").map((group) => group.trim()).filter(Boolean),
    };
    if (backendEnabled) {
      await apiRequest("create_user", user);
      closeModal();
      await refreshData();
      return;
    }
    state.users.push(user);
    saveState();
    closeModal();
    render();
  });
}

function openTaskModal() {
  const users = isAdmin() ? state.users : [currentUser];
  const assigneeOptions = users.map((user) => `<option>${user.name}</option>`).join("");
  openModal(
    "Новая задача",
    `<form class="modal-form" id="taskForm">
      <label>Название<input name="title" required placeholder="Например, подготовить набор Arduino" /></label>
      <label>Ответственный<select name="assignee">${assigneeOptions}</select></label>
      <label>Приоритет<select name="priority"><option value="soon">Средний</option><option value="overdue">Высокий</option><option value="active">Низкий</option></select></label>
      <label>Дедлайн<input name="dueDate" type="date" /></label>
      <label style="grid-column:1/-1">Описание<textarea name="description" placeholder="Что нужно сделать, где, для какой группы"></textarea></label>
      <div class="form-actions">
        <button class="button ghost" data-close-modal type="button">Отмена</button>
        <button class="button primary" type="submit">Создать</button>
      </div>
    </form>`,
  );
  modalRoot.querySelector("#taskForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(event.currentTarget).entries());
    const task = {
      id: Date.now(),
      title: form.title,
      assignee: form.assignee,
      priority: form.priority,
      dueDate: form.dueDate,
      description: form.description,
      status: "todo",
      createdBy: currentUser.name,
    };
    if (backendEnabled) {
      await apiRequest("create_task", task);
      closeModal();
      await refreshData();
      return;
    }
    state.tasks.unshift(task);
    saveState();
    closeModal();
    render();
  });
}

async function updateTaskStatus(taskId, status) {
  if (backendEnabled) {
    await apiRequest("update_task_status", { id: taskId, status });
    await refreshData();
    return;
  }
  const task = state.tasks.find((item) => Number(item.id) === Number(taskId));
  if (!task) return;
  task.status = status;
  saveState();
  render();
}

async function deleteTask(taskId) {
  const task = state.tasks.find((item) => Number(item.id) === Number(taskId));
  if (!task || !confirm(`Удалить задачу "${task.title}"?`)) return;
  if (backendEnabled) {
    await apiRequest("delete_task", { id: taskId });
    await refreshData();
    return;
  }
  state.tasks = state.tasks.filter((item) => Number(item.id) !== Number(taskId));
  saveState();
  render();
}

async function deleteStudent(studentId) {
  if (!isAdmin()) return;
  const student = state.students.find((item) => Number(item.id) === Number(studentId));
  if (!student || !confirm(`Удалить ученика "${student.name}" и связанные данные?`)) return;
  if (backendEnabled) {
    await apiRequest("delete_student", { id: studentId });
    await refreshData();
    return;
  }
  state.students = state.students.filter((item) => Number(item.id) !== Number(studentId));
  state.payments = state.payments.filter((item) => Number(item.studentId) !== Number(studentId));
  state.attendance = state.attendance.filter((item) => Number(item.studentId) !== Number(studentId));
  state.feedback = state.feedback.filter((item) => Number(item.studentId) !== Number(studentId));
  saveState();
  render();
}

async function deleteUser(userId) {
  if (!isAdmin() || Number(userId) === Number(currentUser.id)) return;
  const user = state.users.find((item) => Number(item.id) === Number(userId));
  if (!user || !confirm(`Удалить аккаунт "${user.name}"?`)) return;
  if (backendEnabled) {
    await apiRequest("delete_user", { id: userId });
    await refreshData();
    return;
  }
  state.users = state.users.filter((item) => Number(item.id) !== Number(userId));
  saveState();
  render();
}

function openLessonCheckModal(selectedMentor = "") {
  const mentorOptions = (isAdmin() ? state.users.filter((user) => user.role === "mentor") : [currentUser])
    .map((user) => `<option ${user.name === selectedMentor ? "selected" : ""}>${user.name}</option>`)
    .join("");
  openModal(
    "Проверка урока",
    `<form class="modal-form" id="lessonCheckForm">
      <label>Ментор<select name="mentor">${mentorOptions || `<option>${currentUser.name}</option>`}</select></label>
      <label>Группа<input name="group" required placeholder="A1, 15 мкр, NIS" /></label>
      <label>Дата<input name="date" type="date" required value="${new Date().toISOString().slice(0, 10)}" /></label>
      ${qualitySelect("goal", "Цель урока", 10)}
      ${qualitySelect("demo", "Демо и объяснение", 10)}
      ${qualitySelect("practice", "Практика 70%", 15)}
      ${qualitySelect("individual", "Индивидуальный подход", 10)}
      ${qualitySelect("questions", "Вопросы ученикам", 10)}
      ${qualitySelect("debug", "Разбор ошибок", 10)}
      ${qualitySelect("discipline", "Дисциплина группы", 10)}
      ${qualitySelect("safety", "Безопасность", 10)}
      ${qualitySelect("feedback", "Фидбек после урока", 10)}
      ${qualitySelect("crm", "CRM заполнена", 5)}
      <label style="grid-column:1/-1">Комментарий<textarea name="comment" placeholder="Что улучшить на следующем уроке"></textarea></label>
      <div class="form-actions">
        <button class="button ghost" data-close-modal type="button">Отмена</button>
        <button class="button primary" type="submit">Сохранить</button>
      </div>
    </form>`,
  );
  modalRoot.querySelector("#lessonCheckForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(event.currentTarget).entries());
    const score = lessonQualityCriteria().reduce(
      (sum, key) => sum + Number(form[key] || 0),
      0,
    );
    const check = {
      id: Date.now(),
      mentor: form.mentor,
      group: form.group,
      date: form.date,
      score,
      comment: form.comment,
    };
    if (backendEnabled) {
      await apiRequest("create_lesson_check", check);
      closeModal();
      await refreshData();
      return;
    }
    state.lessonChecks.unshift(check);
    saveState();
    closeModal();
    render();
  });
}

function openXpModal(selectedMentor) {
  if (!isAdmin()) return;
  const mentorOptions = state.users
    .filter((user) => user.role === "mentor")
    .map((user) => `<option ${user.name === selectedMentor ? "selected" : ""}>${user.name}</option>`)
    .join("");
  openModal(
    "Изменить XP ментора",
    `<form class="modal-form" id="xpForm">
      <label>Ментор<select name="mentor">${mentorOptions}</select></label>
      <label>XP<input name="amount" type="number" required placeholder="Например, 50 или -20" /></label>
      <label style="grid-column:1/-1">Причина<textarea name="reason" required placeholder="За что добавляем или убавляем XP"></textarea></label>
      <div class="form-actions">
        <button class="button ghost" data-close-modal type="button">Отмена</button>
        <button class="button primary" type="submit">Сохранить</button>
      </div>
    </form>`,
  );
  modalRoot.querySelector("#xpForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(event.currentTarget).entries());
    const adjustment = {
      id: Date.now(),
      mentor: form.mentor,
      amount: Number(form.amount),
      reason: form.reason,
      date: new Date().toISOString().slice(0, 10),
      createdBy: currentUser.name,
    };
    if (backendEnabled) {
      await apiRequest("adjust_xp", adjustment);
      closeModal();
      await refreshData();
      return;
    }
    state.xpAdjustments.unshift(adjustment);
    saveState();
    closeModal();
    render();
  });
}

function lessonQualityCriteria() {
  return ["goal", "demo", "practice", "individual", "questions", "debug", "discipline", "safety", "feedback", "crm"];
}

function qualitySelect(name, label, weight) {
  const half = Math.round(weight / 2);
  return `
    <label>${label} · ${weight}
      <select name="${name}">
        <option value="${weight}">Отлично</option>
        <option value="${half}">Частично</option>
        <option value="0">Нет</option>
      </select>
    </label>`;
}

function openStudentModal() {
  if (!isAdmin()) return;
  const template = document.querySelector("#studentFormTemplate").content.cloneNode(true);
  const wrapper = document.createElement("div");
  wrapper.append(template);
  openModal("Новый ученик", wrapper.innerHTML);
  const mentorSelect = modalRoot.querySelector("#mentorSelect");
  mentorSelect.innerHTML = state.users
    .filter((user) => user.role === "mentor")
    .map((user) => `<option>${user.name}</option>`)
    .join("");
  modalRoot.querySelector("#studentForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const student = Object.fromEntries(form.entries());
    const payload = {
      ...student,
      lessonsLeft: Number(student.lessonsLeft),
      progress: 10,
      nextPayment: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString().slice(0, 10),
    };
    if (backendEnabled) {
      await apiRequest("create_student", payload);
      closeModal();
      await refreshData();
      return;
    }
    state.students.unshift({
      ...payload,
      id: Date.now(),
    });
    saveState();
    closeModal();
    render();
  });
}

function openAttendanceModal() {
  openModal(
    "Новая отметка",
    `<form class="modal-form" id="attendanceForm">
      ${studentSelectField()}
      <label>Дата<input name="date" type="date" required value="${new Date().toISOString().slice(0, 10)}" /></label>
      <label>Статус<select name="status"><option value="present">Был</option><option value="absent">Не был</option></select></label>
      <label>Тема урока<input name="topic" required placeholder="Например, моторы и датчики" /></label>
      <div class="form-actions"><button class="button ghost" data-close-modal type="button">Отмена</button><button class="button primary" type="submit">Сохранить</button></div>
    </form>`,
  );
  modalRoot.querySelector("#attendanceForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const item = Object.fromEntries(new FormData(event.currentTarget).entries());
    if (backendEnabled) {
      await apiRequest("create_attendance", item);
      closeModal();
      await refreshData();
      return;
    }
    state.attendance.unshift({ ...item, id: Date.now(), studentId: Number(item.studentId) });
    saveState();
    closeModal();
    render();
  });
}

function openPaymentModal(selectedStudentId = null) {
  if (!isAdmin()) return;
  openModal(
    "Новая оплата",
    `<form class="modal-form" id="paymentForm">
      ${studentSelectField(state.students, selectedStudentId)}
      <label>Абонемент<select name="plan"><option>8 занятий</option><option>12 занятий</option><option>Пробный блок</option></select></label>
      <label>Сумма<input name="amount" type="number" required value="52000" /></label>
      <label>Дата<input name="date" type="date" required value="${new Date().toISOString().slice(0, 10)}" /></label>
      <label>Статус<select name="status"><option value="paid">Оплачен</option><option value="soon">Скоро</option><option value="overdue">Просрочен</option></select></label>
      <div class="form-actions"><button class="button ghost" data-close-modal type="button">Отмена</button><button class="button primary" type="submit">Сохранить</button></div>
    </form>`,
  );
  modalRoot.querySelector("#paymentForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const payment = Object.fromEntries(new FormData(event.currentTarget).entries());
    const payload = {
      ...payment,
      studentId: Number(payment.studentId),
      amount: Number(payment.amount),
    };
    if (backendEnabled) {
      await apiRequest("create_payment", payload);
      closeModal();
      await refreshData();
      return;
    }
    state.payments.unshift({
      ...payload,
      id: Date.now(),
    });
    saveState();
    closeModal();
    render();
  });
}

function openFeedbackModal(selectedStudentId = null) {
  openModal(
    "Фидбек ученику",
    `<form class="modal-form" id="feedbackForm">
      ${studentSelectField(visibleStudents(), selectedStudentId)}
      <label>Навык<input name="skill" required placeholder="Код, сборка, командная работа" /></label>
      <label>Ментор<input name="mentor" required value="${currentUser.name}" ${isAdmin() ? "" : "readonly"} /></label>
      <label>Дата<input name="date" type="date" required value="${new Date().toISOString().slice(0, 10)}" /></label>
      <label style="grid-column:1/-1">Комментарий<textarea name="text" required placeholder="Что получилось, что улучшить, следующий шаг"></textarea></label>
      <div class="form-actions"><button class="button ghost" data-close-modal type="button">Отмена</button><button class="button primary" type="submit">Сохранить</button></div>
    </form>`,
  );
  modalRoot.querySelector("#feedbackForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const note = Object.fromEntries(new FormData(event.currentTarget).entries());
    if (backendEnabled) {
      await apiRequest("create_feedback", note);
      closeModal();
      await refreshData();
      return;
    }
    state.feedback.unshift({ ...note, id: Date.now(), studentId: Number(note.studentId) });
    saveState();
    closeModal();
    render();
  });
}

function studentSelectField(students = visibleStudents(), selectedStudentId = null) {
  return `<label>Ученик<select name="studentId">${students
    .map((student) => `<option value="${student.id}" ${Number(selectedStudentId) === Number(student.id) ? "selected" : ""}>${student.name} · ${student.group}</option>`)
    .join("")}</select></label>`;
}

function exportAttendanceCsv() {
  const rows = [["Ученик", "Группа", "Дата", "Статус", "Тема", "Ментор"]];
  visibleAttendance().forEach((item) => {
    const student = byId(item.studentId);
    rows.push([
      student?.name ?? "",
      student?.group ?? "",
      item.date,
      statusText[item.status],
      item.topic,
      student?.mentor ?? "",
    ]);
  });
  downloadCsv("s7-attendance.csv", rows);
}

function exportPaymentsCsv() {
  if (!isAdmin()) return;
  const rows = [["Ученик", "Группа", "Абонемент", "Сумма", "Дата", "Статус"]];
  state.payments.forEach((payment) => {
    const student = byId(payment.studentId);
    rows.push([
      student?.name ?? "",
      student?.group ?? "",
      payment.plan,
      payment.amount,
      payment.date,
      statusText[payment.status],
    ]);
  });
  downloadCsv("s7-payments.csv", rows);
}

function downloadCsv(filename, rows) {
  const csv = rows.map((row) => row.map(csvValue).join(",")).join("\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function csvValue(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function showAuthError(message) {
  authError.textContent = message;
}

document.querySelectorAll("[data-auth-tab]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll("[data-auth-tab]").forEach((item) => item.classList.toggle("active", item === button));
    document.querySelector("#loginForm").hidden = button.dataset.authTab !== "login";
    document.querySelector("#registerForm").hidden = button.dataset.authTab !== "register";
    showAuthError("");
  });
});

document.querySelector("#loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = Object.fromEntries(new FormData(event.currentTarget).entries());
  if (backendEnabled) {
    try {
      const data = await apiRequest("login", form);
      showAuthError("");
      applyAuthResponse(data);
    } catch (error) {
      showAuthError(error.message);
    }
    return;
  }
  const user = state.users.find(
    (item) => item.email.toLowerCase() === form.email.toLowerCase() && item.password === form.password,
  );
  if (!user) {
    showAuthError("Неверный email или пароль.");
    return;
  }
  showAuthError("");
  setSession(user);
});

document.querySelector("#registerForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = Object.fromEntries(new FormData(event.currentTarget).entries());
  if (backendEnabled) {
    try {
      const data = await apiRequest("register_first_admin", form);
      showAuthError("");
      applyAuthResponse(data);
    } catch (error) {
      showAuthError(error.message);
    }
    return;
  }
  if (state.users.length > 0) {
    showAuthError("Публичная регистрация закрыта. Аккаунты создает администратор внутри CRM.");
    updateAuthMode();
    return;
  }
  if (state.users.some((user) => user.email.toLowerCase() === form.email.toLowerCase())) {
    showAuthError("Такой email уже зарегистрирован.");
    return;
  }
  const firstUser = state.users.length === 0;
  if (!firstUser && form.role === "admin") {
    showAuthError("Нового админа можно добавить только из настоящей серверной админ-панели. Сейчас создайте ментора.");
    return;
  }
  const user = {
    id: Date.now(),
    name: form.name,
    email: form.email,
    password: form.password,
    role: firstUser ? "admin" : form.role,
    groups: firstUser || form.role === "admin" ? [] : form.groups.split(",").map((group) => group.trim()).filter(Boolean),
  };
  state.users.push(user);
  saveState();
  showAuthError("");
  setSession(user);
});

document.querySelectorAll(".nav-item").forEach((button) => {
  button.addEventListener("click", () => setView(button.dataset.view));
});

globalSearch.addEventListener("input", (event) => {
  searchTerm = event.target.value;
  if (activeView !== "students") setView("students");
  else render();
});

logoutButton.addEventListener("click", logout);

modalRoot.addEventListener("click", (event) => {
  if (event.target === modalRoot) closeModal();
});

async function initApp() {
  try {
    const status = await apiRequest("status");
    state.users = status.hasUsers ? [{ id: 0, name: "server", role: "admin", groups: [] }] : [];
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) {
      try {
        await refreshData();
        return;
      } catch {
        localStorage.removeItem(TOKEN_KEY);
      }
    }
  } catch {
    backendEnabled = false;
    currentUser = getLocalSessionUser();
  }
  saveState();
  renderShell();
}

function getLocalSessionUser() {
  const id = Number(localStorage.getItem(SESSION_KEY));
  if (!id) return null;
  return state?.users?.find((user) => user.id === id) || null;
}

initApp();
