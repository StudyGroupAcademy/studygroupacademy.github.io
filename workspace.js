import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch
} from "./firestore-client.js";
import { $, $$, db, getErrorMessage, showBanner, showToast, state } from "./core.js";
import { clearData, initInsights, setData } from "./insights.js";
import { startGrades, stopGrades } from "./grades.js";
import { startNotes, stopNotes } from "./notes.js";
import { addWeeklyMinutes } from "./session.js";
import { initCalculator } from "./calculator.js";
import {
  computeStats,
  dateKey,
  describeCountdown,
  describeDue,
  escapeHTML,
  formatClock,
  formatDay,
  formatTime,
  makeCode,
  parseCards,
  shuffle
} from "./helpers.js";

const ws = {
  tasks: [],
  schoolAssignments: [],
  sessions: [],
  decks: [],
  exams: [],
  groups: [],
  taskFilter: "all",
  activeGroupId: null,
  listeners: [],
  chatListener: null,
  chatFirstRender: true,
  bound: false,
  calendarMonth: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  calendarSelected: dateKey(new Date())
};

const timer = { mode: "focus", running: false, endAt: 0, remaining: 1500, total: 1500, handle: null };
const study = { deck: null, queue: [], index: 0, flipped: false, good: 0, again: 0, total: 0 };
const baseTitle = document.title;

function userCollection(name) {
  return collection(db, "users", state.user.uid, name);
}

function userDoc(name, id) {
  return doc(db, "users", state.user.uid, name, id);
}

function toItem(snapshot) {
  const data = snapshot.data({ serverTimestamps: "estimate" });
  const date = data.createdAt && typeof data.createdAt.toDate === "function" ? data.createdAt.toDate() : null;
  return { id: snapshot.id, ...data, date };
}

function listen(reference, handler) {
  const stop = onSnapshot(
    reference,
    (snapshot) => handler(snapshot.docs.map(toItem)),
    (error) => {
      console.error("StudyGroup workspace listener failed.", error);
      showBanner(getErrorMessage(error), true);
    }
  );
  ws.listeners.push(stop);
}

async function run(task, button) {
  if (button) button.disabled = true;
  try {
    await task();
  } catch (error) {
    console.error("StudyGroup action failed.", error);
    showToast(getErrorMessage(error));
  } finally {
    if (button) button.disabled = false;
  }
}

function emptyMarkup(symbol, title, text) {
  return `<div class="empty-state"><span>${symbol}</span><strong>${title}</strong><p>${text}</p></div>`;
}

function renderStats() {
  const stats = computeStats(
    ws.sessions.map((session) => ({ minutes: Number(session.minutes) || 0, date: session.date })),
    ws.tasks
  );
  $("#stat-today").textContent = stats.today;
  $("#stat-week").textContent = stats.week;
  $("#stat-streak").textContent = stats.streak;
  $("#stat-open").textContent = stats.open;
  const peak = Math.max(60, ...stats.bars.map((bar) => bar.minutes));
  $("#week-bars").innerHTML = stats.bars.map((bar) => {
    const height = Math.max(4, Math.round((bar.minutes / peak) * 100));
    return `<div class="bar-col" title="${bar.minutes} minutes"><span class="bar-value">${bar.minutes || ""}</span><i style="height:${height}%"></i><small>${bar.label}</small></div>`;
  }).join("");
}

function sortTasks(tasks) {
  return tasks.slice().sort((first, second) => {
    if (first.done !== second.done) return first.done ? 1 : -1;
    const firstDue = first.due || "9999-12-31";
    const secondDue = second.due || "9999-12-31";
    if (firstDue !== secondDue) return firstDue < secondDue ? -1 : 1;
    if (first.time !== second.time) return (first.time || "99:99").localeCompare(second.time || "99:99");
    return (first.date?.getTime() || 0) - (second.date?.getTime() || 0);
  });
}

