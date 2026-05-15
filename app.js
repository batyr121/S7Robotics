const STORAGE_KEY = "s7robotics-crm-v3";
const SESSION_KEY = "s7robotics-session-v1";
const API_URL = "api/index.php";
const TOKEN_KEY = "s7robotics-api-token";
const LESSON_SESSION_KEY = "s7robotics-active-lesson-v1";
const LESSON_DURATION_MINUTES = 90;
const SEASON_LEVEL_XP = 1000;
const SEASON_REWARDS = [
  { level: 1, title: "Старт сезона", text: "цифровой бейдж ученика S7" },
  { level: 2, title: "5% скидка", text: "на следующий абонемент" },
  { level: 3, title: "3D принтер", text: "30 минут печати проекта" },
  { level: 4, title: "Проектный чек", text: "разбор идеи с ментором" },
  { level: 5, title: "Мастер-класс", text: "закрытый урок по роботам" },
  { level: 6, title: "S7 мерч", text: "наклейки и карточка инженера" },
  { level: 7, title: "10% скидка", text: "на абонемент или интенсив" },
  { level: 8, title: "3D печать+", text: "60 минут на принтере" },
  { level: 9, title: "Лаб-день", text: "доступ к оборудованию центра" },
  { level: 10, title: "Консультация", text: "с мастером по проекту" },
  { level: 11, title: "Семейный бонус", text: "приглашение на демо-день" },
  { level: 12, title: "Финал сезона", text: "15% скидка и витрина проекта" },
];

const seed = {
  users: [],
  students: [],
  payments: [],
  expenses: [],
  attendance: [],
  feedback: [],
  homework: [],
  photoReports: [],
  certificates: [],
  schedule: [],
  trialLessons: [],
  lessonChecks: [],
  tasks: [],
  xpAdjustments: [],
  salaries: [],
  methods: [],
  parentReviews: [],
  announcements: [],
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
const heroBand = document.querySelector(".hero-band");
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
let pendingParentQrScan = new URLSearchParams(window.location.search).get("scan") === "attendance";
let parentQrScanHandled = false;
let lessonTimerId = null;

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
  nextState.users = nextState.users.map((user) => ({ phone: "", ...user }));
  nextState.students = (nextState.students || []).map((student) => ({ subscriptionNumber: 1, ...student }));
  nextState.payments = nextState.payments || [];
  nextState.expenses = nextState.expenses || [];
  nextState.feedback = nextState.feedback || [];
  nextState.homework = nextState.homework || [];
  nextState.photoReports = nextState.photoReports || [];
  nextState.certificates = nextState.certificates || [];
  nextState.schedule = nextState.schedule || [];
  nextState.trialLessons = nextState.trialLessons || [];
  nextState.lessonChecks = nextState.lessonChecks || [];
  nextState.tasks = nextState.tasks || [];
  nextState.xpAdjustments = nextState.xpAdjustments || [];
  nextState.salaries = nextState.salaries || [];
  nextState.methods = nextState.methods || [];
  nextState.parentReviews = nextState.parentReviews || [];
  nextState.announcements = nextState.announcements || [];
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
  clearActiveLessonSession();
  currentUser = null;
  renderShell();
}

function isAdmin() {
  return currentUser?.role === "admin";
}

function isParent() {
  return currentUser?.role === "parent";
}

function canUse(view) {
  if (!currentUser) return false;
  if (isAdmin()) return true;
  if (isParent()) return ["dashboard", "students", "attendance", "schedule", "feedback", "parent"].includes(view);
  return ["dashboard", "students", "attendance", "schedule", "trials", "feedback", "tasks", "methods", "salary", "team"].includes(view);
}