function renderTasks() {
  const filter = ws.taskFilter;
  const visible = sortTasks(ws.tasks).filter((task) => filter === "all" || (filter === "done" ? task.done : !task.done));
  $$("[data-task-filter]").forEach((chip) => chip.classList.toggle("is-active", chip.dataset.taskFilter === filter));
  $("#clear-done").hidden = !ws.tasks.some((task) => task.done);
  const list = $("#task-list");
  if (visible.length === 0) {
    list.innerHTML = emptyMarkup("✳", "Nothing here yet", filter === "done" ? "Finished tasks will show up here." : "Add a task above to plan your next small step.");
    renderCalendar();
    return;
  }
  list.innerHTML = visible.map((task) => {
    const overdue = !task.done && task.due && describeDue(task.due).startsWith("Overdue");
    return `<div class="item task${task.done ? " is-done" : ""}${overdue ? " is-overdue" : ""}">
      <button class="check" type="button" data-task-toggle="${task.id}" aria-label="${task.done ? "Mark as not done" : "Mark as done"}">${task.done ? "✓" : ""}</button>
      <div class="item-main"><strong>${escapeHTML(task.title)}</strong><small>${escapeHTML(task.subject)} · ${escapeHTML(describeDue(task.due))}${task.time ? ` · ${escapeHTML(formatTime(new Date(`2000-01-01T${task.time}`)))}` : ""}</small></div>
      <button class="icon-btn" type="button" data-task-delete="${task.id}" aria-label="Delete task">×</button>
    </div>`;
  }).join("");
  renderCalendar();
}

function renderCalendar() {
  const grid = $("#calendar-grid");
  if (!grid) return;
  const year = ws.calendarMonth.getFullYear();
  const month = ws.calendarMonth.getMonth();
  $("#calendar-title").textContent = ws.calendarMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const offset = (new Date(year, month, 1).getDay() + 6) % 7;
  const todayKey = dateKey(new Date());
  const cells = [];

  for (let index = 0; index < 42; index += 1) {
    const date = new Date(year, month, index - offset + 1);
    const dayKey = dateKey(date);
    const inMonth = date.getMonth() === month;
    const personalTasks = sortTasks(ws.tasks.filter((task) => task.due === dayKey)).map((task) => ({ ...task, calendarKind: "personal" }));
    const schoolTasks = ws.schoolAssignments
      .filter((assignment) => assignment.due_at && dateKey(new Date(assignment.due_at)) === dayKey)
      .map((assignment) => {
        const due = new Date(assignment.due_at);
        return {
          title: assignment.title,
          subject: assignment.subject,
          time: `${String(due.getHours()).padStart(2, "0")}:${String(due.getMinutes()).padStart(2, "0")}`,
          calendarKind: "school"
        };
      });
    const tasks = [...personalTasks, ...schoolTasks].sort((first, second) =>
      (first.time || "99:99").localeCompare(second.time || "99:99")
    );
    const events = tasks.slice(0, 2).map((task) =>
      `<span class="calendar-event${task.done ? " is-done" : ""}${task.calendarKind === "school" ? " is-school" : ""}">${task.time ? `${escapeHTML(formatTime(new Date(`2000-01-01T${task.time}`)))} ` : ""}${escapeHTML(task.subject)}: ${escapeHTML(task.title)}</span>`
    ).join("");
    const remaining = tasks.length > 2 ? `<span class="calendar-more">+${tasks.length - 2} more</span>` : "";
    cells.push(`<button type="button" class="calendar-day${inMonth ? "" : " is-outside"}${dayKey === todayKey ? " is-today" : ""}${dayKey === ws.calendarSelected ? " is-selected" : ""}" data-calendar-day="${dayKey}" aria-label="${date.toLocaleDateString()}${tasks.length ? `, ${tasks.length} planned items` : ""}">
      <span class="calendar-day-number">${date.getDate()}</span>${events}${remaining}
    </button>`);
  }
  grid.innerHTML = cells.join("");
  const selectedTasks = ws.tasks.filter((task) => task.due === ws.calendarSelected);
  const selectedSchool = ws.schoolAssignments.filter((assignment) =>
    assignment.due_at && dateKey(new Date(assignment.due_at)) === ws.calendarSelected
  );
  const selectedDate = new Date(`${ws.calendarSelected}T12:00:00`);
  const selectedCount = selectedTasks.length + selectedSchool.length;
  const schoolDetails = selectedSchool.map((assignment) => {
    const due = new Date(assignment.due_at);
    return `${assignment.subject} ${formatTime(due)}: ${assignment.title}`;
  });
  $("#calendar-selection").textContent = selectedCount
    ? `${selectedDate.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}: ${selectedCount} planned ${selectedCount === 1 ? "item" : "items"}${schoolDetails.length ? ` · Homework: ${schoolDetails.join("; ")}` : ""}.`
    : `${selectedDate.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}: no homework planned.`;
}