function visibleStudents() {
  if (!currentUser) return [];
  if (isAdmin()) return state.students;
  if (isParent()) {
    const ids = new Set((currentUser.groups || []).map((id) => Number(id)));
    return state.students.filter((student) => ids.has(Number(student.id)));
  }
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

function visibleHomework() {
  const ids = visibleStudentIds();
  return (state.homework || []).filter((item) => ids.has(Number(item.studentId)));
}

function visiblePhotoReports() {
  const ids = visibleStudentIds();
  return (state.photoReports || []).filter((item) => ids.has(Number(item.studentId)));
}

function visibleCertificates() {
  const ids = visibleStudentIds();
  return (state.certificates || []).filter((item) => ids.has(Number(item.studentId)));
}

function visibleSchedule() {
  if (isAdmin()) return state.schedule;
  if (isParent()) {
    const groups = new Set(visibleStudents().map((student) => student.group));
    return state.schedule.filter((lesson) => groups.has(lesson.group));
  }
  const groups = new Set(currentUser?.groups || []);
  return state.schedule.filter((lesson) => groups.has(lesson.group) || lesson.mentor === currentUser?.name);
}

function visibleTrialLessons() {
  if (isAdmin()) return state.trialLessons || [];
  if (isParent()) return [];
  const groups = new Set(currentUser?.groups || []);
  return (state.trialLessons || []).filter((lesson) => groups.has(lesson.group) || lesson.mentor === currentUser?.name);
}

function visibleParentReviews() {
  const ids = visibleStudentIds();
  return (state.parentReviews || []).filter((review) => ids.has(Number(review.studentId)));
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

function studentPayments(studentId) {
  return (state.payments || [])
    .filter((payment) => Number(payment.studentId) === Number(studentId) && payment.status === "paid")
    .sort((a, b) => new Date(b.date) - new Date(a.date));
}

function paymentVisitCount(plan = "") {
  const match = String(plan).match(/\d+/);
  if (match) return Math.max(1, Number(match[0]));
  return String(plan).toLowerCase().includes("проб") ? 1 : 8;
}

function studentPaidLessonTotal(studentId) {
  return studentPayments(studentId).reduce((sum, payment) => sum + paymentVisitCount(payment.plan), 0);
}

function studentPresentAttendance(studentId) {
  return (state.attendance || [])
    .filter((item) => Number(item.studentId) === Number(studentId) && item.status === "present")
    .sort((a, b) => new Date(a.date) - new Date(b.date));
}

function studentAttendanceSince(studentId, startDate = null) {
  return (state.attendance || [])
    .filter((item) => Number(item.studentId) === Number(studentId))
    .filter((item) => !startDate || new Date(item.date) >= new Date(startDate))
    .sort((a, b) => new Date(a.date) - new Date(b.date));
}

function attendanceSubscriptionUsage(studentId, startDate = null) {
  const records = studentAttendanceSince(studentId, startDate);
  const present = records.filter((item) => item.status === "present").length;
  const absent = records.filter((item) => item.status === "absent").length;
  const billableAbsent = Math.max(0, absent - 2);
  return {
    present,
    absent,
    freeAbsent: Math.min(absent, 2),
    billableAbsent,
    used: present + billableAbsent,
    needsDirectorLetter: absent >= 3,
  };
}

function billableAttendanceRecords(studentId, startDate = null) {
  let absentCount = 0;
  return studentAttendanceSince(studentId, startDate).filter((record) => {
    if (record.status === "present") return true;
    if (record.status === "absent") {
      absentCount += 1;
      return absentCount > 2;
    }
    return false;
  });
}

function subscriptionStatus(student) {
  const payments = studentPayments(student.id);
  const lastPayment = payments[0];
  const firstPayment = payments.at(-1);
  const startDate = firstPayment?.date || student.nextPayment || null;
  const usage = attendanceSubscriptionUsage(student.id, startDate);
  const manualSubscription = Math.max(1, Number(student.subscriptionNumber || 1));
  const totalLessons = Math.max(8, studentPaidLessonTotal(student.id) || Number(student.lessonsLeft || 0) + usage.used);
  const used = Math.min(usage.used, totalLessons);
  const remaining = Math.max(0, totalLessons - used);
  const completedCycles = Math.floor(used / 8);
  const currentCycleUsed = used % 8;
  const currentSubscriptionNumber = manualSubscription + completedCycles;
  const totalProgressVisits = (manualSubscription - 1) * 8 + used;
  const nextPaymentDate = estimateNextPaymentDate(student, startDate, used, totalLessons);
  const needsPayment = remaining <= 1;
  const expired = remaining <= 0;
  return {
    startDate,
    totalLessons,
    used,
    currentCycleUsed,
    currentSubscriptionNumber,
    totalProgressVisits,
    remaining,
    visitLabel: `${currentCycleUsed}/8`,
    needsPayment,
    expired,
    nextPaymentDate,
    lastPayment,
    absent: usage.absent,
    freeAbsent: usage.freeAbsent,
    billableAbsent: usage.billableAbsent,
    needsDirectorLetter: usage.needsDirectorLetter,
  };
}

function syncStudentSubscription(studentId) {
  const student = byId(studentId);
  if (!student) return null;
  const sub = subscriptionStatus(student);
  student.lessonsLeft = sub.remaining;
  return sub;
}

function adminSubscriptionAlerts() {
  return visibleStudents().filter((student) => subscriptionStatus(student).needsPayment);
}

function estimateNextPaymentDate(student, startDate, used, totalLessons = 8) {
  if (!startDate) return student.nextPayment || "";
  const warningVisit = Math.max(1, totalLessons - 1);
  if (used >= warningVisit) {
    const records = studentAttendanceSince(student.id, startDate);
    let absentCount = 0;
    const billableRecords = records.filter((item) => {
      if (item.status === "present") return true;
      if (item.status !== "absent") return false;
      absentCount += 1;
      return absentCount > 2;
    });
    const paymentVisit = billableRecords[warningVisit - 1];
    if (paymentVisit) return paymentVisit.date;
  }
  const lessonDays = groupLessonDays(student.group);
  let count = 0;
  const cursor = new Date(startDate);
  for (let i = 0; i < 120; i += 1) {
    if (lessonDays.has(cursor.getDay())) {
      count += 1;
      if (count === warningVisit) return cursor.toISOString().slice(0, 10);
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return student.nextPayment || startDate;
}

function groupLessonDays(group) {
  const map = new Map([
    ["Вс", 0],
    ["Пн", 1],
    ["Вт", 2],
    ["Ср", 3],
    ["Чт", 4],
    ["Пт", 5],
    ["Сб", 6],
  ]);
  const days = new Set(
    (state.schedule || [])
      .filter((lesson) => lesson.group === group)
      .map((lesson) => map.get(lesson.day))
      .filter((day) => day !== undefined),
  );
  if (!days.size) {
    days.add(6);
    days.add(0);
  }
  return days;
}

function groupAnalytics() {
  return uniqueGroups().map((group) => {
    const students = visibleStudents().filter((student) => student.group === group);
    const risks = students.filter((student) => subscriptionStatus(student).needsPayment).length;
    const avgProgress = students.length
      ? Math.round(students.reduce((sum, student) => sum + Number(student.progress || 0), 0) / students.length)
      : 0;
    return { group, students: students.length, risks, avgProgress };
  });
}

function uniqueGroups() {
  return [...new Set(visibleStudents().map((student) => student.group))].sort();
}

function groupProgram(group) {
  return /(^|[\s-])b\s*\d*($|[\s-])|программа\s*b|program\s*b|senior|advanced/i.test(group || "") ? "B" : "A";
}

function groupCapacity(group) {
  return groupProgram(group) === "B" ? 9 : 7;
}

function groupOccupancy(group) {
  const students = state.students.filter((student) => student.group === group && student.status !== "pause").length;
  const trials = (state.trialLessons || []).filter((lesson) => lesson.group === group && ["scheduled", "confirmed"].includes(lesson.status)).length;
  return students + trials;
}

function nextDateForDay(day, from = new Date()) {
  const map = { Вс: 0, Пн: 1, Вт: 2, Ср: 3, Чт: 4, Пт: 5, Сб: 6 };
  const target = map[day] ?? from.getDay();
  const date = new Date(from);
  date.setHours(12, 0, 0, 0);
  const diff = (target - date.getDay() + 7) % 7;
  date.setDate(date.getDate() + diff);
  return date.toISOString().slice(0, 10);
}

function findTrialSlot(program = "A", fromDate = "") {
  const start = fromDate ? new Date(fromDate) : new Date();
  const options = (state.schedule || [])
    .filter((lesson) => groupProgram(lesson.group) === program)
    .map((lesson) => {
      const occupied = groupOccupancy(lesson.group);
      const capacity = groupCapacity(lesson.group);
      return {
        ...lesson,
        date: nextDateForDay(lesson.day, start),
        occupied,
        capacity,
        free: capacity - occupied,
      };
    })
    .filter((lesson) => lesson.free > 0)
    .sort((a, b) => new Date(a.date) - new Date(b.date) || b.free - a.free || a.time.localeCompare(b.time));
  return options[0] || null;
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
    .filter((student) => subscriptionStatus(student).needsPayment || student.lessonsLeft <= 2)
    .forEach((student) => {
      const sub = subscriptionStatus(student);
      tasks.push({
        title: `${student.name}: абонемент #${sub.currentSubscriptionNumber}`,
        hint: sub.expired ? "Абонемент закончился" : `Оплата на ${sub.nextPaymentDate ? formatDate(sub.nextPaymentDate) : "7 посещении"}`,
        view: isAdmin() ? "payments" : "students",
        tone: sub.expired ? "overdue" : "soon",
      });
    });
  students
    .filter((student) => subscriptionStatus(student).needsDirectorLetter)
    .forEach((student) => {
      const sub = subscriptionStatus(student);
      tasks.push({
        title: `${student.name}: ${sub.absent} НБ`,
        hint: "Родителю нужно направить письмо на имя директора",
        view: "attendance",
        tone: "overdue",
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
  const parentReviewXp = (state.parentReviews || [])
    .filter((review) => review.mentor === user?.name || userStudentIds.has(Number(review.studentId)))
    .reduce((sum, review) => sum + Number(review.bonusPoints || Number(review.rating || 0) * 10), 0);
  const manualXp = (state.xpAdjustments || [])
    .filter((item) => item.mentor === user?.name)
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const today = new Date().toISOString().slice(0, 10);
  const totalScore = checks.reduce((sum, check) => sum + Number(check.score || 0), 0);
  const avg = checks.length ? Math.round(totalScore / checks.length) : 0;
  const xp = Math.max(0, totalScore + userFeedback.length * 15 + userAttendance.length * 3 + parentReviewXp + manualXp);
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
  return { checks, avg, xp, manualXp, parentReviewXp, rank, tasks, achievements, next: rank.next, streak };
}

function mentorRank(xp, avg) {
  const titles = [
    "Level 1 · Rookie",
    "Level 2 · Assistant",
    "Level 3 · Builder",
    "Level 4 · Instructor",
    "Level 5 · Coach",
    "Level 6 · Engineer",
    "Level 7 · Pro Mentor",
    "Level 8 · Methodist",
    "Level 9 · Lead Mentor",
    "Level 10 · Master",
  ];
  const level = Math.min(10, Math.max(1, Math.floor(xp / 100) + 1));
  const nextXp = level >= 10 ? 1000 : level * 100;
  const next = level >= 10
    ? `Максимальный уровень · средний балл ${avg}%`
    : `До ${titles[level]} осталось ${Math.max(0, nextXp - xp)} XP`;
  return { title: titles[level - 1], level, next };
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
    if (heroBand) heroBand.hidden = false;
    updateAuthMode();
    return;
  }

  authScreen.hidden = true;
  appShell.hidden = false;
  currentUserName.textContent = currentUser.name;
  currentUserRole.textContent = isAdmin()
    ? "Админ"
    : isParent()
      ? `Родитель · ${visibleStudents().length} детей`
      : `Ментор · ${currentUser.groups.join(", ") || "нет групп"}`;
  if (heroBand) heroBand.hidden = isParent();
  if (pendingParentQrScan && isParent() && !parentQrScanHandled) activeView = "parent";
  if (!canUse(activeView)) activeView = "dashboard";
  updatePageTitle();
  syncNavigation();
  render();
  handlePendingParentQrScan();
}

function handlePendingParentQrScan() {
  if (!pendingParentQrScan || parentQrScanHandled || !currentUser) return;
  parentQrScanHandled = true;
  if (isParent()) {
    setTimeout(() => openParentQrScanModal(), 0);
    return;
  }
  setTimeout(() => {
    openModal(
      "QR отметка",
      `<div class="empty">Эта QR отметка работает через аккаунт родителя. Выйдите и войдите как родитель, чтобы подтвердить посещение ребенка.</div>`,
    );
  }, 0);
}

function updateAuthMode() {
  const tabs = document.querySelector(".auth-tabs");
  const loginTab = document.querySelector('[data-auth-tab="login"]');
  const registerTab = document.querySelector('[data-auth-tab="register"]');
  const loginForm = document.querySelector("#loginForm");
  const registerForm = document.querySelector("#registerForm");
  const roleSelect = document.querySelector('#registerForm select[name="role"]');
  const groupsInput = document.querySelector('#registerForm input[name="groups"]');
  const groupsField = document.querySelector("#registerGroupsField");
  const childrenField = document.querySelector("#registerChildrenField");
  const childrenSelect = document.querySelector('#registerForm select[name="childIds"]');
  const registerHint = document.querySelector("#registerHint");
  if (!tabs || !roleSelect || !groupsInput || !groupsField || !childrenField || !childrenSelect || !loginTab || !registerTab || !loginForm || !registerForm) return;
  childrenSelect.innerHTML = (state.students || [])
    .map((student) => `<option value="${student.id}">${student.name} · ${student.group}</option>`)
    .join("");
  if (state.users.length === 0) {
    tabs.hidden = false;
    registerTab.hidden = false;
    roleSelect.value = "admin";
    roleSelect.disabled = true;
    groupsField.hidden = false;
    groupsInput.disabled = true;
    groupsInput.placeholder = "Первый аккаунт получает полный доступ";
    childrenField.hidden = true;
    childrenSelect.disabled = true;
    registerHint.textContent = "Первый аккаунт станет админом. После этого родители смогут регистрироваться сами.";
  } else {
    tabs.hidden = false;
    registerTab.hidden = false;
    roleSelect.value = "parent";
    roleSelect.disabled = true;
    groupsField.hidden = true;
    groupsInput.disabled = true;
    childrenField.hidden = false;
    childrenSelect.disabled = false;
    registerHint.textContent = childrenSelect.options.length
      ? "Родитель выбирает своих детей и получает доступ только к ним."
      : "Пока в CRM нет учеников для привязки. Обратитесь к администратору.";
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
    schedule: "Расписание",
    trials: "Пробные уроки",
    payments: "Абонементы",
    feedback: "Фидбек",
    parent: "Семья",
    tasks: "Задачи",
    methods: "Методика",
    salary: "Зарплаты",
    team: "Команда",
  }[activeView];
}

function render() {
  const renderers = {
    dashboard: renderDashboard,
    students: renderStudents,
    attendance: renderAttendance,
    schedule: renderSchedule,
    trials: renderTrials,
    payments: renderPayments,
    feedback: renderFeedback,
    parent: renderParentPortal,
    tasks: renderTasks,
    methods: renderMethods,
    salary: renderSalary,
    team: renderTeam,
  };
  appView.innerHTML = `${activeLessonBanner()}${renderers[activeView]()}`;
  bindViewActions();
  updateToday();
  syncLessonTimer();
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
  if (isParent()) return renderParentDashboard();
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
  const subAlerts = isAdmin() ? adminSubscriptionAlerts().length : 0;

  return `
    ${dashboardLanding(students.length, active, present)}
    ${!isParent() ? lessonLaunchPanel() : ""}
    <div class="stats-grid">
      ${stat("Ученики", students.length, isAdmin() ? "все группы" : "мои группы")}
      ${stat("Активные", active, "учатся сейчас")}
      ${stat("Посещений", present, "отмечено")}
      ${stat(isAdmin() ? "Выручка" : "Прогресс", isAdmin() ? formatMoney(revenue) : `${avgProgress}%`, isAdmin() ? `${due} оплат к контролю` : "средний по группам")}
      ${isAdmin() ? stat("Абонементы", subAlerts, "учеников на оплату") : ""}
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
      <div class="card-header"><h3>Аналитика групп</h3><span class="badge neutral">${groupAnalytics().length} групп</span></div>
      <div class="card-body group-analytics">
        ${
          groupAnalytics()
            .map(
              (item) => `
                <div class="group-analytic">
                  <strong>${item.group}</strong>
                  <span>${item.students} учеников</span>
                  <span class="${item.risks ? "risk" : ""}">${item.risks} оплат к контролю</span>
                  <div class="progress"><span style="width:${item.avgProgress}%"></span></div>
                  <small>прогресс ${item.avgProgress}%</small>
                </div>`,
            )
            .join("") || `<div class="empty">Группы появятся после добавления учеников</div>`
        }
      </div>
    </article>
    <article class="card">
      <div class="card-header"><h3>Расписание</h3><span class="badge neutral">${isAdmin() ? "все группы" : "мои группы"}</span></div>
      <div class="card-body attendance-grid">${scheduleCells()}</div>
    </article>
  `;
}

function renderParentDashboard() {
  const absenceNotifications = visibleStudents()
    .map((student) => ({ student, sub: subscriptionStatus(student) }))
    .filter(({ sub }) => sub.needsDirectorLetter);
  return `
    <div class="parent-overview">
      ${
        absenceNotifications.length
          ? `<article class="card parent-news-card">
              <div class="card-header">
                <h3>Уведомления по НБ</h3>
                <span class="badge overdue">${absenceNotifications.length}</span>
              </div>
              <div class="card-body list">
                ${absenceNotifications
                  .map(
                    ({ student, sub }) =>
                      `<div class="list-row payment-alert-row"><strong>${student.name}: ${sub.absent} НБ</strong><small>Нужно направить письмо на имя директора. Начиная с 3-го НБ занятия списываются с абонемента.</small></div>`,
                  )
                  .join("")}
              </div>
            </article>`
          : ""
      }
      <article class="card branch-map-card">
        <div class="card-header">
          <h3>Карта S7 Robotics в Мангистау</h3>
          <span class="badge neutral">семейный обзор</span>
        </div>
        <div class="map-layout parent-map-layout">
          ${mangystauMap()}
          <div class="branch-list">
            ${branchRow("15 мкр, 70 здание", "Основная площадка", "active")}
            ${branchRow("19 мкр, 23/1", "Площадка S7 Robotics", "active")}
            ${branchRow("32 ЖББМ", "Школьная группа", "soon")}
            ${branchRow("ТОО Tanym School", "Партнерская площадка", "neutral")}
            ${branchRow("АОО NIS", "Партнерская площадка", "neutral")}
          </div>
        </div>
      </article>
      <article class="card parent-news-card">
        <div class="card-header">
          <h3>Новости центра</h3>
          <span class="badge active">${(state.announcements || []).length || "live"}</span>
        </div>
        <div class="card-body list">
          ${announcementList()}
        </div>
      </article>
    </div>
  `;
}

function activeLessonBanner() {
  const session = getActiveLessonSession();
  if (!session || isParent()) return "";
  const remaining = lessonRemaining(session);
  const done = remaining.total <= 0;
  return `
    <section class="active-lesson-banner ${done ? "ended" : ""}">
      <div>
        <span class="badge ${done ? "overdue" : "active"}">${done ? "время вышло" : "урок идет"}</span>
        <strong>${session.group} · ${session.time}</strong>
        <small>${session.mentor} · ${session.studentsCount || 0} учеников · старт ${formatClock(session.startedAt)}</small>
      </div>
      <div class="lesson-timer" data-lesson-timer>${remaining.label}</div>
      <div class="row-actions">
        <button class="button secondary compact" data-resume-lesson="${session.lessonId}" type="button">Открыть пульт</button>
        <button class="button ghost compact" data-end-active-lesson type="button">Скрыть</button>
      </div>
    </section>`;
}

function startLessonSession(lesson, students) {
  const now = Date.now();
  const session = {
    lessonId: Number(lesson.id),
    group: lesson.group,
    time: lesson.time,
    day: lesson.day,
    mentor: lesson.mentor,
    studentsCount: students.length,
    startedAt: new Date(now).toISOString(),
    endAt: new Date(now + LESSON_DURATION_MINUTES * 60000).toISOString(),
  };
  localStorage.setItem(LESSON_SESSION_KEY, JSON.stringify(session));
}

function getActiveLessonSession() {
  try {
    const session = JSON.parse(localStorage.getItem(LESSON_SESSION_KEY) || "null");
    return session?.lessonId ? session : null;
  } catch {
    return null;
  }
}

function clearActiveLessonSession() {
  localStorage.removeItem(LESSON_SESSION_KEY);
  if (lessonTimerId) clearInterval(lessonTimerId);
  lessonTimerId = null;
}

function lessonRemaining(session) {
  const total = new Date(session.endAt) - new Date();
  const safe = Math.max(0, total);
  const minutes = Math.floor(safe / 60000);
  const seconds = Math.floor((safe % 60000) / 1000);
  return {
    total,
    label: `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`,
  };
}

function formatClock(date) {
  return new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(new Date(date));
}

function syncLessonTimer() {
  if (lessonTimerId) clearInterval(lessonTimerId);
  if (!getActiveLessonSession() || isParent()) return;
  lessonTimerId = setInterval(() => {
    const session = getActiveLessonSession();
    const timer = document.querySelector("[data-lesson-timer]");
    if (!session || !timer) {
      clearInterval(lessonTimerId);
      lessonTimerId = null;
      return;
    }
    const remaining = lessonRemaining(session);
    timer.textContent = remaining.label;
    document.querySelector(".active-lesson-banner")?.classList.toggle("ended", remaining.total <= 0);
  }, 1000);
}

function lessonLaunchPanel() {
  const lessons = lessonLaunchList().slice(0, 4);
  if (!lessons.length) return "";
  return `
    <article class="card lesson-launch-card">
      <div class="card-header">
        <h3>Пульт урока</h3>
        <span class="badge active">${lessons.length} ближайших</span>
      </div>
      <div class="lesson-launch-list">
        ${lessons
          .map(({ lesson, timing, students }) => `
            <div class="lesson-launch-row">
              <div>
                <strong>${lesson.group} · ${lesson.time}</strong>
                <small>${lesson.day} · ${lesson.mentor} · ${students.length} учеников</small>
              </div>
              <span class="badge ${timing.tone}">${timing.short}</span>
              <button class="button primary compact" data-start-lesson="${lesson.id}" type="button">Начать урок</button>
            </div>`)
          .join("")}
      </div>
    </article>`;
}

function lessonLaunchList() {
  return visibleSchedule()
    .map((lesson) => ({
      lesson,
      timing: lessonTimingStatus(lesson),
      students: studentsForLesson(lesson),
    }))
    .filter(({ students }) => students.length)
    .sort((a, b) => a.timing.rank - b.timing.rank || a.lesson.time.localeCompare(b.lesson.time));
}

function lessonTimingStatus(lesson) {
  const day = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"][new Date().getDay()];
  if (lesson.day !== day) return { label: "не сегодня", short: "по расписанию", tone: "neutral", rank: 3 };
  const [hours, minutes] = String(lesson.time || "00:00").split(":").map(Number);
  const start = new Date();
  start.setHours(hours || 0, minutes || 0, 0, 0);
  const diff = Math.round((start - new Date()) / 60000);
  if (diff < -120) return { label: "урок уже прошел", short: "прошел", tone: "neutral", rank: 2 };
  if (diff <= 15 && diff >= -120) return { label: "можно начинать", short: "сейчас", tone: "active", rank: 0 };
  if (diff > 15 && diff <= 90) return { label: `через ${diff} мин`, short: "скоро", tone: "soon", rank: 1 };
  return { label: "сегодня позже", short: "сегодня", tone: "neutral", rank: 2 };
}

function studentsForLesson(lesson) {
  return visibleStudents().filter((student) => student.group === lesson.group || student.mentor === lesson.mentor && student.group === lesson.group);
}

function dashboardLanding(totalStudents, activeStudents, visits) {
  return `
    <section class="landing-dashboard">
      <div class="landing-copy">
        <span class="landing-kicker">S7 Robotics Mangystau</span>
        <h2>Журнал центра: группы, уроки и оплата без лишнего шума.</h2>
        <p>Здесь видно, кто сегодня пришел, где нужна оплата, какие темы прошли и как движется каждая группа.</p>
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
  const program = programProgress(student);
  return `
    <div class="list-row">
      <div>
        <strong>${student.name}</strong>
        <small>${program.title} · ${student.group}</small>
      </div>
      <div class="progress-cell">
        <div class="progress"><span style="width:${program.percent}%"></span></div>
        <small>${program.completed}/${program.total}</small>
      </div>
    </div>`;
}

function programTrack(student) {
  const raw = `${student.course || ""} ${student.group || ""}`.toLowerCase();
  if (/программа\s*b|program\s*b|(^|[\s-])b\s*\d*($|[\s-])|advanced|senior/.test(raw)) {
    return "B";
  }
  return "A";
}

function programTitle(track) {
  return track === "B" ? "Программа B" : "Программа A";
}

function programProgress(student) {
  const total = 34;
  const historicalVisits = (Math.max(1, Number(student.subscriptionNumber || 1)) - 1) * 8;
  const completed = Math.min(total, historicalVisits + studentPresentAttendance(student.id).length);
  const percent = Math.round((completed / total) * 100);
  const track = programTrack(student);
  const nextLesson = Math.min(total, completed + 1);
  return {
    track,
    title: programTitle(track),
    total,
    completed,
    percent,
    nextLesson,
    remaining: Math.max(0, total - completed),
  };
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
                  ${(() => {
                    const sub = subscriptionStatus(student);
                    return `
                  <tr>
                    <td><strong>${student.name}</strong><small>${student.group} · ${student.phone}</small></td>
                    <td>${programProgress(student).title}<small>${programProgress(student).completed}/34 уроков</small></td>
                    <td>${student.parent}</td>
                    <td>${student.mentor}</td>
                    <td>
                      <strong>#${sub.currentSubscriptionNumber} · ${sub.visitLabel}</strong>
                      <small>${sub.remaining} занятий осталось · всего ${sub.totalProgressVisits}</small>
                      ${sub.absent ? `<small>${sub.absent} НБ · списано ${sub.billableAbsent}</small>` : ""}
                      <small>${sub.startDate ? `оплата ${formatDate(sub.startDate)}` : "нет оплаты"}</small>
                      <small>${isAdmin() ? `оплата ${sub.nextPaymentDate ? formatDate(sub.nextPaymentDate) : "не рассчитана"}` : "детали у админа"}</small>
                    </td>
                    <td><span class="badge ${sub.expired ? "overdue" : sub.needsPayment ? "soon" : student.status}">${sub.expired ? "Нужна оплата" : sub.needsPayment ? "7-е посещение" : statusText[student.status]}</span></td>
                    <td>
                      <div class="row-actions">
                        <button class="button ghost compact" data-open-student="${student.id}" type="button">Профиль</button>
                        ${isAdmin() ? `<button class="button secondary compact" data-edit-student="${student.id}" type="button">Редактировать</button>` : ""}
                        ${isAdmin() ? `<button class="button danger compact" data-delete-student="${student.id}" type="button">Удалить</button>` : ""}
                      </div>
                    </td>
                  </tr>`;
                  })()}`,
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
  const records = visibleAttendance();

  return `
    <div class="toolbar">
      <div class="filters">
        ${!isParent() ? `<button class="button primary" data-add-attendance type="button">+ Отметка</button>` : ""}
        ${!isParent() ? `<button class="button secondary" data-unified-qr type="button">Единый QR</button>` : `<button class="button primary" data-open-parent-qr-scan type="button">Сканировать QR</button>`}
        <button class="button secondary" data-print-attendance type="button">Печать ведомости</button>
        <button class="button ghost" data-export-attendance type="button">Экспорт CSV</button>
        <label class="inline-filter">Группа
          <select id="attendanceGroupFilter">
            <option value="all">Все доступные</option>
            ${groups.map((group) => `<option value="${group}" ${group === attendanceGroup ? "selected" : ""}>${group}</option>`).join("")}
          </select>
        </label>
      </div>
      <span class="badge neutral">${isAdmin() ? "админ видит все группы" : isParent() ? "только дети родителя" : "только мои группы"}</span>
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
              <th>Абонемент</th>
              ${Array.from({ length: 8 }, (_, index) => `<th>${index + 1}</th>`).join("")}
              <th>Итого</th>
            </tr>
          </thead>
          <tbody>
            ${
              students
                .map((student) => {
                  const rowRecords = records.filter((item) => Number(item.studentId) === Number(student.id));
                  const presentCount = rowRecords.filter((item) => item.status === "present").length;
                  const sub = subscriptionStatus(student);
                  const cells = currentSubscriptionCells(student, sub);
                  const attendanceHint = sub.needsDirectorLetter
                    ? `НБ ${sub.absent}: письмо директору`
                    : sub.absent
                      ? `НБ ${sub.absent}/2 без списания`
                      : `${presentCount} посещений в истории`;
                  return `
                    <tr>
                      <td><strong>${student.name}</strong><small>${student.course}</small></td>
                      <td>${student.group}<small>${student.mentor}</small></td>
                      <td>${subscriptionBadge(sub)}</td>
                      ${cells.map((record, index) => attendanceSlotCell(student.id, index, record)).join("")}
                      <td>
                        <strong>${sub.totalProgressVisits}</strong>
                        <small>${sub.needsPayment ? `пора на оплату · ${attendanceHint}` : attendanceHint}</small>
                        <div class="row-actions">
                          <button class="button ghost compact" data-parent-messages="${student.id}" type="button">Сообщения</button>
                          <button class="button ghost compact" data-attendance-history="${student.id}" type="button">История</button>
                        </div>
                      </td>
                    </tr>`;
                })
                .join("") || `<tr><td colspan="12"><div class="empty">Нет учеников в выбранной группе</div></td></tr>`
            }
          </tbody>
        </table>
      </div>
    </article>
  `;
}

function currentSubscriptionCells(student, sub = subscriptionStatus(student)) {
  const records = billableAttendanceRecords(student.id, sub.startDate);
  const cycleStart = Math.floor(sub.used / 8) * 8;
  return Array.from({ length: 8 }, (_, index) => records[cycleStart + index] || null);
}

function subscriptionBadge(sub) {
  return `
    <div class="subscription-badge ${sub.expired ? "expired" : ""}">
      <strong>#${sub.currentSubscriptionNumber}</strong>
      <small>${sub.currentCycleUsed}/8</small>
    </div>`;
}

function renderSchedule() {
  const lessons = visibleSchedule();
  return `
    <div class="toolbar">
      ${isAdmin() ? `<button class="button primary" data-add-schedule type="button">+ Занятие</button>` : ""}
      <span class="badge neutral">${isAdmin() ? "все группы" : "мое расписание"}</span>
    </div>
    <article class="card">
      <div class="card-header"><h3>Расписание групп</h3><span class="badge neutral">${lessons.length} занятий</span></div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>День</th><th>Время</th><th>Группа</th><th>Ментор</th><th>Действия</th></tr></thead>
          <tbody>
            ${
              lessons
                .map(
                  (lesson) => {
                    const timing = lessonTimingStatus(lesson);
                    return `
                    <tr>
                      <td><strong>${lesson.day}</strong></td>
                      <td>${lesson.time}<small>${timing.label}</small></td>
                      <td>${lesson.group}</td>
                      <td>${lesson.mentor}</td>
                      <td>
                        <div class="row-actions">
                          ${!isParent() ? `<button class="button primary compact" data-start-lesson="${lesson.id}" type="button">Начать урок</button>` : ""}
                          ${isAdmin() ? `<button class="button danger compact" data-delete-schedule="${lesson.id}" type="button">Удалить</button>` : `<span class="badge ${timing.tone}">${timing.short}</span>`}
                        </div>
                      </td>
                    </tr>`;
                  },
                )
                .join("") || `<tr><td colspan="5"><div class="empty">Расписание пока не составлено</div></td></tr>`
            }
          </tbody>
        </table>
      </div>
    </article>
  `;
}

function renderTrials() {
  const trials = visibleTrialLessons();
  const scheduled = trials.filter((lesson) => lesson.status === "scheduled" || lesson.status === "confirmed").length;
  const openA = trialOpenSlots("A");
  const openB = trialOpenSlots("B");
  return `
    <div class="stats-grid">
      ${stat("Пробные", trials.length, isAdmin() ? "все заявки" : "мои группы")}
      ${stat("Запланировано", scheduled, "ждут урок")}
      ${stat("A свободно", openA, "мест в группах до 7")}
      ${stat("B свободно", openB, "мест в группах до 9")}
    </div>
    <div class="toolbar">
      ${isAdmin() ? `<button class="button primary" data-add-trial type="button">+ Пробный урок</button>` : ""}
      <span class="badge neutral">${isAdmin() ? "автоподбор свободного времени" : "пробные по моим группам"}</span>
    </div>
    <article class="card">
      <div class="card-header"><h3>Пробные уроки</h3><span class="badge active">${scheduled} активных</span></div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Ребенок</th><th>Программа</th><th>Время</th><th>Группа</th><th>Ментор</th><th>Статус</th><th>Действия</th></tr></thead>
          <tbody>
            ${
              trials
                .map(
                  (lesson) => `
                    <tr>
                      <td><strong>${lesson.childName}</strong><small>${lesson.parentName} · ${lesson.phone}</small></td>
                      <td>${programTitle(lesson.program)}<small>${lesson.note || "пробный урок"}</small></td>
                      <td><strong>${formatDate(lesson.date)}</strong><small>${lesson.day} · ${lesson.time}</small></td>
                      <td>${lesson.group}<small>${groupOccupancy(lesson.group)}/${groupCapacity(lesson.group)} мест</small></td>
                      <td>${lesson.mentor}</td>
                      <td>
                        <select class="status-select" data-trial-status="${lesson.id}">
                          ${trialStatusOptions(lesson.status)}
                        </select>
                      </td>
                      <td>${isAdmin() ? `<button class="button danger compact" data-delete-trial="${lesson.id}" type="button">Удалить</button>` : `<span class="badge neutral">просмотр</span>`}</td>
                    </tr>`,
                )
                .join("") || `<tr><td colspan="7"><div class="empty">Пробные уроки пока не записаны</div></td></tr>`
            }
          </tbody>
        </table>
      </div>
    </article>
  `;
}

function trialStatusOptions(selected) {
  return [
    ["scheduled", "Запланирован"],
    ["confirmed", "Подтвердили"],
    ["visited", "Пришел"],
    ["missed", "Не пришел"],
    ["converted", "Стал учеником"],
    ["cancelled", "Отменен"],
  ]
    .map(([value, label]) => `<option value="${value}" ${selected === value ? "selected" : ""}>${label}</option>`)
    .join("");
}

function trialOpenSlots(program) {
  return (state.schedule || [])
    .filter((lesson) => groupProgram(lesson.group) === program)
    .reduce((sum, lesson) => sum + Math.max(0, groupCapacity(lesson.group) - groupOccupancy(lesson.group)), 0);
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

function attendanceSlotCell(studentId, slotIndex, record) {
  const tag = (className, text, title = "") => `<span class="mark ${className}" title="${title}">${text}</span>`;
  if (!record) {
    if (isParent()) return `<td>${tag("missed", "-")}</td>`;
    return `<td><button class="mark missed" data-add-attendance-student="${studentId}" title="Добавить дату занятия ${slotIndex + 1}" type="button">${slotIndex + 1}</button></td>`;
  }
  const mark = record.status === "present" ? "Б" : "НБ";
  const label = `${formatDate(record.date)} · ${record.topic}`;
  if (isParent()) return `<td>${tag(record.status, mark, label)}<small>${formatDate(record.date)}</small></td>`;
  return `<td><button class="mark ${record.status}" data-toggle-attendance="${studentId}:${record.date}" title="${label}" type="button">${mark}</button><small>${formatDate(record.date)}</small></td>`;
}

function renderPayments() {
  if (!isAdmin()) return `<div class="empty">Абонементы доступны только администратору.</div>`;
  const billedTotal = state.payments.reduce((sum, payment) => sum + payment.amount, 0);
  const paidTotal = state.payments.filter((payment) => payment.status === "paid").reduce((sum, payment) => sum + payment.amount, 0);
  const expenses = (state.expenses || []).reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const net = paidTotal - expenses;
  return `
    <div class="stats-grid">
      ${stat("Оплачено", formatMoney(paidTotal), "фактический доход")}
      ${stat("Начислено", formatMoney(billedTotal), "все счета")}
      ${stat("Расход", formatMoney(expenses), "траты центра")}
      ${stat("Остаток", formatMoney(net), "оплаты минус расходы")}
    </div>
    <div class="module-grid">
      <article class="card">
        <div class="card-header">
          <h3>Абонементы и оплаты</h3>
          <div class="filters">
            <button class="button ghost" data-export-payments type="button">Экспорт CSV</button>
            <button class="button primary" data-add-payment type="button">+ Оплата</button>
          </div>
        </div>
        <div class="card-body list">
          ${state.payments.map((payment) => paymentRow(payment)).join("") || `<div class="empty">Оплат пока нет</div>`}
        </div>
      </article>
      <article class="card">
        <div class="card-header">
          <h3>Траты средств</h3>
          <button class="button primary" data-add-expense type="button">+ Трата</button>
        </div>
        <div class="card-body list">
          ${(state.expenses || []).map((expense) => expenseRow(expense)).join("") || `<div class="empty">Расходы пока не добавлены</div>`}
        </div>
      </article>
    </div>
  `;
}

function paymentRow(payment) {
  const student = byId(payment.studentId);
  const sub = student ? subscriptionStatus(student) : null;
  return `
    <div class="list-row">
      <div>
        <strong>${student?.name ?? "Удаленный ученик"}</strong>
        <small>${payment.plan} · ${formatDate(payment.date)}${sub ? ` · ${sub.visitLabel}` : ""}</small>
        ${sub?.needsPayment ? `<small class="payment-alert">следующая оплата: ${formatDate(sub.nextPaymentDate)}</small>` : ""}
      </div>
      <div>
        <strong>${formatMoney(payment.amount)}</strong>
        <span class="badge ${payment.status}">${statusText[payment.status]}</span>
        ${isAdmin() ? `<button class="button danger compact" data-delete-payment="${payment.id}" type="button">Удалить</button>` : ""}
      </div>
    </div>`;
}

function expenseRow(expense) {
  return `
    <div class="list-row">
      <div>
        <strong>${expense.title}</strong>
        <small>${expenseCategoryLabel(expense.category)} · ${formatDate(expense.date)}${expense.createdBy ? ` · ${expense.createdBy}` : ""}</small>
        ${expense.note ? `<small>${expense.note}</small>` : ""}
      </div>
      <div>
        <strong>${formatMoney(expense.amount)}</strong>
        <button class="button danger compact" data-delete-expense="${expense.id}" type="button">Удалить</button>
      </div>
    </div>`;
}

function expenseCategoryLabel(category) {
  const labels = {
    rent: "Аренда",
    salary: "Зарплата",
    equipment: "Оборудование",
    marketing: "Маркетинг",
    utilities: "Коммунальные",
    other: "Другое",
  };
  return labels[category] || "Другое";
}

function renderFeedback() {
  const notes = visibleFeedback();
  const reviews = isAdmin() ? state.parentReviews || [] : visibleParentReviews();
  const homework = visibleHomework();
  const reports = visiblePhotoReports();
  const certificates = visibleCertificates();
  return `
    <div class="toolbar">
      ${isParent() ? `<button class="button primary" data-add-parent-review type="button">+ Отзыв по уроку</button>` : `<button class="button primary" data-add-feedback type="button">+ Фидбек</button>`}
      ${!isParent() ? `<button class="button secondary" data-add-homework type="button">+ Домашка</button>` : ""}
      ${!isParent() ? `<button class="button secondary" data-add-photo-report type="button">+ Фотоотчет</button>` : ""}
      ${isAdmin() ? `<button class="button ghost" data-add-certificate type="button">Сертификат</button>` : ""}
      <span class="badge neutral">${notes.length} заметок</span>
      ${reviews.length ? `<span class="badge active">${reviews.length} отзывов родителей</span>` : ""}
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
                ${
                  reviews
                    .filter((review) => Number(review.studentId) === Number(student.id))
                    .map((review) => parentReviewCard(review))
                    .join("")
                }
              </div>
            </section>`;
        })
        .join("")}
    </div>
    <div class="module-grid learning-addons">
      <article class="card">
        <div class="card-header"><h3>Домашние задания</h3><span class="badge neutral">${homework.length}</span></div>
        <div class="card-body list">
          ${homework.map((item) => homeworkRow(item)).join("") || `<div class="empty">Домашних заданий пока нет</div>`}
        </div>
      </article>
      <article class="card">
        <div class="card-header"><h3>Фотоотчеты уроков</h3><span class="badge active">${reports.length}</span></div>
        <div class="card-body photo-report-grid">
          ${reports.map((item) => photoReportCard(item)).join("") || `<div class="empty">Фотоотчеты появятся после уроков</div>`}
        </div>
      </article>
    </div>
    <article class="card">
      <div class="card-header"><h3>Сертификаты</h3><span class="badge soon">${certificates.length}</span></div>
      <div class="card-body certificate-list">
        ${certificates.map((item) => certificateRow(item)).join("") || `<div class="empty">Сертификаты можно создать после завершения программы A/B.</div>`}
      </div>
    </article>
  `;
}

function renderParentPortal() {
  const students = visibleStudents();
  const reviews = visibleParentReviews();
  const weekly = weeklyPassProgress();
  const season = seasonPassProgress(weekly);
  return `
    <div class="toolbar">
      <button class="button primary" data-add-parent-review type="button">+ Отзыв по уроку</button>
      ${isParent() ? `<button class="button primary" data-open-parent-qr-scan type="button">Сканировать QR</button>` : ""}
      ${isParent() ? `<button class="button secondary" data-edit-profile type="button">Редактировать профиль</button>` : ""}
      ${isAdmin() ? `<button class="button secondary" data-add-announcement type="button">+ Новость / скидка</button>` : ""}
      <span class="badge neutral">семейный кабинет</span>
    </div>
    <div class="module-grid">
      <article class="card">
        <div class="card-header"><h3>Новости и скидки</h3><span class="badge active">${(state.announcements || []).length}</span></div>
        <div class="card-body list">
          ${announcementList()}
        </div>
      </article>
      <article class="card">
        <div class="card-header"><h3>Бонусы за отзывы</h3><span class="badge active">${reviews.reduce((sum, item) => sum + Number(item.bonusPoints || 0), 0)} XP</span></div>
        <div class="card-body list">
          ${reviews.map((review) => parentReviewCard(review)).join("") || `<div class="empty">После урока оставьте отзыв, он усилит уровень ментора и даст бонусы ребенку.</div>`}
        </div>
      </article>
    </div>
    <div class="parent-grid">
      ${students.map((student) => parentStudentCard(student)).join("") || `<div class="empty">Админ еще не привязал детей к аккаунту родителя.</div>`}
    </div>
    <article class="card">
      <div class="card-header"><h3>Сезонный пропуск S7</h3><span class="badge soon">1000 XP за уровень</span></div>
      <div class="weekly-pass">
        <div>
          <span>Сезонный уровень ${season.level}</span>
          <strong>${season.levelXp}/${SEASON_LEVEL_XP} XP до следующего уровня</strong>
          <small>Неделя ${weekly.week} · ${season.totalXp} XP всего · ${season.nextReward ? `следующая награда: ${season.nextReward.title}` : "главная награда сезона открыта"}</small>
        </div>
        <div class="weekly-meter" aria-label="Заполнение сезонного пропуска">
          <span style="width:${season.percent}%"></span>
        </div>
      </div>
      <div class="season-summary">
        ${stat("Недельные миссии", `${weekly.done}/${weekly.total}`, `+${weekly.earnedXp} XP`)}
        ${stat("Отзывы семьи", `${reviews.length}`, "усиливают pass")}
        ${stat("Дети", `${students.length}`, "общий семейный прогресс")}
      </div>
      <div class="weekly-missions">
        ${weekly.missions.map((mission) => missionRow(mission)).join("")}
      </div>
      <div class="season-pass">
        ${SEASON_REWARDS.map((reward) => seasonReward(reward, season.level)).join("")}
      </div>
    </article>
  `;
}

function parentStudentCard(student) {
  const sub = subscriptionStatus(student);
  const stats = childGamification(student);
  const program = programProgress(student);
  const attendance = visibleAttendance().filter((item) => Number(item.studentId) === Number(student.id)).slice(0, 5);
  const feedback = visibleFeedback().filter((item) => Number(item.studentId) === Number(student.id)).slice(0, 3);
  const homework = visibleHomework().filter((item) => Number(item.studentId) === Number(student.id)).slice(0, 3);
  const reports = visiblePhotoReports().filter((item) => Number(item.studentId) === Number(student.id)).slice(0, 2);
  const certificates = visibleCertificates().filter((item) => Number(item.studentId) === Number(student.id));
  return `
    <article class="card parent-child-card">
      <div class="card-header">
        <h3>${student.name}</h3>
        <span class="badge ${sub.expired ? "overdue" : sub.needsPayment ? "soon" : "active"}">#${sub.currentSubscriptionNumber}</span>
      </div>
      <div class="profile-summary">
        ${stat("Абонемент", sub.visitLabel, `${sub.remaining} осталось · всего ${sub.totalProgressVisits}`)}
        ${stat("Уровень", stats.level, `${stats.xp} XP`)}
        ${stat(program.title, `${program.completed}/${program.total}`, `следующий урок ${program.nextLesson}`)}
      </div>
      ${
        sub.needsDirectorLetter
          ? `<div class="list-row payment-alert-row"><strong>Уведомление по НБ</strong><small>У ученика уже ${sub.absent} НБ. Родителю нужно направить письмо на имя директора; начиная с 3-го НБ занятия списываются с абонемента.</small></div>`
          : ""
      }
      <div class="child-level-panel">
        <div>
          <strong>Прогресс уровня</strong>
          <small>${stats.levelXp}/${SEASON_LEVEL_XP} XP · осталось ${stats.xpToNext} XP</small>
        </div>
        <div class="weekly-meter" aria-label="Прогресс уровня ученика">
          <span style="width:${stats.levelPercent}%"></span>
        </div>
      </div>
      <div class="program-panel">
        <div>
          <strong>${program.title}</strong>
          <small>${program.remaining ? `Осталось ${program.remaining} уроков` : "Программа закрыта"}</small>
        </div>
        <div class="program-track" aria-label="Прогресс программы">
          ${Array.from({ length: 34 }, (_, index) => `<span class="${index < program.completed ? "done" : index === program.completed ? "current" : ""}"></span>`).join("")}
        </div>
        <div class="progress"><span style="width:${program.percent}%"></span></div>
        <small>${program.percent}% учебного пути</small>
      </div>
      <div class="gamification-grid">
        <section>
          <h4>Миссии ученика</h4>
          <div class="mission-list">${stats.missions.map((mission) => missionRow(mission)).join("")}</div>
        </section>
        <section>
          <h4>Достижения</h4>
          <div class="achievement-list">${stats.achievements.map((item) => achievementRow(item)).join("")}</div>
        </section>
      </div>
      <div class="card-body list">
        <strong>Последние уроки</strong>
        ${attendance.map((item) => `<div class="list-row"><span>${formatDate(item.date)}</span><small>${statusText[item.status]} · ${item.topic}</small></div>`).join("") || `<div class="empty">Пока нет отметок</div>`}
        <strong>Фидбек ментора</strong>
        ${feedback.map((note) => `<div class="feedback-note"><strong>${note.skill}</strong><small>${note.mentor} · ${formatDate(note.date)}</small><p>${note.text}</p></div>`).join("") || `<div class="empty">Ментор еще не добавил фидбек</div>`}
        <strong>Домашние задания</strong>
        ${homework.map((item) => homeworkRow(item)).join("") || `<div class="empty">Пока нет домашки</div>`}
        <strong>Фотоотчеты</strong>
        ${reports.map((item) => photoReportCard(item)).join("") || `<div class="empty">Фотоотчеты появятся после уроков</div>`}
        ${certificates.length ? `<strong>Сертификаты</strong>${certificates.map((item) => certificateRow(item)).join("")}` : ""}
      </div>
    </article>`;
}

function childGamification(student) {
  const attendance = visibleAttendance().filter((item) => Number(item.studentId) === Number(student.id) && item.status === "present");
  const feedback = visibleFeedback().filter((item) => Number(item.studentId) === Number(student.id));
  const reviews = visibleParentReviews().filter((item) => Number(item.studentId) === Number(student.id));
  const program = programProgress(student);
  const streak = attendance.slice().sort((a, b) => new Date(a.date) - new Date(b.date)).length;
  const streakBonus = Math.min(streak, 10) * 25;
  const xp = attendance.length * 120 + feedback.length * 80 + reviews.length * 100 + Number(student.progress || 0) * 8 + streakBonus;
  const level = Math.min(20, Math.max(1, Math.floor(xp / SEASON_LEVEL_XP) + 1));
  const levelXp = xp % SEASON_LEVEL_XP;
  const levelPercent = Math.round((levelXp / SEASON_LEVEL_XP) * 100);
  const xpToNext = level >= 20 ? 0 : SEASON_LEVEL_XP - levelXp;
  const missions = [
    dailyTask("Посетить урок", attendance.length > 0, `${attendance.length} посещений · +120 XP`),
    dailyTask("Получить фидбек", feedback.length > 0, `${feedback.length} заметок · +80 XP`),
    dailyTask("Оставить отзыв", reviews.length > 0, `${reviews.length} отзывов · +100 XP`),
    dailyTask("Закрыть модуль", program.completed >= 8, `${program.completed}/${program.total} уроков · бонус`),
  ];
  const achievements = [
    achievement("Первый робот", attendance.length >= 1, "первый урок в сезоне"),
    achievement("Стабильный инженер", attendance.length >= 4, "4 урока в программе"),
    achievement("Семейная команда", reviews.length >= 3, "3 отзыва после уроков"),
    achievement("Половина пути", program.completed >= 17, "17 из 34 уроков"),
    achievement("Серия 5", streak >= 5, "5 посещений в сезоне"),
    achievement("Проектный финиш", program.completed >= 34, "закрыть программу A/B"),
  ];
  return { xp, level, levelXp, levelPercent, xpToNext, streak, missions, achievements };
}

function announcementRow(item) {
  const tone = item.kind === "discount" ? "soon" : item.kind === "bonus" ? "active" : "neutral";
  return `
    <div class="list-row">
      <div>
        <strong>${item.title}</strong>
        <small>${item.text}</small>
        ${item.expiresAt ? `<small>до ${formatDate(item.expiresAt)}</small>` : ""}
      </div>
      <span class="badge ${tone}">${item.kind === "discount" ? "скидка" : item.kind === "bonus" ? "бонус" : "новость"}</span>
      ${isAdmin() ? `<button class="button danger compact" data-delete-announcement="${item.id}" type="button">Удалить</button>` : ""}
    </div>`;
}

function announcementList() {
  const items = (state.announcements || []).filter((item) => !item.expiresAt || new Date(item.expiresAt) >= new Date(new Date().toISOString().slice(0, 10)));
  return items.map((item) => announcementRow(item)).join("") || defaultAnnouncements();
}

function defaultAnnouncements() {
  return `
    ${announcementRow({ title: "Семейный бонус", kind: "discount", text: "За активные отзывы семья получает дополнительные бонусы в сезонном пропуске.", expiresAt: "" })}
    ${announcementRow({ title: "3D-печать для проектов", kind: "bonus", text: "Ученики с высоким прогрессом открывают бесплатное время на 3D-принтере.", expiresAt: "" })}
    ${announcementRow({ title: "Открытые мастер-классы", kind: "news", text: "Лучшие проекты сезона попадут на занятия с мастерами центра.", expiresAt: "" })}
  `;
}

function weeklyPassProgress() {
  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const week = Math.max(1, Math.ceil(((now - yearStart) / 86400000 + yearStart.getDay() + 1) / 7));
  const students = visibleStudents();
  const reviews = visibleParentReviews();
  const attendance = visibleAttendance().filter((item) => item.status === "present");
  const feedback = visibleFeedback();
  const avgProgram = students.length
    ? Math.round(students.reduce((sum, student) => sum + programProgress(student).percent, 0) / students.length)
    : 0;
  const missions = [
    dailyTask("2 посещения за неделю", attendance.length >= 2, `${Math.min(attendance.length, 2)}/2 · +180 XP`),
    dailyTask("Семейный отзыв", reviews.length >= 1, `${reviews.length} отзывов · +120 XP`),
    dailyTask("Фидбек от ментора", feedback.length >= 1, `${feedback.length} заметок · +120 XP`),
    dailyTask("Прогресс программы", avgProgram >= 25, `${avgProgram}% среднего пути · +160 XP`),
    dailyTask("Серия активности", attendance.length >= 4, `${Math.min(attendance.length, 4)}/4 уроков · +220 XP`),
    dailyTask("Проектная неделя", feedback.length >= 2 && reviews.length >= 1, `${feedback.length} фидбеков и ${reviews.length} отзывов · +200 XP`),
  ];
  const missionXp = [180, 120, 120, 160, 220, 200];
  const done = missions.filter((mission) => mission.done).length;
  const total = missions.length;
  const percent = Math.round((done / total) * 100);
  const earnedXp = missions.reduce((sum, mission, index) => sum + (mission.done ? missionXp[index] : 0), 0);
  return { week, missions, done, total, percent, earnedXp };
}

function seasonPassProgress(weekly = weeklyPassProgress()) {
  const students = visibleStudents();
  const reviews = visibleParentReviews();
  const childXp = students.reduce((sum, student) => sum + childGamification(student).xp, 0);
  const reviewBonus = reviews.reduce((sum, item) => sum + Number(item.bonusPoints || 0), 0);
  const totalXp = childXp + reviewBonus + weekly.earnedXp;
  const maxLevel = SEASON_REWARDS[SEASON_REWARDS.length - 1].level;
  const level = Math.min(maxLevel, Math.max(1, Math.floor(totalXp / SEASON_LEVEL_XP) + 1));
  const levelXp = level >= maxLevel ? SEASON_LEVEL_XP : totalXp % SEASON_LEVEL_XP;
  const percent = Math.round((levelXp / SEASON_LEVEL_XP) * 100);
  const nextReward = SEASON_REWARDS.find((reward) => reward.level > level) || null;
  return { totalXp, level, levelXp, percent, nextReward };
}

function seasonReward(reward, currentLevel) {
  return `
    <div class="season-reward ${currentLevel >= reward.level ? "unlocked" : ""}">
      <span>${reward.level}</span>
      <strong>${reward.title}</strong>
      <small>${reward.text}</small>
    </div>`;
}

function parentReviewCard(review) {
  const student = byId(review.studentId);
  return `
    <article class="feedback-note parent-review">
      <strong>${"★".repeat(review.rating)}${"☆".repeat(Math.max(0, 5 - review.rating))} · ${student?.name || "Ученик"}</strong>
      <small>${review.mentor} · ${formatDate(review.date)} · +${review.bonusPoints || 0} XP</small>
      <p>${review.text}</p>
    </article>`;
}

function homeworkRow(item) {
  const student = byId(item.studentId);
  const done = item.status === "done";
  return `
    <div class="list-row homework-row ${done ? "done" : ""}">
      <div>
        <strong>${item.title}</strong>
        <small>${student?.name || "Ученик"} · ${item.dueDate ? `до ${formatDate(item.dueDate)}` : "без срока"} · ${item.createdBy || "S7"}</small>
        <small>${item.text}</small>
      </div>
      <div class="row-actions">
        <span class="badge ${done ? "active" : "soon"}">${done ? "выполнено" : "задано"}</span>
        ${isParent() && !done ? `<button class="button secondary compact" data-homework-done="${item.id}" type="button">Готово</button>` : ""}
        ${!isParent() ? `<button class="button ghost compact" data-homework-toggle="${item.id}:${done ? "assigned" : "done"}" type="button">${done ? "Вернуть" : "Готово"}</button>` : ""}
        ${!isParent() ? `<button class="button danger compact" data-delete-homework="${item.id}" type="button">Удалить</button>` : ""}
      </div>
    </div>`;
}

function photoReportCard(item) {
  const student = byId(item.studentId);
  return `
    <article class="photo-report-card">
      ${item.photoUrl ? `<img src="${item.photoUrl}" alt="${item.title}" loading="lazy" />` : `<div class="photo-placeholder">S7</div>`}
      <div>
        <strong>${item.title}</strong>
        <small>${student?.name || "Ученик"} · ${item.mentor} · ${formatDate(item.date)}</small>
        <p>${item.text}</p>
        ${!isParent() ? `<button class="button danger compact" data-delete-photo-report="${item.id}" type="button">Удалить</button>` : ""}
      </div>
    </article>`;
}

function certificateRow(item) {
  const student = byId(item.studentId);
  return `
    <div class="certificate-row">
      <div>
        <span class="certificate-seal">S7</span>
        <strong>${student?.name || "Ученик"}</strong>
        <small>${item.title} · Программа ${item.program} · ${formatDate(item.issuedAt)}</small>
        <small>№ ${item.certificateNo}${item.note ? ` · ${item.note}` : ""}</small>
      </div>
      <div class="row-actions">
        <button class="button secondary compact" data-view-certificate="${item.id}" type="button">Открыть</button>
        ${isAdmin() ? `<button class="button danger compact" data-delete-certificate="${item.id}" type="button">Удалить</button>` : ""}
      </div>
    </div>`;
}

function visibleMethods() {
  if (isAdmin()) return state.methods || [];
  const groups = new Set(currentUser?.groups || []);
  return (state.methods || []).filter((item) => groups.has(item.group) || item.mentor === currentUser?.name || item.group === "Все группы");
}

function renderMethods() {
  const methods = visibleMethods();
  return `
    <div class="toolbar">
      ${isAdmin() ? `<button class="button primary" data-add-method type="button">+ Урок / методика</button>` : ""}
      <span class="badge neutral">${isAdmin() ? "банк уроков" : "мои уроки"}</span>
    </div>
    <div class="method-grid">
      ${
        methods
          .map(
            (item) => `
              <article class="card method-card">
                <div class="card-header">
                  <h3>${item.topic}</h3>
                  <span class="badge neutral">${item.group}</span>
                </div>
                <div class="card-body list">
                  <div class="list-row"><strong>Дата</strong><small>${item.lessonDate ? formatDate(item.lessonDate) : "без даты"}</small></div>
                  <div class="list-row"><strong>Ментор</strong><small>${item.mentor || "любой"}</small></div>
                  <p>${item.description || "Описание не добавлено"}</p>
                  <div class="filters">
                    ${item.link ? `<a class="button secondary compact" href="${item.link}" target="_blank" rel="noreferrer">Ссылка</a>` : ""}
                    ${item.fileUrl ? `<a class="button ghost compact" href="${item.fileUrl}" target="_blank" rel="noreferrer">Файл</a>` : ""}
                    ${isAdmin() ? `<button class="button danger compact" data-delete-method="${item.id}" type="button">Удалить</button>` : ""}
                  </div>
                </div>
              </article>`,
          )
          .join("") || `<div class="empty">Методики появятся после загрузки админом</div>`
      }
    </div>
  `;
}

function visibleSalaries() {
  if (isAdmin()) return state.salaries || [];
  return (state.salaries || []).filter((item) => item.mentor === currentUser?.name);
}

function renderSalary() {
  const salaries = visibleSalaries();
  const total = salaries.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  return `
    <div class="toolbar">
      ${isAdmin() ? `<button class="button primary" data-add-salary type="button">+ Выплата</button>` : ""}
      <span class="badge neutral">${formatMoney(total)}</span>
    </div>
    <article class="card">
      <div class="card-header"><h3>Зарплаты менторов</h3><span class="badge neutral">${isAdmin() ? "редактирует админ" : "мои выплаты"}</span></div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Ментор</th><th>Период</th><th>Сумма</th><th>Дата оплаты</th><th>Статус</th><th>Комментарий</th><th>Действия</th></tr></thead>
          <tbody>
            ${
              salaries
                .map(
                  (item) => `
                    <tr>
                      <td><strong>${item.mentor}</strong></td>
                      <td>${item.period}</td>
                      <td>${formatMoney(item.amount)}</td>
                      <td>${item.payDate ? formatDate(item.payDate) : "не указана"}</td>
                      <td><span class="badge ${item.status === "paid" ? "paid" : "soon"}">${item.status === "paid" ? "Оплачено" : "Ожидает"}</span></td>
                      <td>${item.note || ""}</td>
                      <td>${isAdmin() ? `<button class="button danger compact" data-delete-salary="${item.id}" type="button">Удалить</button>` : `<span class="badge neutral">просмотр</span>`}</td>
                    </tr>`,
                )
                .join("") || `<tr><td colspan="7"><div class="empty">Выплат пока нет</div></td></tr>`
            }
          </tbody>
        </table>
      </div>
    </article>
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
  const roleLabel = { admin: "Администратор", mentor: "Ментор", parent: "Родитель" };
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
            const count = user.role === "admin"
              ? state.students.length
              : user.role === "parent"
                ? state.students.filter((student) => (user.groups || []).map(Number).includes(Number(student.id))).length
                : state.students.filter((student) => user.groups.includes(student.group)).length;
            return `
              <article class="card profile">
                <div class="avatar">${user.name.split(" ").map((part) => part[0]).join("")}</div>
                <h3>${user.name}</h3>
                <p>${roleLabel[user.role] || user.role}</p>
                <div class="mini-metrics">
                  <span><strong>${user.role === "admin" ? "Все" : user.groups.length}</strong>${user.role === "parent" ? "дети" : "группы"}</span>
                  <span><strong>${count}</strong>${user.role === "parent" ? "детей" : "учеников"}</span>
                  <span><strong>${user.email}</strong>email</span>
                  <span><strong>${user.phone || "не указан"}</strong>телефон</span>
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
        <div class="list-row"><strong>Родитель</strong><small>Только привязанные дети, посещения, абонемент, новости, фидбек и отзывы по урокам.</small></div>
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
          ${isAdmin() ? `<button class="button danger compact" data-reset-xp="${mentor.name}" type="button">Сброс XP</button>` : ""}
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
  document.querySelectorAll("[data-edit-student]").forEach((button) => {
    button.addEventListener("click", () => openStudentModal(Number(button.dataset.editStudent)));
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
  document.querySelectorAll("[data-delete-payment]").forEach((button) => {
    button.addEventListener("click", () => deletePayment(Number(button.dataset.deletePayment)));
  });
  document.querySelectorAll("[data-delete-expense]").forEach((button) => {
    button.addEventListener("click", () => deleteRecord("expense", Number(button.dataset.deleteExpense)));
  });
  document.querySelectorAll("[data-toggle-attendance]").forEach((button) => {
    button.addEventListener("click", () => toggleAttendance(button.dataset.toggleAttendance));
  });
  document.querySelectorAll("[data-add-attendance-student]").forEach((button) => {
    button.addEventListener("click", () => openAttendanceModal(Number(button.dataset.addAttendanceStudent)));
  });
  document.querySelectorAll("[data-attendance-history]").forEach((button) => {
    button.addEventListener("click", () => openAttendanceHistoryModal(Number(button.dataset.attendanceHistory)));
  });
  document.querySelectorAll("[data-attendance-qr]").forEach((button) => {
    button.addEventListener("click", () => openQrAttendanceModal(Number(button.dataset.attendanceQr)));
  });
  document.querySelector("[data-unified-qr]")?.addEventListener("click", openUnifiedQrModal);
  document.querySelectorAll("[data-open-parent-qr-scan]").forEach((button) => {
    button.addEventListener("click", openParentQrScanModal);
  });
  document.querySelectorAll("[data-parent-messages]").forEach((button) => {
    button.addEventListener("click", () => openParentMessagesModal(Number(button.dataset.parentMessages)));
  });
  document.querySelector("[data-add-student]")?.addEventListener("click", openStudentModal);
  document.querySelector("[data-add-user]")?.addEventListener("click", openUserModal);
  document.querySelector("[data-edit-profile]")?.addEventListener("click", openProfileModal);
  document.querySelector("[data-add-task]")?.addEventListener("click", openTaskModal);
  document.querySelector("[data-add-schedule]")?.addEventListener("click", openScheduleModal);
  document.querySelector("[data-add-trial]")?.addEventListener("click", openTrialModal);
  document.querySelector("[data-add-salary]")?.addEventListener("click", openSalaryModal);
  document.querySelector("[data-add-method]")?.addEventListener("click", openMethodModal);
  document.querySelectorAll("[data-task-status]").forEach((select) => {
    select.addEventListener("change", () => updateTaskStatus(Number(select.dataset.taskStatus), select.value));
  });
  document.querySelectorAll("[data-trial-status]").forEach((select) => {
    select.addEventListener("change", () => updateTrialStatus(Number(select.dataset.trialStatus), select.value));
  });
  document.querySelectorAll("[data-delete-schedule]").forEach((button) => {
    button.addEventListener("click", () => deleteRecord("schedule", Number(button.dataset.deleteSchedule)));
  });
  document.querySelectorAll("[data-start-lesson]").forEach((button) => {
    button.addEventListener("click", () => openLessonModeModal(Number(button.dataset.startLesson)));
  });
  document.querySelectorAll("[data-resume-lesson]").forEach((button) => {
    button.addEventListener("click", () => openLessonModeModal(Number(button.dataset.resumeLesson), { keepSession: true }));
  });
  document.querySelector("[data-end-active-lesson]")?.addEventListener("click", () => {
    clearActiveLessonSession();
    render();
  });
  document.querySelectorAll("[data-delete-trial]").forEach((button) => {
    button.addEventListener("click", () => deleteRecord("trial", Number(button.dataset.deleteTrial)));
  });
  document.querySelectorAll("[data-delete-salary]").forEach((button) => {
    button.addEventListener("click", () => deleteRecord("salary", Number(button.dataset.deleteSalary)));
  });
  document.querySelectorAll("[data-delete-method]").forEach((button) => {
    button.addEventListener("click", () => deleteRecord("method", Number(button.dataset.deleteMethod)));
  });
  document.querySelectorAll("[data-delete-announcement]").forEach((button) => {
    button.addEventListener("click", () => deleteRecord("announcement", Number(button.dataset.deleteAnnouncement)));
  });
  document.querySelectorAll("[data-homework-done]").forEach((button) => {
    button.addEventListener("click", () => updateHomeworkStatus(Number(button.dataset.homeworkDone), "done"));
  });
  document.querySelectorAll("[data-homework-toggle]").forEach((button) => {
    const [id, status] = button.dataset.homeworkToggle.split(":");
    button.addEventListener("click", () => updateHomeworkStatus(Number(id), status));
  });
  document.querySelectorAll("[data-delete-homework]").forEach((button) => {
    button.addEventListener("click", () => deleteHomework(Number(button.dataset.deleteHomework)));
  });
  document.querySelectorAll("[data-delete-photo-report]").forEach((button) => {
    button.addEventListener("click", () => deletePhotoReport(Number(button.dataset.deletePhotoReport)));
  });
  document.querySelectorAll("[data-view-certificate]").forEach((button) => {
    button.addEventListener("click", () => openCertificatePreview(Number(button.dataset.viewCertificate)));
  });
  document.querySelectorAll("[data-delete-certificate]").forEach((button) => {
    button.addEventListener("click", () => deleteRecord("certificate", Number(button.dataset.deleteCertificate)));
  });
  document.querySelectorAll("[data-add-lesson-check]").forEach((button) => {
    button.addEventListener("click", () => openLessonCheckModal(button.dataset.addLessonCheck || ""));
  });
  document.querySelectorAll("[data-adjust-xp]").forEach((button) => {
    button.addEventListener("click", () => openXpModal(button.dataset.adjustXp));
  });
  document.querySelectorAll("[data-reset-xp]").forEach((button) => {
    button.addEventListener("click", () => resetMentorXp(button.dataset.resetXp));
  });
  document.querySelector("[data-add-attendance]")?.addEventListener("click", openAttendanceModal);
  document.querySelector("[data-add-payment]")?.addEventListener("click", () => openPaymentModal());
  document.querySelector("[data-add-expense]")?.addEventListener("click", openExpenseModal);
  document.querySelector("[data-add-feedback]")?.addEventListener("click", () => openFeedbackModal());
  document.querySelector("[data-add-homework]")?.addEventListener("click", () => openHomeworkModal());
  document.querySelector("[data-add-photo-report]")?.addEventListener("click", () => openPhotoReportModal());
  document.querySelector("[data-add-certificate]")?.addEventListener("click", () => openCertificateModal());
  document.querySelector("[data-add-parent-review]")?.addEventListener("click", () => openParentReviewModal());
  document.querySelector("[data-add-announcement]")?.addEventListener("click", () => openAnnouncementModal());
  document.querySelector("[data-print-attendance]")?.addEventListener("click", printAttendanceSheet);
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
  syncStudentSubscription(studentId);
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
  const sub = subscriptionStatus(student);
  openModal(
    student.name,
    `<div class="profile-modal">
      <div class="profile-summary">
        ${stat("Группа", student.group, student.course)}
        ${stat("Абонемент", `#${sub.currentSubscriptionNumber}`, `${sub.visitLabel} · всего ${sub.totalProgressVisits}`)}
        ${stat("Прогресс", `${student.progress}%`, "текущий уровень")}
        ${stat("Оплата", sub.nextPaymentDate ? formatDate(sub.nextPaymentDate) : "не рассчитана", sub.needsPayment ? "пора напомнить" : "по графику")}
      </div>
      ${
        sub.needsDirectorLetter
          ? `<div class="list-row payment-alert-row"><strong>${sub.absent} НБ</strong><small>Первые 2 НБ не списаны. Начиная с 3-го НБ занятия списываются; родителю нужно письмо на имя директора.</small></div>`
          : ""
      }
      <div class="module-grid profile-sections">
        <section class="card">
          <div class="card-header"><h3>Контакты</h3><span class="badge ${student.status}">${statusText[student.status]}</span></div>
          <div class="card-body list">
            <div class="list-row"><strong>Родитель</strong><small>${student.parent}</small></div>
            <div class="list-row"><strong>Телефон</strong><small>${student.phone}</small></div>
            <div class="list-row"><strong>Ментор</strong><small>${student.mentor}</small></div>
            ${isAdmin() ? `<button class="button secondary" data-quick-payment="${student.id}" type="button">Добавить оплату</button>` : ""}
            ${isParent() ? `<button class="button secondary" data-quick-review="${student.id}" type="button">Оставить отзыв</button>` : ""}
          </div>
        </section>
        <section class="card">
          <div class="card-header"><h3>Фидбек</h3>${!isParent() ? `<button class="button secondary" data-quick-feedback="${student.id}" type="button">Добавить</button>` : ""}</div>
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
  modalRoot.querySelector("[data-quick-review]")?.addEventListener("click", () => {
    closeModal();
    openParentReviewModal(student.id);
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

async function openQrAttendanceModal(studentId) {
  const student = visibleStudents().find((item) => Number(item.id) === Number(studentId));
  if (!student) return;
  const today = new Date().toISOString().slice(0, 10);
  openModal(
    `QR посещение · ${student.name}`,
    `<div class="profile-modal">
      <form class="modal-form qr-form" id="qrAttendanceForm">
        <label>Дата урока<input name="date" type="date" required value="${today}" /></label>
        <button class="button primary" type="submit">Обновить QR</button>
      </form>
      <div class="qr-card" id="qrAttendanceCard">
        <div class="empty">Готовлю QR...</div>
      </div>
    </div>`,
  );
  const renderQr = async () => {
    const date = modalRoot.querySelector("#qrAttendanceForm [name='date']").value;
    const card = modalRoot.querySelector("#qrAttendanceCard");
    if (!backendEnabled) {
      card.innerHTML = `<div class="empty">QR работает только на серверной версии сайта.</div>`;
      return;
    }
    try {
      const data = await apiRequest("qr_attendance_link", { studentId, date });
      const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(data.url)}`;
      card.innerHTML = `
        <img src="${qrSrc}" alt="QR отметка посещения" />
        <strong>${formatDate(date)} · ${student.name}</strong>
        <small>После сканирования посещение автоматически станет «Был».</small>
        <button class="button ghost" data-copy-text="${data.url}" type="button">Скопировать ссылку</button>`;
      bindCopyButtons(card);
    } catch (error) {
      card.innerHTML = `<div class="empty">${error.message}</div>`;
    }
  };
  modalRoot.querySelector("#qrAttendanceForm").addEventListener("submit", (event) => {
    event.preventDefault();
    renderQr();
  });
  await renderQr();
}

function unifiedQrScanUrl() {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("scan", "attendance");
  return url.toString();
}

function openUnifiedQrModal() {
  const url = unifiedQrScanUrl();
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(url)}`;
  openModal(
    "Единый QR для посещения",
    `<div class="profile-modal">
      <div class="qr-card unified-qr-card">
        <img src="${qrSrc}" alt="Единый QR S7 Robotics" />
        <strong>Один QR для всех родителей</strong>
        <small>Родитель сканирует код, входит в свой аккаунт, выбирает ребенка и подтверждает посещение. Доступ есть только к привязанным детям.</small>
        <button class="button ghost" data-copy-text="${url}" type="button">Скопировать ссылку</button>
      </div>
      <div class="message-template">
        <strong>Как использовать в центре</strong>
        <p>Откройте этот QR на экране или распечатайте. Он не привязан к группе или ученику, поэтому подходит для всех уроков.</p>
      </div>
    </div>`,
  );
  bindCopyButtons(modalRoot);
}

function openParentQrScanModal() {
  if (!isParent()) return;
  const students = visibleStudents();
  const today = new Date().toISOString().slice(0, 10);
  openModal(
    "QR отметка посещения",
    `<form class="modal-form parent-qr-form" id="parentQrForm">
      <label style="grid-column:1/-1">Ребенок
        <select name="studentId" required>
          ${students.map((student) => `<option value="${student.id}">${student.name} · ${student.group}</option>`).join("")}
        </select>
      </label>
      <label>Дата урока<input name="date" type="date" required value="${today}" /></label>
      <div class="qr-scan-note">
        <strong>Подтверждение родителя</strong>
        <small>После нажатия в табеле появится отметка «Был». Если детей несколько, выберите нужного.</small>
      </div>
      <div class="form-actions">
        <button class="button ghost" data-close-modal type="button">Отмена</button>
        <button class="button primary" type="submit">Подтвердить посещение</button>
      </div>
    </form>`,
  );
  const form = modalRoot.querySelector("#parentQrForm");
  if (!students.length) {
    form.innerHTML = `<div class="empty">К аккаунту пока не привязаны дети. Обратитесь к администратору.</div>`;
    return;
  }
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
    payload.studentId = Number(payload.studentId);
    if (backendEnabled) {
      await apiRequest("parent_qr_attendance", payload);
      closeModal();
      await refreshData();
      return;
    }
    state.attendance.unshift({
      id: Date.now(),
      studentId: payload.studentId,
      date: payload.date,
      status: "present",
      topic: "QR отметка родителя",
      createdBy: currentUser.name,
    });
    syncStudentSubscription(payload.studentId);
    saveState();
    closeModal();
    render();
  });
}

function openParentMessagesModal(studentId) {
  const student = visibleStudents().find((item) => Number(item.id) === Number(studentId));
  if (!student) return;
  const sub = subscriptionStatus(student);
  const latestFeedback = visibleFeedback().filter((note) => Number(note.studentId) === Number(student.id)).at(0);
  const templates = [
    {
      title: "Остаток абонемента",
      text: `Здравствуйте! У ${student.name} сейчас абонемент #${sub.currentSubscriptionNumber}, использовано ${sub.visitLabel}, осталось ${sub.remaining} занятий.`,
    },
    {
      title: "3 НБ и письмо директору",
      text: `Здравствуйте! У ${student.name} уже ${sub.absent} НБ. По правилам центра нужно направить письмо на имя директора. Начиная с 3-го НБ занятия списываются с абонемента.`,
    },
    {
      title: "Посещение урока",
      text: `Здравствуйте! ${student.name} сегодня был(а) на занятии S7 Robotics. Спасибо за пунктуальность!`,
    },
    {
      title: "Фидбек ментора",
      text: latestFeedback
        ? `Здравствуйте! По ${student.name} есть новый фидбек от ментора: ${latestFeedback.skill}. ${latestFeedback.text}`
        : `Здравствуйте! После следующего занятия ментор добавит фидбек по прогрессу ${student.name}.`,
    },
  ];
  const phone = String(student.phone || "").replace(/\D/g, "");
  openModal(
    `Сообщения · ${student.name}`,
    `<div class="message-templates">
      ${templates
        .map(
          (item) => `
            <article class="message-template">
              <strong>${item.title}</strong>
              <p>${item.text}</p>
              <div class="row-actions">
                <button class="button ghost compact" data-copy-text="${item.text.replaceAll('"', "&quot;")}" type="button">Копировать</button>
                ${phone ? `<a class="button secondary compact" href="https://wa.me/${phone}?text=${encodeURIComponent(item.text)}" target="_blank" rel="noopener">WhatsApp</a>` : ""}
              </div>
            </article>`,
        )
        .join("")}
    </div>`,
  );
  bindCopyButtons(modalRoot);
}

function bindCopyButtons(root) {
  root.querySelectorAll("[data-copy-text]").forEach((button) => {
    button.addEventListener("click", async () => {
      const text = button.dataset.copyText || "";
      try {
        await navigator.clipboard.writeText(text);
        button.textContent = "Скопировано";
      } catch {
        button.textContent = "Выделите текст";
      }
    });
  });
}

function openAttendanceHistoryModal(studentId) {
  const student = visibleStudents().find((item) => Number(item.id) === Number(studentId));
  if (!student) return;
  const sub = subscriptionStatus(student);
  let absentCount = 0;
  let billableIndex = 0;
  const rows = studentAttendanceSince(student.id, sub.startDate).map((record) => {
    let subscriptionLabel = "бесплатное НБ";
    let slotLabel = "-";
    if (record.status === "present") {
      billableIndex += 1;
      subscriptionLabel = `#${(student.subscriptionNumber || 1) + Math.floor((billableIndex - 1) / 8)}`;
      slotLabel = `${((billableIndex - 1) % 8) + 1}/8`;
    } else if (record.status === "absent") {
      absentCount += 1;
      if (absentCount > 2) {
        billableIndex += 1;
        subscriptionLabel = `#${(student.subscriptionNumber || 1) + Math.floor((billableIndex - 1) / 8)}`;
        slotLabel = `${((billableIndex - 1) % 8) + 1}/8`;
      }
    }
    return `
      <div class="list-row attendance-history-row">
        <div>
          <strong>${formatDate(record.date)} · ${statusText[record.status]}</strong>
          <small>${record.topic || "без темы"}</small>
        </div>
        <span class="badge ${record.status}">${subscriptionLabel} · ${slotLabel}</span>
      </div>`;
  });
  openModal(
    `История посещений · ${student.name}`,
    `<div class="profile-modal">
      <div class="profile-summary">
        ${stat("Текущий", `#${sub.currentSubscriptionNumber}`, sub.visitLabel)}
        ${stat("Всего", sub.totalProgressVisits, "засчитанных занятий")}
        ${stat("Осталось", sub.remaining, "по оплатам")}
      </div>
      <div class="card-body list">
        ${rows.join("") || `<div class="empty">История посещений пока пустая</div>`}
      </div>
    </div>`,
  );
}

function openProfileModal() {
  if (!currentUser) return;
  openModal(
    "Мой профиль",
    `<form class="modal-form" id="profileForm">
      <label>ФИО<input name="name" required value="${currentUser.name || ""}" /></label>
      <label>Телефон<input name="phone" value="${currentUser.phone || ""}" placeholder="+7 777 000 00 00" /></label>
      <label style="grid-column:1/-1">Новый пароль<input name="password" type="password" minlength="4" placeholder="Оставьте пустым, если не меняете" /></label>
      <div class="form-actions">
        <button class="button ghost" data-close-modal type="button">Отмена</button>
        <button class="button primary" type="submit">Сохранить</button>
      </div>
    </form>`,
  );
  modalRoot.querySelector("#profileForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const profile = Object.fromEntries(new FormData(event.currentTarget).entries());
    if (backendEnabled) {
      await apiRequest("update_profile", profile);
      closeModal();
      await refreshData();
      return;
    }
    const user = state.users.find((item) => Number(item.id) === Number(currentUser.id));
    if (user) {
      user.name = profile.name.trim();
      user.phone = profile.phone.trim();
      if (profile.password) user.password = profile.password;
      currentUser = user;
    }
    saveState();
    closeModal();
    renderShell();
  });
}

function openUserModal() {
  if (!isAdmin()) return;
  openModal(
    "Новый аккаунт",
    `<form class="modal-form" id="userForm">
      <label>Имя<input name="name" required placeholder="Имя и фамилия" /></label>
      <label>Телефон<input name="phone" placeholder="+7 777 000 00 00" /></label>
      <label>Email<input name="email" type="email" required placeholder="mentor@s7.kz" /></label>
      <label>Пароль<input name="password" type="password" required minlength="4" placeholder="Временный пароль" /></label>
      <label>Роль<select name="role"><option value="mentor">Ментор</option><option value="parent">Родитель</option><option value="admin">Админ</option></select></label>
      <label style="grid-column:1/-1">Группы ментора<input name="groups" placeholder="A1, B2, Senior" /></label>
      <label style="grid-column:1/-1">Дети родителя
        <select name="childIds" multiple size="5">
          ${state.students.map((student) => `<option value="${student.id}">${student.name} · ${student.group}</option>`).join("")}
        </select>
      </label>
      <div class="form-actions">
        <button class="button ghost" data-close-modal type="button">Отмена</button>
        <button class="button primary" type="submit">Создать</button>
      </div>
    </form>`,
  );
  modalRoot.querySelector("#userForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const form = Object.fromEntries(formData.entries());
    const childIds = formData.getAll("childIds").map((id) => Number(id));
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
      phone: form.phone.trim(),
      email,
      password: form.password,
      role: form.role,
      groups: form.role === "mentor" ? form.groups.split(",").map((group) => group.trim()).filter(Boolean) : form.role === "parent" ? childIds : [],
      childIds,
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
  const users = isAdmin() ? state.users.filter((user) => user.role !== "parent") : [currentUser];
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

function mentorOptions(selected = "") {
  return state.users
    .filter((user) => user.role === "mentor")
    .map((user) => `<option ${user.name === selected ? "selected" : ""}>${user.name}</option>`)
    .join("");
}

function openScheduleModal() {
  if (!isAdmin()) return;
  openModal(
    "Занятие в расписании",
    `<form class="modal-form" id="scheduleForm">
      <label>День<select name="day"><option>Пн</option><option>Вт</option><option>Ср</option><option>Чт</option><option>Пт</option><option>Сб</option><option>Вс</option></select></label>
      <label>Время<input name="time" type="time" required /></label>
      <label>Группа<input name="group" required placeholder="A1, NIS, 15 мкр" /></label>
      <label>Ментор<select name="mentor">${mentorOptions()}</select></label>
      <div class="form-actions"><button class="button ghost" data-close-modal type="button">Отмена</button><button class="button primary" type="submit">Сохранить</button></div>
    </form>`,
  );
  modalRoot.querySelector("#scheduleForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const lesson = Object.fromEntries(new FormData(event.currentTarget).entries());
    if (backendEnabled) {
      await apiRequest("create_schedule", lesson);
      closeModal();
      await refreshData();
      return;
    }
    state.schedule.push({ ...lesson, id: Date.now() });
    saveState();
    closeModal();
    render();
  });
}

function openTrialModal() {
  if (!isAdmin()) return;
  const defaultSlot = findTrialSlot("A");
  openModal(
    "Запись на пробный урок",
    `<form class="modal-form" id="trialForm">
      <label>ФИО ребенка<input name="childName" required placeholder="Например, Алихан Ермек" /></label>
      <label>Родитель<input name="parentName" required placeholder="Имя родителя" /></label>
      <label>Телефон<input name="phone" required placeholder="+7 777 000 00 00" /></label>
      <label>Программа
        <select name="program" id="trialProgram">
          <option value="A">Программа A · до 7 в группе</option>
          <option value="B">Программа B · до 9 в группе</option>
        </select>
      </label>
      <label>Желаемая дата<input name="preferredDate" type="date" value="${new Date().toISOString().slice(0, 10)}" /></label>
      <label>Автослот<input id="trialSlotPreview" readonly value="${trialSlotText(defaultSlot)}" /></label>
      <label style="grid-column:1/-1">Заметка<textarea name="note" placeholder="Возраст, опыт, откуда узнали, комментарий администратора"></textarea></label>
      <div class="form-actions">
        <button class="button ghost" data-close-modal type="button">Отмена</button>
        <button class="button primary" type="submit">Записать</button>
      </div>
    </form>`,
  );
  const formEl = modalRoot.querySelector("#trialForm");
  const updatePreview = () => {
    const data = Object.fromEntries(new FormData(formEl).entries());
    modalRoot.querySelector("#trialSlotPreview").value = trialSlotText(findTrialSlot(data.program, data.preferredDate));
  };
  formEl.querySelector("#trialProgram").addEventListener("change", updatePreview);
  formEl.querySelector("[name='preferredDate']").addEventListener("change", updatePreview);
  formEl.addEventListener("submit", async (event) => {
    event.preventDefault();
    const trial = Object.fromEntries(new FormData(event.currentTarget).entries());
    const slot = findTrialSlot(trial.program, trial.preferredDate);
    if (!slot) {
      formEl.insertAdjacentHTML("afterbegin", `<div class="form-alert">Нет свободного времени для выбранной программы.</div>`);
      return;
    }
    const payload = {
      ...trial,
      id: Date.now(),
      group: slot.group,
      day: slot.day,
      time: slot.time,
      date: slot.date,
      mentor: slot.mentor,
      status: "scheduled",
      createdBy: currentUser.name,
    };
    if (backendEnabled) {
      await apiRequest("create_trial", payload);
      closeModal();
      await refreshData();
      return;
    }
    state.trialLessons.unshift(payload);
    saveState();
    closeModal();
    render();
  });
}

function trialSlotText(slot) {
  if (!slot) return "Свободного места нет";
  return `${formatDate(slot.date)} · ${slot.day} ${slot.time} · ${slot.group} (${slot.occupied}/${slot.capacity})`;
}

function openSalaryModal() {
  if (!isAdmin()) return;
  openModal(
    "Выплата ментору",
    `<form class="modal-form" id="salaryForm">
      <label>Ментор<select name="mentor">${mentorOptions()}</select></label>
      <label>Период<input name="period" required placeholder="Май 2026" /></label>
      <label>Сумма<input name="amount" type="number" required placeholder="150000" /></label>
      <label>Дата оплаты<input name="payDate" type="date" /></label>
      <label>Статус<select name="status"><option value="pending">Ожидает</option><option value="paid">Оплачено</option></select></label>
      <label style="grid-column:1/-1">Комментарий<textarea name="note" placeholder="За какие группы / часы / бонусы"></textarea></label>
      <div class="form-actions"><button class="button ghost" data-close-modal type="button">Отмена</button><button class="button primary" type="submit">Сохранить</button></div>
    </form>`,
  );
  modalRoot.querySelector("#salaryForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const salary = Object.fromEntries(new FormData(event.currentTarget).entries());
    salary.amount = Number(salary.amount);
    if (backendEnabled) {
      await apiRequest("create_salary", salary);
      closeModal();
      await refreshData();
      return;
    }
    state.salaries.unshift({ ...salary, id: Date.now() });
    saveState();
    closeModal();
    render();
  });
}

function openMethodModal() {
  if (!isAdmin()) return;
  openModal(
    "Урок / методика",
    `<form class="modal-form" id="methodForm">
      <label>Тема урока<input name="topic" required placeholder="Датчики расстояния" /></label>
      <label>Группа<input name="group" required placeholder="A1 или Все группы" /></label>
      <label>Ментор<select name="mentor"><option>любой</option>${mentorOptions()}</select></label>
      <label>Дата урока<input name="lessonDate" type="date" /></label>
      <label>Ссылка<input name="link" type="url" placeholder="https://..." /></label>
      <label>Файл / Drive<input name="fileUrl" type="url" placeholder="https://drive.google.com/..." /></label>
      <label style="grid-column:1/-1">Описание<textarea name="description" placeholder="Цель, материалы, ход урока, домашнее задание"></textarea></label>
      <div class="form-actions"><button class="button ghost" data-close-modal type="button">Отмена</button><button class="button primary" type="submit">Загрузить</button></div>
    </form>`,
  );
  modalRoot.querySelector("#methodForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const method = Object.fromEntries(new FormData(event.currentTarget).entries());
    method.mentor = method.mentor === "любой" ? "" : method.mentor;
    if (backendEnabled) {
      await apiRequest("create_method", method);
      closeModal();
      await refreshData();
      return;
    }
    state.methods.unshift({ ...method, id: Date.now() });
    saveState();
    closeModal();
    render();
  });
}

async function deleteRecord(type, id) {
  if (!isAdmin()) return;
  if (!confirm("Удалить запись?")) return;
  const map = {
    schedule: ["delete_schedule", "schedule"],
    salary: ["delete_salary", "salaries"],
    method: ["delete_method", "methods"],
    announcement: ["delete_announcement", "announcements"],
    expense: ["delete_expense", "expenses"],
    trial: ["delete_trial", "trialLessons"],
    certificate: ["delete_certificate", "certificates"],
  };
  const [action, key] = map[type];
  if (backendEnabled) {
    await apiRequest(action, { id });
    await refreshData();
    return;
  }
  state[key] = state[key].filter((item) => Number(item.id) !== Number(id));
  saveState();
  render();
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

async function updateTrialStatus(trialId, status) {
  if (backendEnabled) {
    await apiRequest("update_trial_status", { id: trialId, status });
    await refreshData();
    return;
  }
  const trial = state.trialLessons.find((item) => Number(item.id) === Number(trialId));
  if (!trial) return;
  trial.status = status;
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

async function deletePayment(paymentId) {
  const payment = state.payments.find((item) => Number(item.id) === Number(paymentId));
  if (!payment || !confirm(`Удалить оплату ${formatMoney(payment.amount)}?`)) return;
  if (backendEnabled) {
    await apiRequest("delete_payment", { id: paymentId });
    await refreshData();
    return;
  }
  state.payments = state.payments.filter((item) => Number(item.id) !== Number(paymentId));
  const student = byId(payment.studentId);
  if (student) {
    const sub = subscriptionStatus(student);
    student.lessonsLeft = sub.remaining;
    student.nextPayment = sub.startDate || student.nextPayment;
  }
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
  state.homework = (state.homework || []).filter((item) => Number(item.studentId) !== Number(studentId));
  state.photoReports = (state.photoReports || []).filter((item) => Number(item.studentId) !== Number(studentId));
  state.certificates = (state.certificates || []).filter((item) => Number(item.studentId) !== Number(studentId));
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

async function resetMentorXp(mentor) {
  if (!isAdmin() || !confirm(`Сбросить XP ментора ${mentor}?`)) return;
  if (backendEnabled) {
    await apiRequest("reset_xp", { mentor });
    await refreshData();
    return;
  }
  const mentorUser = state.users.find((user) => user.name === mentor) || { name: mentor, role: "mentor", groups: [] };
  const quality = mentorQualityStats(mentorUser);
  state.xpAdjustments.unshift({
    id: Date.now(),
    mentor,
    amount: -quality.xp,
    reason: "Сброс XP администратором",
    date: new Date().toISOString().slice(0, 10),
    createdBy: currentUser.name,
  });
  saveState();
  render();
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

function openStudentModal(studentId = null) {
  if (!isAdmin()) return;
  const editingStudent = studentId ? state.students.find((student) => Number(student.id) === Number(studentId)) : null;
  const template = document.querySelector("#studentFormTemplate").content.cloneNode(true);
  const wrapper = document.createElement("div");
  wrapper.append(template);
  openModal(editingStudent ? "Редактировать ученика" : "Новый ученик", wrapper.innerHTML);
  const paymentDateInput = modalRoot.querySelector("[name='paymentDate']");
  if (paymentDateInput) paymentDateInput.value = editingStudent?.nextPayment || new Date().toISOString().slice(0, 10);
  const mentorSelect = modalRoot.querySelector("#mentorSelect");
  const mentorOptions = state.users
    .filter((user) => user.role === "mentor")
    .map((user) => user.name);
  if (editingStudent?.mentor && !mentorOptions.includes(editingStudent.mentor)) mentorOptions.push(editingStudent.mentor);
  mentorSelect.innerHTML = mentorOptions.map((name) => `<option>${name}</option>`).join("");
  if (editingStudent) {
    modalRoot.querySelector("[name='name']").value = editingStudent.name || "";
    modalRoot.querySelector("[name='course']").value = editingStudent.course || "Программа A";
    modalRoot.querySelector("[name='group']").value = editingStudent.group || "";
    modalRoot.querySelector("[name='parent']").value = editingStudent.parent || "";
    modalRoot.querySelector("[name='phone']").value = editingStudent.phone || "";
    modalRoot.querySelector("[name='mentor']").value = editingStudent.mentor || "";
    modalRoot.querySelector("[name='status']").value = editingStudent.status || "active";
    modalRoot.querySelector("[name='subscriptionNumber']").value = editingStudent.subscriptionNumber || 1;
  }
  modalRoot.querySelector("#studentForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const student = Object.fromEntries(form.entries());
    const payload = {
      ...student,
      id: editingStudent?.id,
      lessonsLeft: editingStudent?.lessonsLeft ?? 8,
      subscriptionNumber: Number(student.subscriptionNumber || editingStudent?.subscriptionNumber || 1),
      progress: editingStudent?.progress ?? 10,
      nextPayment: student.paymentDate,
    };
    if (backendEnabled) {
      await apiRequest(editingStudent ? "update_student" : "create_student", payload);
      closeModal();
      await refreshData();
      return;
    }
    if (editingStudent) {
      Object.assign(editingStudent, payload);
      const sub = subscriptionStatus(editingStudent);
      editingStudent.lessonsLeft = sub.remaining;
      saveState();
      closeModal();
      render();
      return;
    }
    state.students.unshift({
      ...payload,
      id: Date.now(),
    });
    state.payments.unshift({
      id: Date.now() + 1,
      studentId: state.students[0].id,
      plan: "8 занятий",
      amount: 0,
      status: "paid",
      date: student.paymentDate,
    });
    saveState();
    closeModal();
    render();
  });
}

function openLessonModeModal(lessonId, options = {}) {
  if (isParent()) return;
  const lesson = visibleSchedule().find((item) => Number(item.id) === Number(lessonId));
  if (!lesson) return;
  const students = studentsForLesson(lesson);
  if (!options.keepSession) {
    startLessonSession(lesson, students);
    render();
  }
  const today = new Date().toISOString().slice(0, 10);
  const timing = lessonTimingStatus(lesson);
  openModal(
    `Урок · ${lesson.group}`,
    `<form class="lesson-mode" id="lessonModeForm">
      <div class="lesson-mode-hero">
        <div>
          <span class="badge ${timing.tone}">${timing.short}</span>
          <h3>${lesson.group} · ${lesson.time}</h3>
          <p>${lesson.day} · ${lesson.mentor} · ${students.length} учеников</p>
        </div>
        <div class="lesson-mode-score">
          <strong>${lessonReadinessScore(lesson)}%</strong>
          <small>готовность CRM</small>
        </div>
      </div>
      <div class="lesson-check-strip">
        ${lessonMicroCheck("Тема", true)}
        ${lessonMicroCheck("Посещаемость", students.length > 0)}
        ${lessonMicroCheck("Фотоотчет", false)}
        ${lessonMicroCheck("Домашка", false)}
      </div>
      <div class="modal-form">
        <label>Дата урока<input name="date" type="date" required value="${today}" /></label>
        <label>Тема урока<input name="topic" required placeholder="Например, датчики расстояния и движение" /></label>
        <label style="grid-column:1/-1">Цель урока<textarea name="goal" placeholder="Коротко: что дети должны собрать или понять к концу занятия"></textarea></label>
      </div>
      <section class="lesson-mode-section">
        <div class="section-title">
          <strong>Посещаемость</strong>
          <small>Первые 2 НБ не списываются, дальше логика абонемента сработает автоматически.</small>
        </div>
        <div class="lesson-attendance-list">
          ${students.map((student) => lessonStudentRow(student)).join("") || `<div class="empty">В этой группе пока нет учеников</div>`}
        </div>
      </section>
      <section class="lesson-mode-section">
        <div class="section-title">
          <strong>Автофидбек</strong>
          <small>Выберите короткий статус, CRM сама составит аккуратный комментарий для каждого присутствующего ученика.</small>
        </div>
        <div class="lesson-feedback-list">
          ${students.map((student) => lessonFeedbackRow(student)).join("") || `<div class="empty">Нет учеников для фидбека</div>`}
        </div>
      </section>
      <section class="lesson-mode-section">
        <div class="section-title">
          <strong>Фотоотчет родителям</strong>
          <small>Отправится всем ученикам со статусом «Был».</small>
        </div>
        <div class="modal-form">
          <label>Заголовок<input name="reportTitle" placeholder="Например, Собрали робота на датчике" /></label>
          <label>Ссылка на фото<input name="photoUrl" type="url" placeholder="https://..." /></label>
          <label style="grid-column:1/-1">Текст фотоотчета<textarea name="reportText" placeholder="Что делали, что получилось, что ребенок сможет рассказать дома"></textarea></label>
        </div>
      </section>
      <section class="lesson-mode-section">
        <div class="section-title">
          <strong>Домашнее задание</strong>
          <small>Можно выдать сразу всей группе или только тем, кто был на уроке.</small>
        </div>
        <div class="modal-form">
          <label>Название<input name="homeworkTitle" placeholder="Повторить схему движения" /></label>
          <label>Срок<input name="dueDate" type="date" /></label>
          <label>Кому<select name="homeworkAudience"><option value="all">Всем ученикам группы</option><option value="present">Только присутствующим</option></select></label>
          <label style="grid-column:1/-1">Задание<textarea name="homeworkText" placeholder="Что сделать дома или что подготовить к следующему уроку"></textarea></label>
        </div>
      </section>
      <div class="form-actions">
        <button class="button ghost" data-close-modal type="button">Отмена</button>
        <button class="button primary" type="submit">Завершить и сохранить урок</button>
      </div>
    </form>`,
  );
  modalRoot.querySelector("#lessonModeForm").addEventListener("submit", (event) => saveLessonMode(event, lesson, students));
}

function lessonMicroCheck(title, done) {
  return `<span class="${done ? "done" : ""}">${done ? "✓" : "•"} ${title}</span>`;
}

function lessonStudentRow(student) {
  const sub = subscriptionStatus(student);
  const risk = sub.needsPayment ? "payment" : sub.needsDirectorLetter ? "absence" : "";
  return `
    <label class="lesson-student-row ${risk}">
      <span>
        <strong>${student.name}</strong>
        <small>#${sub.currentSubscriptionNumber} · ${sub.visitLabel} · ${sub.remaining} осталось${risk === "payment" ? " · нужна оплата" : ""}${risk === "absence" ? " · письмо по НБ" : ""}</small>
      </span>
      <select name="attendance-${student.id}">
        <option value="present">Был</option>
        <option value="absent">НБ</option>
        <option value="skip">Не отмечать</option>
      </select>
    </label>`;
}

function lessonFeedbackRow(student) {
  return `
    <label class="lesson-feedback-row">
      <span>
        <strong>${student.name}</strong>
        <small>${programProgress(student).title} · урок ${programProgress(student).nextLesson}</small>
      </span>
      <select name="feedback-${student.id}">
        <option value="progress">Сильный прогресс</option>
        <option value="good">Хорошо работал</option>
        <option value="help">Нужна помощь</option>
        <option value="focus">Фокус и дисциплина</option>
        <option value="skip">Не добавлять</option>
      </select>
    </label>`;
}

function lessonReadinessScore(lesson) {
  const students = studentsForLesson(lesson);
  if (!students.length) return 0;
  const withPayments = students.filter((student) => !subscriptionStatus(student).expired).length;
  const withFeedback = students.filter((student) => latestFeedbackDate(student.id)).length;
  return Math.round(((withPayments + withFeedback) / (students.length * 2)) * 100);
}

async function saveLessonMode(event, lesson, students) {
  event.preventDefault();
  const form = Object.fromEntries(new FormData(event.currentTarget).entries());
  const presentIds = [];
  const attendanceItems = students
    .map((student) => {
      const status = form[`attendance-${student.id}`];
      if (status === "present") presentIds.push(Number(student.id));
      if (status === "skip") return null;
      return {
        studentId: Number(student.id),
        date: form.date,
        status,
        topic: form.topic,
      };
    })
    .filter(Boolean);
  const homeworkAudience = form.homeworkAudience === "present" ? presentIds : students.map((student) => Number(student.id));
  const shouldReport = form.reportTitle?.trim() && form.reportText?.trim() && presentIds.length;
  const shouldHomework = form.homeworkTitle?.trim() && form.homeworkText?.trim() && homeworkAudience.length;
  const feedbackItems = buildLessonFeedbackItems(form, lesson, students, presentIds);
  const taskItems = buildAfterLessonTasks(lesson, students, form, presentIds, shouldReport, shouldHomework);

  if (backendEnabled) {
    for (const item of attendanceItems) await apiRequest("create_attendance", item);
    for (const item of feedbackItems) await apiRequest("create_feedback", item);
    if (shouldReport) {
      for (const studentId of presentIds) {
        await apiRequest("create_photo_report", {
          studentId,
          date: form.date,
          title: form.reportTitle,
          text: form.reportText,
          photoUrl: form.photoUrl,
          mentor: lesson.mentor,
        });
      }
    }
    if (shouldHomework) {
      await apiRequest("create_homework", {
        studentIds: homeworkAudience,
        title: form.homeworkTitle,
        text: form.homeworkText,
        dueDate: form.dueDate,
      });
    }
    for (const task of taskItems) await apiRequest("create_task", task);
    clearActiveLessonSession();
    closeModal();
    await refreshData();
    return;
  }

  attendanceItems.forEach((item, index) => {
    const existing = state.attendance.find((record) => Number(record.studentId) === Number(item.studentId) && record.date === item.date);
    if (existing) {
      existing.status = item.status;
      existing.topic = item.topic;
    } else {
      state.attendance.unshift({ ...item, id: Date.now() + index, createdBy: currentUser.name });
    }
    syncStudentSubscription(item.studentId);
  });
  feedbackItems.forEach((item, index) => {
    state.feedback.unshift({ ...item, id: Date.now() + 50 + index });
  });
  if (shouldReport) {
    presentIds.forEach((studentId, index) => {
      state.photoReports.unshift({
        id: Date.now() + 100 + index,
        studentId,
        mentor: lesson.mentor,
        title: form.reportTitle,
        text: form.reportText,
        photoUrl: form.photoUrl,
        date: form.date,
      });
    });
  }
  if (shouldHomework) {
    homeworkAudience.forEach((studentId, index) => {
      state.homework.unshift({
        id: Date.now() + 200 + index,
        studentId,
        title: form.homeworkTitle,
        text: form.homeworkText,
        dueDate: form.dueDate,
        status: "assigned",
        createdBy: currentUser.name,
      });
    });
  }
  taskItems.forEach((task, index) => {
    state.tasks.unshift({
      ...task,
      id: Date.now() + 300 + index,
      status: "todo",
      createdBy: currentUser.name,
    });
  });
  saveState();
  clearActiveLessonSession();
  closeModal();
  render();
}

function buildLessonFeedbackItems(form, lesson, students, presentIds) {
  return students
    .filter((student) => presentIds.includes(Number(student.id)))
    .map((student) => {
      const type = form[`feedback-${student.id}`] || "skip";
      if (type === "skip") return null;
      return {
        studentId: Number(student.id),
        mentor: lesson.mentor,
        skill: feedbackSkillLabel(type),
        text: feedbackTemplateText(type, student, form),
        date: form.date,
      };
    })
    .filter(Boolean);
}

function feedbackSkillLabel(type) {
  return {
    progress: "Сильный прогресс",
    good: "Работа на уроке",
    help: "Нужна поддержка",
    focus: "Фокус и дисциплина",
  }[type] || "Фидбек урока";
}

function feedbackTemplateText(type, student, form) {
  const topic = form.topic || "теме урока";
  const goal = form.goal ? ` Цель урока: ${form.goal}` : "";
  const templates = {
    progress: `${student.name} сегодня уверенно продвинулся(ась) по теме «${topic}»: хорошо включался(ась) в практику и стал(а) ближе к самостоятельной сборке.${goal}`,
    good: `${student.name} хорошо работал(а) на уроке по теме «${topic}»: выполнял(а) задания, задавал(а) вопросы и держал(а) рабочий темп.${goal}`,
    help: `${student.name} сегодня проходил(а) тему «${topic}», но местами нужна дополнительная поддержка. На следующем уроке закрепим сложный момент и дадим больше практики.${goal}`,
    focus: `${student.name} работал(а) по теме «${topic}». Главная зона роста сейчас: внимательность к инструкции и аккуратное завершение каждого шага.${goal}`,
  };
  return templates[type] || templates.good;
}

function buildAfterLessonTasks(lesson, students, form, presentIds, hasReport, hasHomework) {
  const tasks = [];
  const today = form.date || new Date().toISOString().slice(0, 10);
  students.forEach((student) => {
    const status = form[`attendance-${student.id}`];
    const sub = subscriptionStatus(student);
    if (status === "absent") {
      tasks.push({
        title: `Связаться с родителем: ${student.name}`,
        description: `${student.name} отсутствовал(а) на уроке ${lesson.group} ${formatDate(today)}. Уточнить причину и напомнить по правилам НБ.`,
        assignee: isAdmin() ? lesson.mentor : currentUser.name,
        priority: sub.needsDirectorLetter ? "overdue" : "soon",
        dueDate: today,
      });
    }
    if (sub.needsPayment) {
      tasks.push({
        title: `Напомнить оплату: ${student.name}`,
        description: `У ${student.name} абонемент #${sub.currentSubscriptionNumber}, использовано ${sub.visitLabel}. Нужно проконтролировать оплату.`,
        assignee: isAdmin() ? lesson.mentor : currentUser.name,
        priority: sub.expired ? "overdue" : "soon",
        dueDate: today,
      });
    }
  });
  if (presentIds.length && !hasReport) {
    tasks.push({
      title: `Добавить фотоотчет: ${lesson.group}`,
      description: `После урока по теме «${form.topic || "без темы"}» не заполнен фотоотчет для родителей.`,
      assignee: isAdmin() ? lesson.mentor : currentUser.name,
      priority: "soon",
      dueDate: today,
    });
  }
  if (presentIds.length && !hasHomework) {
    tasks.push({
      title: `Проверить домашку: ${lesson.group}`,
      description: "Домашнее задание не выдано. Если оно не нужно, задачу можно закрыть.",
      assignee: isAdmin() ? lesson.mentor : currentUser.name,
      priority: "active",
      dueDate: today,
    });
  }
  return tasks;
}

function openAttendanceModal(selectedStudentId = null) {
  openModal(
    "Новая отметка",
    `<form class="modal-form" id="attendanceForm">
      ${studentSelectField(visibleStudents(), selectedStudentId)}
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
    syncStudentSubscription(item.studentId);
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
    const student = state.students.find((item) => Number(item.id) === Number(payload.studentId));
    if (student) {
      student.nextPayment = payload.date;
      syncStudentSubscription(student.id);
    }
    saveState();
    closeModal();
    render();
  });
}

function openExpenseModal() {
  if (!isAdmin()) return;
  openModal(
    "Новая трата",
    `<form class="modal-form" id="expenseForm">
      <label>Название<input name="title" required placeholder="Например: набор Arduino" /></label>
      <label>Сумма<input name="amount" type="number" min="0" required placeholder="35000" /></label>
      <label>Категория
        <select name="category">
          <option value="equipment">Оборудование</option>
          <option value="salary">Зарплата</option>
          <option value="rent">Аренда</option>
          <option value="marketing">Маркетинг</option>
          <option value="utilities">Коммунальные</option>
          <option value="other">Другое</option>
        </select>
      </label>
      <label>Дата<input name="date" type="date" required value="${new Date().toISOString().slice(0, 10)}" /></label>
      <label style="grid-column:1/-1">Пояснение<textarea name="note" placeholder="Зачем потратили, номер чека, кто согласовал"></textarea></label>
      <div class="form-actions"><button class="button ghost" data-close-modal type="button">Отмена</button><button class="button primary" type="submit">Сохранить</button></div>
    </form>`,
  );
  modalRoot.querySelector("#expenseForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const expense = Object.fromEntries(new FormData(event.currentTarget).entries());
    const payload = {
      ...expense,
      amount: Number(expense.amount),
    };
    if (backendEnabled) {
      await apiRequest("create_expense", payload);
      closeModal();
      await refreshData();
      return;
    }
    state.expenses.unshift({
      ...payload,
      id: Date.now(),
      createdBy: currentUser.name,
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

function openParentReviewModal(selectedStudentId = null) {
  const students = visibleStudents();
  if (!students.length) return;
  openModal(
    "Отзыв родителя по уроку",
    `<form class="modal-form" id="parentReviewForm">
      ${studentSelectField(students, selectedStudentId)}
      <label>Оценка
        <select name="rating">
          <option value="5">5 · отлично</option>
          <option value="4">4 · хорошо</option>
          <option value="3">3 · нормально</option>
          <option value="2">2 · нужно внимание</option>
          <option value="1">1 · проблема</option>
        </select>
      </label>
      <label>Дата<input name="date" type="date" required value="${new Date().toISOString().slice(0, 10)}" /></label>
      <label style="grid-column:1/-1">Отзыв<textarea name="text" required placeholder="Что понравилось на уроке, что ребенок рассказал дома, что нужно улучшить"></textarea></label>
      <div class="form-actions"><button class="button ghost" data-close-modal type="button">Отмена</button><button class="button primary" type="submit">Отправить</button></div>
    </form>`,
  );
  modalRoot.querySelector("#parentReviewForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const review = Object.fromEntries(new FormData(event.currentTarget).entries());
    review.studentId = Number(review.studentId);
    review.rating = Number(review.rating);
    const student = byId(review.studentId);
    if (backendEnabled) {
      await apiRequest("create_parent_review", review);
      closeModal();
      await refreshData();
      return;
    }
    state.parentReviews.unshift({
      ...review,
      id: Date.now(),
      parentId: currentUser.id,
      mentor: student?.mentor || "",
      bonusPoints: review.rating * 10,
    });
    saveState();
    closeModal();
    render();
  });
}

function openHomeworkModal() {
  if (isParent()) return;
  const students = visibleStudents();
  openModal(
    "Домашнее задание",
    `<form class="modal-form" id="homeworkForm">
      <label style="grid-column:1/-1">Ученики
        <select name="studentIds" multiple size="6" required>
          ${students.map((student) => `<option value="${student.id}">${student.name} · ${student.group}</option>`).join("")}
        </select>
      </label>
      <label>Название<input name="title" required placeholder="Например, собрать модель манипулятора" /></label>
      <label>Срок<input name="dueDate" type="date" /></label>
      <label style="grid-column:1/-1">Задание<textarea name="text" required placeholder="Что сделать дома, что принести, ссылку на материал"></textarea></label>
      <div class="form-actions"><button class="button ghost" data-close-modal type="button">Отмена</button><button class="button primary" type="submit">Выдать</button></div>
    </form>`,
  );
  modalRoot.querySelector("#homeworkForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const form = Object.fromEntries(formData.entries());
    const studentIds = formData.getAll("studentIds").map(Number);
    const payload = { ...form, studentIds };
    if (backendEnabled) {
      await apiRequest("create_homework", payload);
      closeModal();
      await refreshData();
      return;
    }
    studentIds.forEach((studentId, index) => {
      state.homework.unshift({
        id: Date.now() + index,
        studentId,
        title: form.title,
        text: form.text,
        dueDate: form.dueDate,
        status: "assigned",
        createdBy: currentUser.name,
      });
    });
    saveState();
    closeModal();
    render();
  });
}

async function updateHomeworkStatus(homeworkId, status = "done") {
  const item = (state.homework || []).find((homework) => Number(homework.id) === Number(homeworkId));
  if (!item) return;
  if (backendEnabled) {
    await apiRequest("update_homework_status", { id: homeworkId, status });
    await refreshData();
    return;
  }
  item.status = status;
  saveState();
  render();
}

async function deleteHomework(homeworkId) {
  if (isParent() || !confirm("Удалить домашнее задание?")) return;
  if (backendEnabled) {
    await apiRequest("delete_homework", { id: homeworkId });
    await refreshData();
    return;
  }
  state.homework = (state.homework || []).filter((item) => Number(item.id) !== Number(homeworkId));
  saveState();
  render();
}

function openPhotoReportModal() {
  if (isParent()) return;
  openModal(
    "Фотоотчет урока",
    `<form class="modal-form" id="photoReportForm">
      ${studentSelectField(visibleStudents())}
      <label>Дата<input name="date" type="date" required value="${new Date().toISOString().slice(0, 10)}" /></label>
      <label>Заголовок<input name="title" required placeholder="Например, Робот на ультразвуковом датчике" /></label>
      <label>Ссылка на фото<input name="photoUrl" type="url" placeholder="https://..." /></label>
      <label style="grid-column:1/-1">Описание<textarea name="text" required placeholder="Что делали на уроке, что получилось, следующий шаг"></textarea></label>
      <div class="form-actions"><button class="button ghost" data-close-modal type="button">Отмена</button><button class="button primary" type="submit">Опубликовать</button></div>
    </form>`,
  );
  modalRoot.querySelector("#photoReportForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const report = Object.fromEntries(new FormData(event.currentTarget).entries());
    const payload = {
      ...report,
      studentId: Number(report.studentId),
      mentor: currentUser.name,
    };
    if (backendEnabled) {
      await apiRequest("create_photo_report", payload);
      closeModal();
      await refreshData();
      return;
    }
    state.photoReports.unshift({ ...payload, id: Date.now() });
    saveState();
    closeModal();
    render();
  });
}

async function deletePhotoReport(reportId) {
  if (isParent() || !confirm("Удалить фотоотчет?")) return;
  if (backendEnabled) {
    await apiRequest("delete_photo_report", { id: reportId });
    await refreshData();
    return;
  }
  state.photoReports = (state.photoReports || []).filter((item) => Number(item.id) !== Number(reportId));
  saveState();
  render();
}

function openCertificateModal() {
  if (!isAdmin()) return;
  const students = visibleStudents();
  const today = new Date().toISOString().slice(0, 10);
  openModal(
    "Конструктор сертификата",
    `<form class="modal-form" id="certificateForm">
      ${studentSelectField(students)}
      <label>Программа<select name="program"><option value="A">Программа A</option><option value="B">Программа B</option></select></label>
      <label>Дата выдачи<input name="issuedAt" type="date" required value="${today}" /></label>
      <label>Номер<input name="certificateNo" required value="S7-${today.replaceAll("-", "").slice(2)}-${String(Date.now()).slice(-4)}" /></label>
      <label style="grid-column:1/-1">Заголовок<input name="title" required value="Сертификат об окончании программы" /></label>
      <label style="grid-column:1/-1">Комментарий<textarea name="note" placeholder="Например, успешно завершил 34 урока и защитил проект"></textarea></label>
      <div class="form-actions"><button class="button ghost" data-close-modal type="button">Отмена</button><button class="button primary" type="submit">Создать</button></div>
    </form>`,
  );
  const form = modalRoot.querySelector("#certificateForm");
  const syncProgram = () => {
    const student = byId(form.studentId.value);
    if (student) form.program.value = programTrack(student);
  };
  form.studentId.addEventListener("change", syncProgram);
  syncProgram();
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const certificate = Object.fromEntries(new FormData(event.currentTarget).entries());
    certificate.studentId = Number(certificate.studentId);
    if (backendEnabled) {
      await apiRequest("create_certificate", certificate);
      closeModal();
      await refreshData();
      const created = visibleCertificates().find((item) => item.certificateNo === certificate.certificateNo);
      if (created) openCertificatePreview(created.id);
      return;
    }
    state.certificates.unshift({ ...certificate, id: Date.now(), createdBy: currentUser.name });
    saveState();
    closeModal();
    render();
    openCertificatePreview(state.certificates[0].id);
  });
}

function openCertificatePreview(certificateId) {
  const certificate = visibleCertificates().find((item) => Number(item.id) === Number(certificateId));
  if (!certificate) return;
  const student = byId(certificate.studentId);
  const program = student ? programProgress(student) : null;
  openModal(
    "Сертификат",
    `<div class="certificate-modal">
      <div class="certificate-paper">
        <div class="certificate-top">
          <img src="assets/logo.svg" alt="S7 Robotics" />
          <span>${certificate.certificateNo}</span>
        </div>
        <p class="certificate-kicker">S7 Robotics Education Center</p>
        <h2>${certificate.title}</h2>
        <p>Настоящим подтверждается, что</p>
        <strong class="certificate-name">${student?.name || "Ученик"}</strong>
        <p>успешно завершил(а) ${programTitle(certificate.program)}${program ? ` · ${program.total} урока` : ""}</p>
        <small>${certificate.note || "За системную работу, инженерное мышление и защиту учебного проекта."}</small>
        <div class="certificate-footer">
          <span>${formatDate(certificate.issuedAt)}</span>
          <span>Директор S7 Robotics</span>
        </div>
      </div>
      <div class="form-actions certificate-actions">
        <button class="button ghost" data-close-modal type="button">Закрыть</button>
        <button class="button primary" data-print-certificate type="button">Печать</button>
      </div>
    </div>`,
  );
  modalRoot.querySelector("[data-print-certificate]").addEventListener("click", () => window.print());
}

function printAttendanceSheet() {
  const students = visibleStudents().filter((student) => attendanceGroup === "all" || student.group === attendanceGroup);
  const title = attendanceGroup === "all" ? "Все доступные группы" : attendanceGroup;
  const rows = students
    .map((student, index) => {
      const sub = subscriptionStatus(student);
      return `<tr><td>${index + 1}</td><td>${student.name}</td><td>${student.group}</td><td>${student.mentor}</td><td>#${sub.currentSubscriptionNumber} · ${sub.visitLabel}</td><td></td></tr>`;
    })
    .join("");
  const win = window.open("", "_blank", "width=900,height=700");
  if (!win) return;
  win.document.write(`
    <html><head><title>Ведомость S7 Robotics</title>
    <style>
      body{font-family:Arial,sans-serif;padding:28px;color:#10233f}
      h1{margin:0 0 4px;font-size:26px} p{margin:0 0 18px;color:#5f6f84}
      table{width:100%;border-collapse:collapse} th,td{border:1px solid #cfdceb;padding:10px;text-align:left}
      th{background:#eef6ff} .sign{height:42px}
    </style></head><body>
      <h1>S7 Robotics · ведомость посещаемости</h1>
      <p>${title} · ${formatDate(new Date().toISOString().slice(0, 10))}</p>
      <table><thead><tr><th>№</th><th>Ученик</th><th>Группа</th><th>Ментор</th><th>Абонемент</th><th>Подпись/отметка</th></tr></thead><tbody>${rows}</tbody></table>
    </body></html>
  `);
  win.document.close();
  win.focus();
  win.print();
}

function openAnnouncementModal() {
  if (!isAdmin()) return;
  openModal(
    "Новость или скидка",
    `<form class="modal-form" id="announcementForm">
      <label>Заголовок<input name="title" required placeholder="Например, Скидка за активность" /></label>
      <label>Тип<select name="kind"><option value="news">Новость</option><option value="discount">Скидка</option><option value="bonus">Бонус</option></select></label>
      <label>До даты<input name="expiresAt" type="date" /></label>
      <label style="grid-column:1/-1">Текст<textarea name="text" required placeholder="Коротко и понятно для родителей"></textarea></label>
      <div class="form-actions"><button class="button ghost" data-close-modal type="button">Отмена</button><button class="button primary" type="submit">Опубликовать</button></div>
    </form>`,
  );
  modalRoot.querySelector("#announcementForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const item = Object.fromEntries(new FormData(event.currentTarget).entries());
    if (backendEnabled) {
      await apiRequest("create_announcement", item);
      closeModal();
      await refreshData();
      return;
    }
    state.announcements.unshift({ ...item, id: Date.now() });
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
  rows.push([]);
  rows.push(["Расход", "Категория", "Сумма", "Дата", "Пояснение", "Добавил"]);
  (state.expenses || []).forEach((expense) => {
    rows.push([
      expense.title,
      expenseCategoryLabel(expense.category),
      expense.amount,
      expense.date,
      expense.note || "",
      expense.createdBy || "",
    ]);
  });
  downloadCsv("s7-finance.csv", rows);
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
  const formData = new FormData(event.currentTarget);
  const form = Object.fromEntries(formData.entries());
  const childIds = formData.getAll("childIds").map((id) => Number(id));
  const firstUser = state.users.length === 0;
  if (backendEnabled) {
    try {
      const data = await apiRequest(firstUser ? "register_first_admin" : "register_parent", {
        ...form,
        role: firstUser ? "admin" : "parent",
        childIds,
      });
      showAuthError("");
      applyAuthResponse(data);
    } catch (error) {
      showAuthError(error.message);
    }
    return;
  }
  if (state.users.some((user) => user.email.toLowerCase() === form.email.toLowerCase())) {
    showAuthError("Такой email уже зарегистрирован.");
    return;
  }
  if (!firstUser && !childIds.length) {
    showAuthError("Выберите хотя бы одного ребенка.");
    return;
  }
  const user = {
    id: Date.now(),
    name: form.name,
    phone: form.phone || "",
    email: form.email,
    password: form.password,
    role: firstUser ? "admin" : "parent",
    groups: firstUser ? [] : childIds,
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
    state.students = status.students || [];
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