export function setSchoolCalendarEvents(assignments) {
  ws.schoolAssignments = Array.isArray(assignments) ? assignments : [];
  renderCalendar();
}

function sessionDay(date) {
  if (!date) return "Just now";
  const today = dateKey(new Date());
  return dateKey(date) === today ? `Today ${formatTime(date)}` : `${formatDay(dateKey(date))} ${formatTime(date)}`;
}

function renderSessions() {
  const list = $("#session-list");
  const recent = ws.sessions.slice(0, 6);
  if (recent.length === 0) {
    list.innerHTML = emptyMarkup("◔", "No sessions yet", "Finish a focus session and it will be logged here.");
    return;
  }
  list.innerHTML = recent.map((session) => `<div class="item">
    <div class="item-main"><strong>${Number(session.minutes) || 0} minutes</strong><small>${escapeHTML(session.subject)} · ${escapeHTML(sessionDay(session.date))}</small></div>
    <button class="icon-btn" type="button" data-session-delete="${session.id}" aria-label="Delete session">×</button>
  </div>`).join("");
}

function renderDecks() {
  const list = $("#deck-list");
  if (ws.decks.length === 0) {
    list.innerHTML = emptyMarkup("▤", "No decks yet", "Create a deck with the form and start testing yourself.");
    return;
  }
  const decks = ws.decks.slice().sort((first, second) => (second.date?.getTime() || 0) - (first.date?.getTime() || 0));
  list.innerHTML = decks.map((deck) => {
    const count = Array.isArray(deck.cards) ? deck.cards.length : 0;
    return `<div class="item">
      <div class="item-main"><strong>${escapeHTML(deck.name)}</strong><small>${escapeHTML(deck.subject)} · ${count} ${count === 1 ? "card" : "cards"}</small></div>
      <button class="button button-dark button-small" type="button" data-deck-study="${deck.id}">Study</button>
      <button class="icon-btn" type="button" data-deck-delete="${deck.id}" aria-label="Delete deck">×</button>
    </div>`;
  }).join("");
}

function renderExams() {
  const list = $("#exam-list");
  if (ws.exams.length === 0) {
    list.innerHTML = emptyMarkup("◷", "No exams added", "Add an exam date and watch the countdown.");
    return;
  }
  const exams = ws.exams.slice().sort((first, second) => (first.examDate < second.examDate ? -1 : 1));
  const upcoming = exams.filter((exam) => describeCountdown(exam.examDate) !== "Finished");
  const finished = exams.filter((exam) => describeCountdown(exam.examDate) === "Finished");
  list.innerHTML = upcoming.concat(finished).map((exam, index) => {
    const countdown = describeCountdown(exam.examDate);
    const isNext = index === 0 && countdown !== "Finished";
    return `<div class="item exam${isNext ? " is-next" : ""}${countdown === "Finished" ? " is-done" : ""}">
      <div class="item-main"><strong>${escapeHTML(exam.name)}</strong><small>${escapeHTML(exam.subject)} · ${escapeHTML(formatDay(exam.examDate))}</small></div>
      <span class="countdown-pill">${escapeHTML(countdown)}</span>
      <button class="icon-btn" type="button" data-exam-delete="${exam.id}" aria-label="Delete exam">×</button>
    </div>`;
  }).join("");
}

function renderGroups() {
  const list = $("#group-list");
  if (ws.groups.length === 0) {
    list.innerHTML = emptyMarkup("◎", "No groups yet", "Create one or join with an invite code.");
    return;
  }
  const groups = ws.groups.slice().sort((first, second) => String(first.name).localeCompare(String(second.name)));
  list.innerHTML = groups.map((group) => {
    const count = Array.isArray(group.memberIds) ? group.memberIds.length : 1;
    return `<button class="group-item${group.id === ws.activeGroupId ? " is-active" : ""}" type="button" data-open-group="${group.id}">
      <strong>${escapeHTML(group.name)}</strong>
      <small>${escapeHTML(group.subject)} · ${count} ${count === 1 ? "member" : "members"}${group.ownerId === state.user?.uid ? " · yours" : ""}</small>
    </button>`;
  }).join("");
}

function closeChat() {
  if (ws.chatListener) ws.chatListener();
  ws.chatListener = null;
  ws.activeGroupId = null;
  $("#chat-room").hidden = true;
  $("#chat-empty").hidden = false;
  renderGroups();
}

function syncActiveGroup() {
  if (!ws.activeGroupId) return;
  const group = ws.groups.find((entry) => entry.id === ws.activeGroupId);
  if (!group) {
    closeChat();
    return;
  }
  const count = group.memberIds.length;
  $("#chat-meta").textContent = `${group.subject} · ${count} ${count === 1 ? "member" : "members"}`;
  $("#leave-group").textContent = group.ownerId === state.user.uid ? "Delete group" : "Leave group";
}

function renderMessages(items) {
  const box = $("#chat-messages");
  const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 90;
  const ordered = items.slice().reverse();
  box.innerHTML = ordered.length
    ? ordered.map((message) => `<div class="msg${message.uid === state.user.uid ? " mine" : ""}">
        <small>${escapeHTML(message.name)}${message.date ? ` · ${formatTime(message.date)}` : ""}</small>
        <p>${escapeHTML(message.text)}</p>
      </div>`).join("")
    : '<div class="chat-hint">No messages yet. Say hello to your group.</div>';
  if (nearBottom || ws.chatFirstRender) box.scrollTop = box.scrollHeight;
  ws.chatFirstRender = false;
}

function openGroup(groupId) {
  const group = ws.groups.find((entry) => entry.id === groupId);
  if (!group) return;
  if (ws.chatListener) ws.chatListener();
  ws.activeGroupId = groupId;
  ws.chatFirstRender = true;
  $("#chat-empty").hidden = true;
  $("#chat-room").hidden = false;
  $("#chat-title").textContent = group.name;
  $("#chat-messages").innerHTML = "";
  syncActiveGroup();
  renderGroups();
  ws.chatListener = onSnapshot(
    query(collection(db, "groups", groupId, "messages"), orderBy("createdAt", "desc"), limit(60)),
    (snapshot) => renderMessages(snapshot.docs.map(toItem)),
    (error) => {
      console.error("StudyGroup chat listener failed.", error);
      showBanner(getErrorMessage(error), true);
    }
  );
}

async function createGroup(name, subject) {
  const uid = state.user.uid;
  let lastError = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const code = makeCode(crypto.getRandomValues(new Uint8Array(6)));
    const groupReference = doc(collection(db, "groups"));
    const batch = writeBatch(db);
    batch.set(groupReference, {
      name,
      subject,
      code,
      ownerId: uid,
      memberIds: [uid],
      createdAt: serverTimestamp()
    });
    batch.set(doc(db, "groupCodes", code), { groupId: groupReference.id, ownerId: uid });
    try {
      await batch.commit();
      return groupReference.id;
    } catch (error) {
      lastError = error;
      if (error.code !== "permission-denied") throw error;
    }
  }
  throw lastError;
}

async function joinGroup(rawCode) {
  const code = rawCode.trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(code)) {
    showToast("Invite codes have 6 letters and numbers.");
    return false;
  }
  const codeSnapshot = await getDoc(doc(db, "groupCodes", code));
  if (!codeSnapshot.exists()) {
    showToast("No group uses that invite code.");
    return false;
  }
  const groupId = codeSnapshot.data().groupId;
  if (ws.groups.some((group) => group.id === groupId)) {
    showToast("You're already in that group.");
    openGroup(groupId);
    return false;
  }
  await updateDoc(doc(db, "groups", groupId), { memberIds: arrayUnion(state.user.uid) });
  return true;
}

async function deleteGroup(group) {
  for (;;) {
    const snapshot = await getDocs(query(collection(db, "groups", group.id, "messages"), limit(400)));
    if (snapshot.empty) break;
    const batch = writeBatch(db);
    snapshot.docs.forEach((entry) => batch.delete(entry.ref));
    await batch.commit();
  }
  const batch = writeBatch(db);
  batch.delete(doc(db, "groups", group.id));
  batch.delete(doc(db, "groupCodes", group.code));
  await batch.commit();
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    const field = document.createElement("textarea");
    field.value = text;
    field.setAttribute("readonly", "");
    field.style.position = "fixed";
    field.style.opacity = "0";
    document.body.appendChild(field);
    field.select();
    let copied = false;
    try {
      copied = document.execCommand("copy");
    } catch (copyError) {
      copied = false;
    }
    field.remove();
    return copied;
  }
}

function boundedMinutes(input, minimum, maximum) {
  const value = Math.round(Number(input.value));
  const safe = Number.isFinite(value) ? value : minimum;
  const clamped = Math.min(maximum, Math.max(minimum, safe));
  input.value = clamped;
  return clamped * 60;
}

function lengthFor(mode) {
  return mode === "focus"
    ? boundedMinutes($("#focus-minutes"), 5, 120)
    : boundedMinutes($("#break-minutes"), 1, 30);
}

function currentRemaining() {
  return timer.running ? Math.max(0, Math.ceil((timer.endAt - Date.now()) / 1000)) : timer.remaining;
}

function renderTimer() {
  const remaining = currentRemaining();
  const clock = formatClock(remaining);
  const label = timer.mode === "focus" ? "Focus" : "Break";
  $("#timer-display").textContent = clock;
  $("#timer-label").textContent = label;
  $("#timer-toggle").textContent = timer.running ? "Pause" : remaining === timer.total ? "Start" : "Resume";
  $("#timer-ring").style.setProperty("--progress", `${((timer.total - remaining) / timer.total) * 100}%`);
  $("#timer-ring").dataset.mode = timer.mode;
  $("#timer-log").hidden = timer.mode !== "focus";
  document.title = timer.running ? `${clock} ${label} | StudyGroup` : baseTitle;
}

function setMode(mode) {
  timer.mode = mode;
  timer.total = lengthFor(mode);
  timer.remaining = timer.total;
  renderTimer();
}

function stopTicking() {
  if (timer.handle) window.clearInterval(timer.handle);
  timer.handle = null;
}

function pauseTimer() {
  if (!timer.running) return;
  timer.remaining = currentRemaining();
  timer.running = false;
  stopTicking();
  renderTimer();
}

function beep() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = 660;
    oscillator.connect(gain);
    gain.connect(context.destination);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.25, context.currentTime + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.9);
    oscillator.start();
    oscillator.stop(context.currentTime + 1);
    oscillator.onended = () => context.close();
  } catch (error) {
    console.error("The timer sound could not play.", error);
  }
}

async function logSession(minutes) {
  if (!state.user) return;
  await addDoc(userCollection("sessions"), {
    minutes,
    subject: $("#timer-subject").value,
    createdAt: serverTimestamp()
  });
  addWeeklyMinutes(minutes).catch((error) => console.error("The weekly leaderboard minutes could not be updated.", error));
}

function completeTimer() {
  const finishedMode = timer.mode;
  const minutes = Math.round(timer.total / 60);
  timer.running = false;
  stopTicking();
  beep();
  if (finishedMode === "focus") {
    run(async () => {
      await logSession(minutes);
      showToast(`Nice work. ${minutes} minutes logged. Time for a break.`);
    });
    setMode("break");
  } else {
    showToast("Break over. Ready when you are.");
    setMode("focus");
  }
}

function tick() {
  const remaining = currentRemaining();
  renderTimer();
  if (remaining <= 0) completeTimer();
}

function startTimer() {
  if (timer.running) return;
  timer.endAt = Date.now() + timer.remaining * 1000;
  timer.running = true;
  stopTicking();
  timer.handle = window.setInterval(tick, 250);
  renderTimer();
}

function resetTimer() {
  timer.running = false;
  stopTicking();
  setMode(timer.mode);
}

async function logEarly() {
  if (timer.mode !== "focus") return;
  const elapsed = timer.total - currentRemaining();
  const minutes = Math.floor(elapsed / 60);
  if (minutes < 1) {
    showToast("Study for at least a minute before logging a session.");
    return;
  }
  pauseTimer();
  await logSession(minutes);
  setMode("focus");
  showToast(`${minutes} ${minutes === 1 ? "minute" : "minutes"} logged. Well done.`);
}

function renderStudy() {
  const finished = study.index >= study.queue.length;
  $("#study-title").textContent = study.deck.name;
  $("#study-body").hidden = finished;
  $("#study-summary").hidden = !finished;
  if (finished) {
    $("#study-summary-text").textContent = `You worked through ${study.total} ${study.total === 1 ? "card" : "cards"}. ${study.good} marked as got it and ${study.again} sent back for another look.`;
    return;
  }
  const card = study.queue[study.index];
  $("#study-progress").textContent = `Card ${study.index + 1} of ${study.queue.length}`;
  $("#study-face-label").textContent = study.flipped ? "Answer" : "Question";
  $("#study-face-text").textContent = study.flipped ? card.a : card.q;
  $("#study-card").classList.toggle("is-flipped", study.flipped);
  $("#study-grade").hidden = !study.flipped;
  $("#study-flip").hidden = study.flipped;
}

function restartStudy() {
  const cards = study.deck.cards.map((card) => ({ q: String(card.q), a: String(card.a) }));
  study.queue = $("#study-shuffle").checked ? shuffle(cards) : cards;
  study.index = 0;
  study.flipped = false;
  study.good = 0;
  study.again = 0;
  study.total = cards.length;
  renderStudy();
}

function openStudy(deckId) {
  const deck = ws.decks.find((entry) => entry.id === deckId);
  if (!deck || !Array.isArray(deck.cards) || deck.cards.length === 0) return;
  study.deck = deck;
  restartStudy();
  $("#study-dialog").showModal();
}

function gradeCard(good) {
  if (study.index >= study.queue.length || !study.flipped) return;
  if (good) {
    study.good += 1;
  } else {
    study.again += 1;
    study.queue.push(study.queue[study.index]);
  }
  study.index += 1;
  study.flipped = false;
  renderStudy();
}

function activateTab(name) {
  $$("[data-tab]").forEach((tab) => {
    const active = tab.dataset.tab === name;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", String(active));
  });
  $$("[data-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.panel !== name;
  });
  try {
    localStorage.setItem("studygroup-tab", name);
  } catch (error) {
    console.error("The selected tab could not be remembered.", error);
  }
  document.dispatchEvent(new CustomEvent("studygroup:tab", { detail: name }));
}

function plain(value) {
  if (value && typeof value.toDate === "function") return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(plain);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, plain(entry)]));
  }
  return value;
}

export async function exportData() {
  const result = {
    exportedAt: new Date().toISOString(),
    profile: {
      displayName: state.profile?.displayName || "",
      leaderboardOptIn: Boolean(state.profile?.leaderboardOptIn)
    }
  };
  for (const name of ["tasks", "sessions", "decks", "exams", "notes", "scores"]) {
    const snapshot = await getDocs(query(userCollection(name), limit(500)));
    result[name] = snapshot.docs.map((entry) => ({ id: entry.id, ...plain(entry.data()) }));
  }
  return result;
}

function bindOnce(selector, event, handler) {
  const element = typeof selector === "string" ? document.querySelector(selector) : selector;
  if (!element) return; 
  element.addEventListener(event, handler);
}

export function initWorkspaceUI() {
  if (ws.bound) return;
  ws.bound = true;
  initInsights();
  initCalculator();

  $$("[data-tab]").forEach((tab) => bindOnce(tab, "click", () => activateTab(tab.dataset.tab)));

  const taskForm = $("#task-form");
  if (taskForm) {
    bindOnce(taskForm, "submit", (event) => {
      event.preventDefault();
      if (!state.user) return;
      const form = event.currentTarget;
      const title = form.elements.title.value.trim();
      if (!title) return;
      run(async () => {
        await addDoc(userCollection("tasks"), {
          title,
          subject: form.elements.subject.value,
          due: form.elements.due.value || "",
          time: form.elements.time.value || "",
          done: false,
          createdAt: serverTimestamp()
        });
        form.elements.title.value = "";
        form.elements.due.value = "";
        form.elements.time.value = "";
        form.elements.title.focus();
      }, event.submitter);
    });
  }

  const calendarGrid = $("#calendar-grid");
  if (calendarGrid) {
    bindOnce(calendarGrid, "click", (event) => {
      const day = event.target.closest("[data-calendar-day]");
      if (!day) return;
      ws.calendarSelected = day.dataset.calendarDay;
      const selected = new Date(`${ws.calendarSelected}T12:00:00`);
      ws.calendarMonth = new Date(selected.getFullYear(), selected.getMonth(), 1);
      const dueInput = $("#task-form")?.elements?.due;
      if (dueInput) dueInput.value = ws.calendarSelected;
      renderCalendar();
      const titleInput = $("#task-form")?.elements?.title;
      if (titleInput) titleInput.focus();
    });
  }

  bindOnce("#calendar-prev", "click", () => {
    ws.calendarMonth = new Date(ws.calendarMonth.getFullYear(), ws.calendarMonth.getMonth() - 1, 1);
    ws.calendarSelected = dateKey(ws.calendarMonth);
    const dueInput = $("#task-form")?.elements?.due;
    if (dueInput) dueInput.value = ws.calendarSelected;
    renderCalendar();
  });

  bindOnce("#calendar-next", "click", () => {
    ws.calendarMonth = new Date(ws.calendarMonth.getFullYear(), ws.calendarMonth.getMonth() + 1, 1);
    ws.calendarSelected = dateKey(ws.calendarMonth);
    const dueInput = $("#task-form")?.elements?.due;
    if (dueInput) dueInput.value = ws.calendarSelected;
    renderCalendar();
  });

  bindOnce("#calendar-today", "click", () => {
    const today = new Date();
    ws.calendarMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    ws.calendarSelected = dateKey(today);
    const dueInput = $("#task-form")?.elements?.due;
    if (dueInput) dueInput.value = ws.calendarSelected;
    renderCalendar();
  });

  const taskList = $("#task-list");
  if (taskList) {
    bindOnce(taskList, "click", (event) => {
      const toggle = event.target.closest("[data-task-toggle]");
      const remove = event.target.closest("[data-task-delete]");
      if (toggle) {
        const task = ws.tasks.find((entry) => entry.id === toggle.dataset.taskToggle);
        if (task) run(() => updateDoc(userDoc("tasks", task.id), { done: !task.done }));
      } else if (remove) {
        run(async () => {
          const batch = writeBatch(db);
          batch.delete(userDoc("tasks", remove.dataset.taskDelete));
          await batch.commit();
        });
      }
    });
  }

  $$("[data-task-filter]").forEach((chip) => {
    bindOnce(chip, "click", () => {
      ws.taskFilter = chip.dataset.taskFilter;
      renderTasks();
    });
  });

  bindOnce("#clear-done", "click", () => {
    const finished = ws.tasks.filter((task) => task.done);
    if (finished.length === 0) return;
    run(async () => {
      const batch = writeBatch(db);
      finished.forEach((task) => batch.delete(userDoc("tasks", task.id)));
      await batch.commit();
      showToast("Finished tasks cleared.");
    });
  });

  bindOnce("#timer-toggle", "click", () => (timer.running ? pauseTimer() : startTimer()));
  bindOnce("#timer-reset", "click", resetTimer);
  bindOnce("#timer-log", "click", (event) => run(logEarly, event.currentTarget));
  
  ["#focus-minutes", "#break-minutes"].forEach((selector) => {
    const el = $(selector);
    if (el) {
      bindOnce(el, "change", () => {
        if (!timer.running) setMode(timer.mode);
      });
    }
  });

  const sessionList = $("#session-list");
  if (sessionList) {
    bindOnce(sessionList, "click", (event) => {
      const remove = event.target.closest("[data-session-delete]");
      if (remove) run(async () => {
        const batch = writeBatch(db);
        batch.delete(userDoc("sessions", remove.dataset.sessionDelete));
        await batch.commit();
      });
    });
  }

  const deckForm = $("#deck-form");
  if (deckForm) {
    bindOnce(deckForm, "submit", (event) => {
      event.preventDefault();
      if (!state.user) return;
      const form = event.currentTarget;
      const name = form.elements.name.value.trim();
      const { cards, skipped } = parseCards(form.elements.cards.value);
      if (!name || name.length > 40) {
        showToast("Give the deck a name of up to 40 characters.");
        return;
      }
      if (cards.length === 0) {
        showToast("Add at least one card as: question | answer");
        return;
      }
      run(async () => {
        await addDoc(userCollection("decks"), {
          name,
          subject: form.elements.subject.value,
          cards,
          createdAt: serverTimestamp()
        });
        form.reset();
        showToast(skipped ? `Deck saved. ${skipped} ${skipped === 1 ? "line was" : "lines were"} skipped.` : "Deck saved.");
      }, event.submitter);
    });
  }

  const deckList = $("#deck-list");
  if (deckList) {
    bindOnce(deckList, "click", (event) => {
      const studyButton = event.target.closest("[data-deck-study]");
      const remove = event.target.closest("[data-deck-delete]");
      if (studyButton) {
        openStudy(studyButton.dataset.deckStudy);
      } else if (remove && window.confirm("Delete this deck?")) {
        run(async () => {
          const batch = writeBatch(db);
          batch.delete(userDoc("decks", remove.dataset.deckDelete));
          await batch.commit();
        });
      }
    });
  }

  bindOnce("#study-flip", "click", () => {
    study.flipped = true;
    renderStudy();
  });
  
  const studyCard = $("#study-card");
  if (studyCard) {
    bindOnce(studyCard, "click", () => {
      if (study.index >= study.queue.length) return;
      study.flipped = !study.flipped;
      renderStudy();
    });
  }

  bindOnce("#study-again", "click", () => gradeCard(false));
  bindOnce("#study-good", "click", () => gradeCard(true));
  bindOnce("#study-restart", "click", restartStudy);
  
  const studyShuffle = $("#study-shuffle");
  if (studyShuffle) {
    bindOnce(studyShuffle, "change", restartStudy);
  }

  bindOnce(document, "keydown", (event) => {
    const dialog = $("#study-dialog");
    if (!dialog || !dialog.open) return;
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      if (study.index < study.queue.length) {
        study.flipped = !study.flipped;
        renderStudy();
      }
    } else if (event.key === "ArrowRight") {
      gradeCard(true);
    } else if (event.key === "ArrowLeft") {
      gradeCard(false);
    }
  });

  const examForm = $("#exam-form");
  if (examForm) {
    bindOnce(examForm, "submit", (event) => {
      event.preventDefault();
      if (!state.user) return;
      const form = event.currentTarget;
      const name = form.elements.name.value.trim();
      const examDate = form.elements.examDate.value;
      if (!name || !examDate) return;
      run(async () => {
        await addDoc(userCollection("exams"), {
          name,
          subject: form.elements.subject.value,
          examDate,
          createdAt: serverTimestamp()
        });
        form.reset();
      }, event.submitter);
    });
  }

  const examList = $("#exam-list");
  if (examList) {
    bindOnce(examList, "click", (event) => {
      const remove = event.target.closest("[data-exam-delete]");
      if (remove) run(async () => {
        const batch = writeBatch(db);
        batch.delete(userDoc("exams", remove.dataset.examDelete));
        await batch.commit();
      });
    });
  }

  const groupForm = $("#group-form");
  if (groupForm) {
    bindOnce(groupForm, "submit", (event) => {
      event.preventDefault();
      if (!state.user) return;
      const form = event.currentTarget;
      const name = form.elements.name.value.trim();
      if (name.length < 2 || name.length > 40) {
        showToast("Group names need 2 to 40 characters.");
        return;
      }
      run(async () => {
        const groupId = await createGroup(name, form.elements.subject.value);
        form.reset();
        showToast("Group created. Share the invite code with your friends.");
        const wait = window.setInterval(() => {
          if (ws.groups.some((group) => group.id === groupId)) {
            window.clearInterval(wait);
            openGroup(groupId);
          }
        }, 100);
      }, event.submitter);
    });
  }
}
