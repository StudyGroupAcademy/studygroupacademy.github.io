import { authClient, getCurrentSession, getSessionUser } from "./auth-client.js";
import { addDoc, arrayUnion, collection, completeActivity, deleteDoc, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, syncLeaderboardXp, updateDoc, where } from "./firestore-client.js";
import { $, $$, db, state, showBanner } from "./core.js";
import { ensureUserProfile, saveDailyGoal, saveProfileChoices, takeWelcomeFlag } from "./session.js";
import { consumeOAuthCallback, describeOAuthError } from "./helpers.js";
import { initResourceFilter, setLessonUser } from "./resources.js";

const DEFAULT_SUBJECTS = ["Maths", "English", "Science", "Computer Science", "History", "Geography", "French", "Spanish"];

let currentUser = null;
let currentTab = "overview";
let currentTaskFilter = "all";
let currentBoard = "xp";
let calendarDate = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let calendarSelected = new Date().toISOString().slice(0, 10);
let activeGroupCode = null;
let activeGroupListener = null;
let activeNoteId = null;
let timerSeconds = 25 * 60;
let timerRunning = false;
let timerInterval = null;
let timerMode = "focus";
let activeDeck = null;
let cardIndex = 0;
let cardShowingAnswer = false;

export async function initDashboard() {
  bindNavigation();
  bindForms();
  bindProfileDialog();
  bindCalculator();
  bindTimer();
  bindLeaderboardTabs();
  bindNoteActions();
  bindGroupActions();
  bindSchoolActions();
  
  const welcomePending = takeWelcomeFlag();
  const oauthCallback = consumeOAuthCallback();
  if (oauthCallback.error) showBanner(describeOAuthError(oauthCallback.error), true);

  try {
    const sessionResult = await getCurrentSession({ retries: 2, retryDelay: 250 });
    if (sessionResult.error) throw sessionResult.error;
    const user = getSessionUser(sessionResult);
    currentUser = user ? { ...user, uid: user.id || user.uid } : null;
  } catch (err) {
    currentUser = null;
    showBanner(err.message || "We couldn't restore your sign-in session. Please refresh and try again.", true);
  }

  document.body.classList.remove("checking");

  if (!currentUser) {
    renderSignedOut();
    return;
  }

  await handleSignedInUser(currentUser);
  const welcomeFromProfile = takeWelcomeFlag();
  if (welcomePending || welcomeFromProfile) openProfileDialog(true);
}

async function handleSignedInUser(user) {
  currentUser = { ...user, uid: user.id || user.uid };
  state.user = currentUser;
  let profile;
  try {
    profile = await ensureUserProfile(currentUser);
  } catch (error) {
    const fallbackName = currentUser.name || currentUser.email?.split("@")[0] || "Learner";
    profile = {
      uid: currentUser.uid,
      displayName: fallbackName,
      nickname: fallbackName,
      handle: fallbackName.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 15) || "learner",
      xp: 0,
      leaderboardOptIn: false
    };
    console.error("The account profile could not be synchronised.", error);
    showBanner("You're signed in, but your profile could not be saved yet. Your account name is shown while we reconnect.", true);
  }
  state.profile = profile;
  renderSignedIn(profile);
  populateSubjectDropdowns();
  setLessonUser(user);
  initResourceFilter();
  try {
    await loadAllPanelData();
  } catch (error) {
    console.error("Some dashboard panels could not be loaded.", error);
    showBanner("Your dashboard opened, but some information could not be loaded. Check your connection and try again.", true);
  }
}

function renderSignedIn(profile) {
  const isPlaceholder = (value) => !value || ["learner", "student", "user"].includes(String(value).trim().toLowerCase());
  const name = [profile.displayName, profile.nickname, currentUser?.name, currentUser?.user_metadata?.full_name, currentUser?.user_metadata?.name].find((value) => !isPlaceholder(value)) || "StudyGroup student";
  const initial = name.charAt(0).toUpperCase();
  
  const headerName = $("#header-name");
  if (headerName) headerName.textContent = name;
  const headerInitial = $("#header-initial");
  if (headerInitial) headerInitial.textContent = initial;
  const workspaceName = $("#workspace-name");
  if (workspaceName) workspaceName.textContent = name;
  const emailElem = $("#account-email");
  if (emailElem) emailElem.textContent = currentUser?.email || "";
  const handleElem = $("#account-handle");
  if (handleElem) {
    handleElem.textContent = `@${profile.handle || "user"}`;
    handleElem.href = `${window.location.origin}/${encodeURIComponent(profile.handle || "user")}`;
    handleElem.title = "View your public profile";
  }
  const accountBadge = $("#account-badge");
  if (accountBadge) accountBadge.textContent = "Personal account";
  
  const tagElem = $("#workspace-name-tag");
  if (tagElem) {
    tagElem.hidden = !profile.leaderboardOptIn;
    tagElem.textContent = "✳";
  }

  const memberXpVal = $("#member-xp-value");
  if (memberXpVal) memberXpVal.textContent = profile.xp || 0;
  const memberJoin = $("#member-join");
  if (memberJoin) memberJoin.hidden = Boolean(profile.leaderboardOptIn);
  const memberXp = $("#member-xp");
  if (memberXp) memberXp.hidden = !profile.leaderboardOptIn;
}

function renderSignedOut() {
  const headerName = $("#header-name");
  if (headerName) headerName.textContent = "Sign in";
  const workspaceName = $("#workspace-name");
  if (workspaceName) workspaceName.textContent = "Learner";
  const emailElem = $("#account-email");
  if (emailElem) emailElem.textContent = "Not signed in";
  const handleElem = $("#account-handle");
  if (handleElem) handleElem.textContent = "Sign in to save progress";
}

function bindNavigation() {
  $$(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      const targetTab = tab.dataset.tab;
      if (!targetTab) return;
      switchTab(targetTab);
    });
  });

  const accountToggle = $("#account-toggle");
  const popover = $("#account-popover");
  if (accountToggle && popover) {
    accountToggle.addEventListener("click", (e) => {
      e.stopPropagation();
      const isHidden = popover.hidden;
      popover.hidden = !isHidden;
      accountToggle.setAttribute("aria-expanded", String(isHidden));
    });
    document.addEventListener("click", () => {
      popover.hidden = true;
      accountToggle.setAttribute("aria-expanded", "false");
    });
    popover.addEventListener("click", (e) => e.stopPropagation());
  }

  $$("[data-open-settings]").forEach((btn) => {
    btn.addEventListener("click", () => {
      $("#account-popover").hidden = true;
      openProfileDialog(false);
    });
  });

  const signOutBtn = $("#sign-out");
  if (signOutBtn) {
    signOutBtn.addEventListener("click", async () => {
      signOutBtn.disabled = true;
      try {
        const result = await authClient.signOut();
        if (result?.error) throw result.error;
        const sessionResult = await getCurrentSession();
        if (sessionResult?.error) throw sessionResult.error;
        if (getSessionUser(sessionResult)) {
          throw new Error("Your session is still active. Please try logging out again.");
        }
        state.user = null;
        state.profile = null;
        currentUser = null;
        window.location.replace(new URL("../", window.location.href).toString());
      } catch (error) {
        console.error("StudyGroup sign-out failed.", error);
        showBanner(error.message || "We couldn't sign you out. Please try again.", true);
        signOutBtn.disabled = false;
      }
    });
  }

  const downloadBtn = $("#download-data");
  if (downloadBtn) {
    downloadBtn.addEventListener("click", downloadUserData);
  }
}

function switchTab(tabName) {
  currentTab = tabName;
  $$(".tab").forEach((tab) => {
    const active = tab.dataset.tab === tabName;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", String(active));
  });
  $$(".panel").forEach((panel) => {
    panel.hidden = panel.dataset.panel !== tabName;
  });
  window.location.hash = tabName;
}

function renderPlannerCalendar(tasks = []) {
  const grid = $("#calendar-grid");
  if (!grid) return;
  const year = calendarDate.getFullYear();
  const month = calendarDate.getMonth();
  const title = $("#calendar-title");
  if (title) title.textContent = calendarDate.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const offset = (new Date(year, month, 1).getDay() + 6) % 7;
  const today = new Date().toISOString().slice(0, 10);
  const cells = [];
  for (let i = 0; i < 42; i += 1) {
    const date = new Date(year, month, i - offset + 1);
    const key = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
    const dayTasks = tasks.filter(task => task.due === key);
    cells.push(`<button type="button" class="calendar-day${date.getMonth() !== month ? " is-outside" : ""}${key === today ? " is-today" : ""}${key === calendarSelected ? " is-selected" : ""}" data-calendar-day="${key}" aria-label="${date.toLocaleDateString()}"><span class="calendar-day-number">${date.getDate()}</span>${dayTasks.slice(0,2).map(task => `<span class="calendar-event${task.completed ? " is-done" : ""}">${escapeHtml(task.title)}</span>`).join("")}${dayTasks.length > 2 ? `<span class="calendar-more">+${dayTasks.length-2} more</span>` : ""}</button>`);
  }
  grid.innerHTML = cells.join("");
  const selected = $("#calendar-selection");
  if (selected) {
    const count = tasks.filter(task => task.due === calendarSelected).length;
    selected.textContent = `${new Date(`${calendarSelected}T12:00:00`).toLocaleDateString(undefined,{weekday:"long",month:"long",day:"numeric"})}: ${count ? `${count} planned ${count === 1 ? "task" : "tasks"}` : "no tasks planned"}.`;
  }
}

function bindPlannerCalendar() {
  const grid = $("#calendar-grid");
  if (!grid || grid.dataset.bound) return;
  grid.dataset.bound = "true";
  grid.addEventListener("click", event => {
    const day = event.target.closest("[data-calendar-day]");
    if (!day) return;
    calendarSelected = day.dataset.calendarDay;
    const due = $("#task-form")?.elements?.due;
    if (due) due.value = calendarSelected;
    loadTasks();
  });
  $("#calendar-prev")?.addEventListener("click", () => { calendarDate = new Date(calendarDate.getFullYear(), calendarDate.getMonth()-1, 1); loadTasks(); });
  $("#calendar-next")?.addEventListener("click", () => { calendarDate = new Date(calendarDate.getFullYear(), calendarDate.getMonth()+1, 1); loadTasks(); });
  $("#calendar-today")?.addEventListener("click", () => { const now = new Date(); calendarDate = new Date(now.getFullYear(),now.getMonth(),1); calendarSelected = now.toISOString().slice(0,10); loadTasks(); });
  $("#clear-done")?.addEventListener("click", async () => {
    if (!currentUser) return;
    const snap = await getDocs(query(collection(db,"users",currentUser.uid,"tasks")));
    await Promise.all(snap.docs.filter(item => item.data().completed || item.data().done).map(item => deleteDoc(doc(db,"users",currentUser.uid,"tasks",item.id))));
    await loadTasks(); await loadStats();
  });
  $$ ("[data-task-filter]").forEach(button => button.addEventListener("click", () => {
    currentTaskFilter = button.dataset.taskFilter;
    $$ ("[data-task-filter]").forEach(item => item.classList.toggle("is-active", item === button));
    loadTasks();
  }));
}

function bindForms() {
  bindPlannerCalendar();
  const taskForm = $("#task-form");
  if (taskForm) {
    taskForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!currentUser) return;
      const data = new FormData(taskForm);
      const title = data.get("title").trim();
      const subject = data.get("subject");
      const due = data.get("due");
      const time = data.get("time");
      if (!title) return;

      try {
        await setDoc(doc(collection(db, "users", currentUser.uid, "tasks")), {
          title,
          subject,
          due: due || null,
          time: time || null,
          completed: false,
          done: false,
          createdAt: new Date().toISOString()
        });
        taskForm.reset();
        await loadTasks();
      } catch (err) {
        console.error("Failed to add task:", err);
      }
    });
  }

  const examForm = $("#exam-form");
  if (examForm) {
    examForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!currentUser) return;
      const data = new FormData(examForm);
      const name = data.get("name").trim();
      const subject = data.get("subject");
      const examDate = data.get("examDate");
      if (!name || !examDate) return;

      try {
        await setDoc(doc(collection(db, "users", currentUser.uid, "exams")), {
          name,
          subject,
          examDate,
          createdAt: new Date().toISOString()
        });
        examForm.reset();
        await loadExams();
      } catch (err) {
        console.error("Failed to add exam:", err);
      }
    });
  }

  const scoreForm = $("#score-form");
  if (scoreForm) {
    scoreForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!currentUser) return;
      const data = new FormData(scoreForm);
      const name = data.get("name").trim();
      const subject = data.get("subject");
      const score = Number(data.get("score"));
      const outOf = Number(data.get("outOf"));
      const takenOn = data.get("takenOn");
      if (!name || isNaN(score) || isNaN(outOf)) return;

      try {
        await setDoc(doc(collection(db, "users", currentUser.uid, "grades")), {
          name,
          subject,
          score,
          outOf,
          takenOn,
          createdAt: new Date().toISOString()
        });
        scoreForm.reset();
        await loadGrades();
      } catch (err) {
        console.error("Failed to log grade:", err);
      }
    });
  }

  const deckForm = $("#deck-form");
  if (deckForm) {
    deckForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!currentUser) return;
      const data = new FormData(deckForm);
      const name = data.get("name").trim();
      const subject = data.get("subject");
      const rawCards = data.get("cards");
      if (!name || !rawCards) return;

      const cardLines = rawCards.split("\n").map(l => l.trim()).filter(Boolean);
      const parsedCards = cardLines.map(line => {
        const [q, a] = line.split("|").map(s => s?.trim());
        return { question: q || "", answer: a || "" };
      }).filter(c => c.question && c.answer);

      if (!parsedCards.length) return;

      try {
        await setDoc(doc(collection(db, "users", currentUser.uid, "decks")), {
          name,
          subject,
          cards: parsedCards,
          createdAt: new Date().toISOString()
        });
        deckForm.reset();
        await loadDecks();
      } catch (err) {
        console.error("Failed to save deck:", err);
      }
    });
  }
}

function bindProfileDialog() {
  const dialog = $("#profile-dialog");
  const form = $("#profile-form");
  if (!dialog || !form) return;

  const closeBtn = dialog.querySelector("[data-close-dialog]");
  if (closeBtn) {
    closeBtn.addEventListener("click", () => dialog.close());
  }

  const linkGoogleBtn = $("#link-google");
  if (linkGoogleBtn) {
    linkGoogleBtn.addEventListener("click", async () => {
      try {
        const callbackBase = `${window.location.origin}${window.location.pathname}`;
        if (typeof authClient.linkSocial !== "function") {
          throw new Error("Google account linking is not available in this authentication client. Please update the Neon Auth client.");
        }
        await authClient.linkSocial({
          provider: "google",
          callbackURL: `${callbackBase}?oauth=google-linked`,
          errorCallbackURL: `${callbackBase}?error=linking-failed`
        });
      } catch (err) {
        const errBox = $("#profile-error");
        if (errBox) {
          errBox.hidden = false;
          errBox.textContent = err.message || "Failed to link Google account.";
        }
      }
    });
  }

  const boardGrid = $("#onboarding-board-grid");
  const boardOptions = ["AQA", "Edexcel", "Pearson Edexcel", "OCR", "WJEC", "Eduqas", "CCEA", "Other", "Not sure yet"];
  const onboardingSubjects = ["Maths", "English Language", "English Literature", "Biology", "Chemistry", "Physics", "Combined Science", "Computer Science", "History", "Geography", "French", "Spanish"];
  if (boardGrid && !boardGrid.dataset.ready) {
    boardGrid.innerHTML = onboardingSubjects.map((subject) => `<label>${subject}<select name="board:${subject}"><option value="">Choose exam board</option>${boardOptions.map((board) => `<option value="${board}">${board}</option>`).join("")}</select></label>`).join("");
    boardGrid.dataset.ready = "true";
  }

  const skipButton = $("#skip-onboarding");
  if (skipButton) skipButton.addEventListener("click", async () => {
    if (!currentUser) return;
    const data = new FormData(form);
    const nickname = String(data.get("nickname") || currentUser.name || currentUser.email?.split("@")[0] || "StudyGroup student").trim();
    const displayName = String(data.get("displayName") || nickname).trim();
    const handle = String(data.get("handle") || `student_${String(currentUser.uid).slice(-4)}`).trim().toLowerCase();
    const error = $("#profile-error");
    try {
      skipButton.disabled = true;
      const boards = Object.fromEntries(onboardingSubjects.map((subject) => [subject, String(data.get(`board:${subject}`) || "")]).filter(([, value]) => value));
      await saveProfileChoices({ nickname, displayName, handle, bio: String(data.get("bio") || ""), boards, yearGroup: data.get("yearGroup") || "", preferredStudyTime: data.get("preferredStudyTime") || "", studyStartTime: data.get("studyStartTime") || "", dailyGoal: data.get("dailyGoal") || "", nextExamDate: data.get("nextExamDate") || "" }, data.get("leaderboardOptIn") === "on");
      dialog.close();
      await handleSignedInUser(currentUser);
    } catch (err) {
      if (error) { error.hidden = false; error.textContent = err.message || "Couldn't save your preferences."; }
    } finally { skipButton.disabled = false; }
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!currentUser) return;
    const data = new FormData(form);
    const nickname = data.get("nickname").trim();
    const displayName = data.get("displayName").trim();
    const handle = data.get("handle").trim().toLowerCase();
    const bio = data.get("bio").trim();
    const optIn = data.get("leaderboardOptIn") === "on";
    const boards = Object.fromEntries(onboardingSubjects.map((subject) => [subject, String(data.get(`board:${subject}`) || "")]).filter(([, value]) => value));

    const errBox = $("#profile-error");
    try {
      if (errBox) errBox.hidden = true;
      await saveProfileChoices({ nickname, displayName, handle, bio, boards, yearGroup: data.get("yearGroup") || "", preferredStudyTime: data.get("preferredStudyTime") || "", studyStartTime: data.get("studyStartTime") || "", dailyGoal: data.get("dailyGoal") || "", nextExamDate: data.get("nextExamDate") || "" }, optIn);
      dialog.close();
      const snapshot = await getDoc(doc(db, "users", currentUser.uid));
      if (snapshot.exists()) {
        state.profile = snapshot.data();
        renderSignedIn(state.profile);
      }
    } catch (err) {
      if (errBox) {
        errBox.hidden = false;
        errBox.textContent = err.message || "Failed to save preferences.";
      }
    }
  });
}

async function openProfileDialog(isWelcome) {
  const dialog = $("#profile-dialog");
  const form = $("#profile-form");
  if (!dialog || !form || !currentUser) return;

  const intro = $("#profile-intro");
  if (intro) {
    intro.textContent = isWelcome ? "Welcome! Set your preferences to get started." : "Update your profile and account settings.";
  }

  try {
    const snap = await getDoc(doc(db, "users", currentUser.uid));
    if (snap.exists()) {
      const data = snap.data();
      if (form.elements["nickname"]) form.elements["nickname"].value = data.nickname || "";
      if (form.elements["displayName"]) form.elements["displayName"].value = data.displayName || "";
      if (form.elements["handle"]) form.elements["handle"].value = data.handle || "";
      if (form.elements["bio"]) form.elements["bio"].value = data.bio || "";
      if (form.elements["leaderboardOptIn"]) form.elements["leaderboardOptIn"].checked = Boolean(data.leaderboardOptIn);
      for (const [subject, board] of Object.entries(data.boards || {})) {
        const field = form.elements[`board:${subject}`];
        if (field) field.value = board;
      }
      for (const field of ["yearGroup", "preferredStudyTime", "studyStartTime", "dailyGoal", "nextExamDate"]) {
        if (form.elements[field]) form.elements[field].value = data[field] || "";
      }
    }
  } catch (err) {
    console.error("Failed to load user profile for dialog:", err);
  }

  dialog.showModal();
}

function evaluateArithmetic(expression) {
  const tokens = expression.match(/\d+(?:\.\d+)?|[()+*/-]/g) || [];
  if (tokens.join("") !== expression.replace(/\s+/g, "")) throw new Error("Invalid expression");
  let index = 0;
  const parsePrimary = () => {
    const token = tokens[index++];
    if (token === "+") return parsePrimary();
    if (token === "-") return -parsePrimary();
    if (token === "(") {
      const value = parseExpression();
      if (tokens[index++] !== ")") throw new Error("Missing closing bracket");
      return value;
    }
    if (!token || !/^\d+(?:\.\d+)?$/.test(token)) throw new Error("Expected a number");
    return Number(token);
  };
  const parseTerm = () => {
    let value = parsePrimary();
    while (tokens[index] === "*" || tokens[index] === "/") {
      const operator = tokens[index++];
      const next = parsePrimary();
      value = operator === "*" ? value * next : value / next;
    }
    return value;
  };
  const parseExpression = () => {
    let value = parseTerm();
    while (tokens[index] === "+" || tokens[index] === "-") {
      const operator = tokens[index++];
      const next = parseTerm();
      value = operator === "+" ? value + next : value - next;
    }
    return value;
  };
  if (!tokens.length) throw new Error("Empty expression");
  const result = parseExpression();
  if (index !== tokens.length) throw new Error("Unexpected token");
  return result;
}

function bindCalculator() {
  const display = $("#calculator-display");
  const result = $("#calculator-result");
  const keys = document.querySelector(".calculator-keys");
  if (!display || !result || !keys) return;

  keys.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-calculator-key]");
    if (!btn) return;
    const key = btn.dataset.calculatorKey;

    if (key === "clear") {
      display.value = "";
      result.textContent = "";
      return;
    }
    if (key === "backspace") {
      display.value = display.value.slice(0, -1);
      calculateLive();
      return;
    }
    if (key === "equals") {
      calculateLive(true);
      return;
    }
    display.value += key;
    calculateLive();
  });

  display.addEventListener("input", () => calculateLive());
  display.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      calculateLive(true);
    }
  });

  function calculateLive(commit = false) {
    const val = display.value.trim();
    if (!val) {
      result.textContent = "";
      return;
    }
    try {
      const sanitized = val.replace(/×/g, "*").replace(/÷/g, "/").replace(/%/g, "/100");
      if (!/^[\d+\-*/().\s]+$/.test(sanitized)) {
        if (commit) result.textContent = "Invalid expression";
        return;
      }
      const evaluated = evaluateArithmetic(sanitized);
      if (isNaN(evaluated) || !isFinite(evaluated)) {
        if (commit) result.textContent = "Cannot evaluate";
        return;
      }
      result.textContent = `= ${evaluated}`;
      if (commit) {
        display.value = String(evaluated);
      }
    } catch (err) {
      if (commit) result.textContent = "Error";
    }
  }
}

function bindTimer() {
  const toggleBtn = $("#timer-toggle");
  const resetBtn = $("#timer-reset");
  const logBtn = $("#timer-log");
  const focusInput = $("#focus-minutes");
  const breakInput = $("#break-minutes");
  const display = $("#timer-display");
  const label = $("#timer-label");
  const ring = $("#timer-ring");

  if (!toggleBtn || !display) return;

  toggleBtn.addEventListener("click", () => {
    if (timerRunning) {
      pauseTimer();
    } else {
      startTimer();
    }
  });

  resetBtn.addEventListener("click", () => {
    pauseTimer();
    const mins = timerMode === "focus" ? Number(focusInput?.value || 25) : Number(breakInput?.value || 5);
    timerSeconds = mins * 60;
    updateTimerDisplay();
  });

  logBtn.addEventListener("click", async () => {
    await completeSession();
  });

  function startTimer() {
    timerRunning = true;
    toggleBtn.textContent = "Pause";
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      if (timerSeconds > 0) {
        timerSeconds--;
        updateTimerDisplay();
      } else {
        clearInterval(timerInterval);
        timerRunning = false;
        toggleBtn.textContent = "Start";
        if (timerMode === "focus") {
          completeSession(true);
        }
      }
    }, 1000);
  }

  function pauseTimer() {
    timerRunning = false;
    toggleBtn.textContent = "Start";
    if (timerInterval) clearInterval(timerInterval);
  }

  function updateTimerDisplay() {
    const mins = Math.floor(timerSeconds / 60);
    const secs = timerSeconds % 60;
    display.textContent = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
}

async function completeSession(autoLogged = false) {
  if (!currentUser) return;
  const focusInput = $("#focus-minutes");
  const mins = Number(focusInput?.value || 25);
  const subjectSelect = $("#timer-subject");
  const subject = subjectSelect?.value || "Computer Science";

  try {
    await setDoc(doc(collection(db, "users", currentUser.uid, "sessions")), {
      minutes: mins,
      subject,
      autoLogged,
      createdAt: new Date().toISOString()
    });

    await loadSessions();
    await loadStats();
    
    timerRunning = false;
    const toggleBtn = $("#timer-toggle");
    if (toggleBtn) toggleBtn.textContent = "Start";
    if (timerInterval) clearInterval(timerInterval);
    timerSeconds = mins * 60;
    const minsField = $("#timer-display");
    if (minsField) minsField.textContent = `${String(mins).padStart(2, "0")}:00`;
  } catch (err) {
    console.error("Failed to log study session:", err);
  }
}

function bindLeaderboardTabs() {
  $$('[data-board]').forEach((btn) => {
    btn.addEventListener('click', () => {
      currentBoard = ['weekly', 'monthly', 'yearly'].includes(btn.dataset.board) ? btn.dataset.board : 'weekly';
      $$('[data-board]').forEach((item) => {
        const active = item.dataset.board === currentBoard;
        item.classList.toggle('is-active', active);
        item.setAttribute('aria-pressed', String(active));
      });
      loadLeaderboard();
    });
  });
  const refreshBtn = $('#refresh-leaderboard');
  if (refreshBtn) refreshBtn.addEventListener('click', loadLeaderboard);
  const joinBtn = $('#member-join button');
  if (joinBtn) joinBtn.addEventListener('click', () => openProfileDialog(false));
  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-retry-leaderboard]')) loadLeaderboard();
  });
}

function bindNoteActions() {
  const newBtn = $("#note-new");
  const form = $("#note-form");
  if (newBtn && form) {
    newBtn.addEventListener("click", () => {
      activeNoteId = null;
      form.reset();
      const status = $("#note-status");
      if (status) status.textContent = "New note";
      const delBtn = $("#note-delete");
      if (delBtn) delBtn.hidden = true;
    });

    const boardGrid = $("#onboarding-board-grid");
  const boardOptions = ["AQA", "Edexcel", "Pearson Edexcel", "OCR", "WJEC", "Eduqas", "CCEA", "Other", "Not sure yet"];
  const onboardingSubjects = ["Maths", "English Language", "English Literature", "Biology", "Chemistry", "Physics", "Combined Science", "Computer Science", "History", "Geography", "French", "Spanish"];
  if (boardGrid && !boardGrid.dataset.ready) {
    boardGrid.innerHTML = onboardingSubjects.map((subject) => `<label>${subject}<select name="board:${subject}"><option value="">Choose exam board</option>${boardOptions.map((board) => `<option value="${board}">${board}</option>`).join("")}</select></label>`).join("");
    boardGrid.dataset.ready = "true";
  }

  const skipButton = $("#skip-onboarding");
  if (skipButton) skipButton.addEventListener("click", async () => {
    if (!currentUser) return;
    const data = new FormData(form);
    const nickname = String(data.get("nickname") || currentUser.name || currentUser.email?.split("@")[0] || "StudyGroup student").trim();
    const displayName = String(data.get("displayName") || nickname).trim();
    const handle = String(data.get("handle") || `student_${String(currentUser.uid).slice(-4)}`).trim().toLowerCase();
    const error = $("#profile-error");
    try {
      skipButton.disabled = true;
      const boards = Object.fromEntries(onboardingSubjects.map((subject) => [subject, String(data.get(`board:${subject}`) || "")]).filter(([, value]) => value));
      await saveProfileChoices({ nickname, displayName, handle, bio: String(data.get("bio") || ""), boards, yearGroup: data.get("yearGroup") || "", preferredStudyTime: data.get("preferredStudyTime") || "", studyStartTime: data.get("studyStartTime") || "", dailyGoal: data.get("dailyGoal") || "", nextExamDate: data.get("nextExamDate") || "" }, data.get("leaderboardOptIn") === "on");
      dialog.close();
      await handleSignedInUser(currentUser);
    } catch (err) {
      if (error) { error.hidden = false; error.textContent = err.message || "Couldn't save your preferences."; }
    } finally { skipButton.disabled = false; }
  });

  form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!currentUser) return;
      const data = new FormData(form);
      const title = data.get("title").trim();
      const subject = data.get("subject");
      const body = data.get("body");
      if (!title) return;

      try {
        if (activeNoteId) {
          await updateDoc(doc(db, "users", currentUser.uid, "notes", activeNoteId), {
            title,
            subject,
            body,
            updatedAt: new Date().toISOString()
          });
        } else {
          await setDoc(doc(collection(db, "users", currentUser.uid, "notes")), {
            title,
            subject,
            body,
            createdAt: new Date().toISOString()
          });
        }
        form.reset();
        activeNoteId = null;
        await loadNotes();
      } catch (err) {
        console.error("Failed to save note:", err);
      }
    });

    const delBtn = $("#note-delete");
    if (delBtn) {
      delBtn.addEventListener("click", async () => {
        if (!currentUser || !activeNoteId) return;
        try {
          await deleteDoc(doc(db, "users", currentUser.uid, "notes", activeNoteId));
          form.reset();
          activeNoteId = null;
          delBtn.hidden = true;
          await loadNotes();
        } catch (err) {
          console.error("Failed to delete note:", err);
        }
      });
    }

    const searchInput = $("#note-search");
    if (searchInput) {
      searchInput.addEventListener("input", loadNotes);
    }
  }
}

function stopGroupMessages() {
  if (activeGroupListener) activeGroupListener();
  activeGroupListener = null;
}

function renderGroupMessages(snapshot) {
  const box = $("#chat-messages");
  if (!box) return;
  const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 100;
  const messages = snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
  box.innerHTML = messages.length ? messages.map((message) => {
    const mine = message.uid === currentUser?.uid;
    const sender = message.name || "StudyGroup member";
    const stamp = message.createdAt?.toDate ? message.createdAt.toDate() : message.createdAt ? new Date(message.createdAt) : null;
    const time = stamp && !Number.isNaN(stamp.getTime()) ? stamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
    const senderMarkup = message.handle ? `<a href="/?${encodeURIComponent(message.handle)}" target="_blank" rel="noopener">${escapeHtml(sender)}</a>` : escapeHtml(sender);
    return `<article class="chat-message${mine ? " mine" : ""}"><div class="chat-message-meta"><strong>${senderMarkup}</strong><time>${escapeHtml(time)}${message.editedAt ? " · edited" : ""}</time></div><p>${escapeHtml(message.text || "")}</p>${mine ? `<div class="chat-message-actions"><button type="button" data-message-edit="${escapeHtml(message.id)}">Edit</button><button type="button" data-message-delete="${escapeHtml(message.id)}">Delete</button></div>` : ""}</article>`;
  }).join("") : `<div class="chat-empty-state"><span class="chat-empty-icon">✦</span><strong>Start the conversation</strong><p>Send the first message to your study group.</p></div>`;
  if (nearBottom || box.dataset.firstRender === "true") box.scrollTop = box.scrollHeight;
  box.dataset.firstRender = "false";
}

function openGroupChat(code, name, memberCount = 1) {
  activeGroupCode = code;
  stopGroupMessages();
  const room = $("#chat-room");
  const empty = $("#chat-empty");
  if (room) room.hidden = false;
  if (empty) empty.hidden = true;
  const title = $("#chat-title");
  if (title) title.textContent = name || "Study group";
  const meta = $("#chat-meta");
  if (meta) meta.textContent = `${memberCount} ${memberCount === 1 ? "member" : "members"} · Private group`;
  const messageBox = $("#chat-messages");
  if (messageBox) {
    messageBox.innerHTML = `<div class="chat-loading">Loading messages…</div>`;
    messageBox.dataset.firstRender = "true";
  }
  const group = window.__studyGroupActiveData || {};
  const invite = group.code || code;
  const copyBtn = $("#copy-code");
  if (copyBtn) copyBtn.dataset.inviteCode = invite;
  const leaveBtn = $("#leave-group");
  if (leaveBtn) leaveBtn.textContent = group.ownerId === currentUser?.uid ? "Delete group" : "Leave group";
  activeGroupListener = onSnapshot(
    query(collection(db, "groups", code, "messages"), orderBy("createdAt", "asc"), limit(100)),
    renderGroupMessages,
    (error) => {
      console.error("Could not load group messages:", error);
      const box = $("#chat-messages");
      if (box) box.innerHTML = `<div class="chat-error">Messages could not be loaded. ${escapeHtml(error.message || "Please try again.")}</div>`;
    }
  );
}

function bindGroupActions() {
  const groupForm = $("#group-form");
  if (groupForm) groupForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!currentUser) return;
    const button = groupForm.querySelector('[type="submit"]');
    if (button) button.disabled = true;
    try {
      const data = new FormData(groupForm);
      const name = String(data.get("name") || "").trim();
      const subject = String(data.get("subject") || "").trim();
      if (name.length < 2 || !subject) return;
      const code = Array.from(crypto.getRandomValues(new Uint8Array(6)), value => "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"[value % 36]).join("");
      await setDoc(doc(db, "groups", code), {
        name, subject, code, ownerId: currentUser.uid, memberIds: [currentUser.uid], createdAt: serverTimestamp()
      });
      await setDoc(doc(db, "groupCodes", code), { groupId: code, ownerId: currentUser.uid });
      groupForm.reset();
      await loadGroups();
      window.__studyGroupActiveData = { name, subject, code, ownerId: currentUser.uid, memberIds: [currentUser.uid] };
      openGroupChat(code, name, 1);
    } catch (error) {
      console.error("Could not create study group:", error);
      showBanner(error.message || "Your group could not be created. Please try again.", true);
    } finally {
      if (button) button.disabled = false;
    }
  });

  const joinForm = $("#join-form");
  if (joinForm) joinForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!currentUser) return;
    const button = joinForm.querySelector('[type="submit"]');
    if (button) button.disabled = true;
    try {
      const code = String(new FormData(joinForm).get("code") || "").trim().toUpperCase();
      if (!/^[A-Z0-9]{6}$/.test(code)) throw new Error("Enter a valid 6-character invite code.");
      const invite = await getDoc(doc(db, "groupCodes", code));
      if (!invite.exists()) throw new Error("No study group was found for that invite code.");
      const groupId = invite.data().groupId;
      const groupRef = doc(db, "groups", groupId);
      const groupSnap = await getDoc(groupRef);
      if (!groupSnap.exists()) throw new Error("That invite code no longer points to an active group.");
      const group = groupSnap.data();
      if (!(group.memberIds || []).includes(currentUser.uid)) await updateDoc(groupRef, { memberIds: arrayUnion(currentUser.uid) });
      joinForm.reset();
      await loadGroups();
      window.__studyGroupActiveData = group;
      openGroupChat(groupId, group.name, (group.memberIds || []).length + ((group.memberIds || []).includes(currentUser.uid) ? 0 : 1));
    } catch (error) {
      console.error("Could not join study group:", error);
      showBanner(error.message || "You could not join this group. Please check the code and try again.", true);
    } finally {
      if (button) button.disabled = false;
    }
  });

  const messageBox = $("#chat-messages");
  if (messageBox) messageBox.addEventListener("click", async (event) => {
    const editButton = event.target.closest("[data-message-edit]");
    const deleteButton = event.target.closest("[data-message-delete]");
    const messageId = editButton?.dataset.messageEdit || deleteButton?.dataset.messageDelete;
    if (!messageId || !activeGroupCode) return;
    const messageRef = doc(db, "groups", activeGroupCode, "messages", messageId);
    try {
      if (editButton) {
        const snapshot = await getDoc(messageRef);
        if (!snapshot.exists() || snapshot.data().uid !== currentUser.uid) throw new Error("You can only edit your own messages.");
        const nextText = window.prompt("Edit your message", snapshot.data().text || "");
        if (nextText === null) return;
        const cleaned = nextText.trim().slice(0, 500);
        if (!cleaned) throw new Error("A message cannot be empty.");
        await updateDoc(messageRef, { text: cleaned, editedAt: new Date().toISOString() });
      } else if (window.confirm("Delete this message?")) {
        const snapshot = await getDoc(messageRef);
        if (!snapshot.exists() || snapshot.data().uid !== currentUser.uid) throw new Error("You can only delete your own messages.");
        await deleteDoc(messageRef);
      }
    } catch (error) {
      showBanner(error.message || "That message could not be changed.", true);
    }
  });

  const chatForm = $("#chat-form");
  if (chatForm) chatForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!currentUser || !activeGroupCode) return;
    const input = chatForm.elements.text;
    const text = String(input.value || "").trim();
    if (!text) return;
    const button = chatForm.querySelector('[type="submit"]');
    if (button) button.disabled = true;
    try {
      const profile = await getDoc(doc(db, "users", currentUser.uid));
      const profileData = profile.exists() ? profile.data() : {};
      const name = String(profileData.displayName || profileData.nickname || currentUser.name || "Learner").slice(0, 24);
      await addDoc(collection(db, "groups", activeGroupCode, "messages"), {
        uid: currentUser.uid, name, handle: profileData.handle || "", text: text.slice(0, 500), createdAt: serverTimestamp()
      });
      input.value = "";
      input.focus();
    } catch (error) {
      console.error("Could not send group message:", error);
      showBanner(error.message || "Your message could not be sent. Please try again.", true);
    } finally {
      if (button) button.disabled = false;
    }
  });

  const copyBtn = $("#copy-code");
  if (copyBtn) copyBtn.addEventListener("click", async () => {
    const code = copyBtn.dataset.inviteCode || activeGroupCode;
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      copyBtn.textContent = "Copied";
      setTimeout(() => { copyBtn.textContent = "Copy invite code"; }, 1600);
    } catch (error) {
      showBanner("Could not copy the invite code. You can select it from the group details.", true);
    }
  });

  const leaveBtn = $("#leave-group");
  if (leaveBtn) leaveBtn.addEventListener("click", async () => {
    if (!currentUser || !activeGroupCode) return;
    const groupId = activeGroupCode;
    const group = window.__studyGroupActiveData || {};
    leaveBtn.disabled = true;
    try {
      const ref = doc(db, "groups", groupId);
      const snap = await getDoc(ref);
      if (!snap.exists()) throw new Error("This group no longer exists.");
      const data = snap.data();
      if (data.ownerId === currentUser.uid) {
        const messages = await getDocs(query(collection(db, "groups", groupId, "messages"), limit(400)));
        for (const message of messages.docs) await deleteDoc(message.ref);
        await deleteDoc(ref);
        await deleteDoc(doc(db, "groupCodes", data.code || groupId));
      } else {
        const members = (data.memberIds || []).filter(id => id !== currentUser.uid);
        await updateDoc(ref, { memberIds: members });
      }
      stopGroupMessages();
      activeGroupCode = null;
      window.__studyGroupActiveData = null;
      $("#chat-room").hidden = true;
      $("#chat-empty").hidden = false;
      await loadGroups();
    } catch (error) {
      console.error("Could not leave study group:", error);
      showBanner(error.message || "Could not leave this group. Please try again.", true);
    } finally {
      leaveBtn.disabled = false;
    }
  });
}

function bindSchoolActions() {
  const refreshBtn = $("#school-refresh");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", loadSchoolData);
  }
}

function populateSubjectDropdowns() {
  $$("[data-subjects]").forEach((select) => {
    const currentVal = select.value;
    select.innerHTML = DEFAULT_SUBJECTS.map((sub) => `<option value="${sub}">${sub}</option>`).join("");
    if (currentVal) select.value = currentVal;
  });
}

async function loadAllPanelData() {
  await Promise.all([
    loadStats(),
    loadTasks(),
    loadExams(),
    loadGrades(),
    loadDecks(),
    loadNotes(),
    loadGroups(),
    loadLeaderboard(),
    loadSessions(),
    loadSchoolData()
  ]);
}

async function loadStats() {
  if (!currentUser) return;
  try {
    const userSnap = await getDoc(doc(db, "users", currentUser.uid));
    const userData = userSnap.exists() ? userSnap.data() : {};

    const xpElem = $("#stat-xp");
    if (xpElem) xpElem.textContent = userData.xp || 0;
    const weekElem = $("#stat-week");
    if (weekElem) weekElem.textContent = userData.weeklyMinutes || 0;

    const tasksSnap = await getDocs(query(collection(db, "users", currentUser.uid, "tasks"), where("completed", "==", false)));
    const openElem = $("#stat-open");
    if (openElem) openElem.textContent = tasksSnap.docs.length;
  } catch (err) {
    console.error("Failed to load stats:", err);
  }
}

async function loadTasks() {
  if (!currentUser) return;
  const container = $("#task-list");
  const overviewContainer = $("#overview-tasks");
  if (!container && !overviewContainer) return;

  try {
    const snap = await getDocs(query(collection(db, "users", currentUser.uid, "tasks")));
    const tasks = snap.docs.map(d => { const data = d.data(); return { id: d.id, ...data, completed: Boolean(data.completed ?? data.done) }; });

    if (container) {
      const visibleTasks = tasks.filter(task => currentTaskFilter === "all" || (currentTaskFilter === "done" ? task.completed : !task.completed));
      container.innerHTML = visibleTasks.length ? visibleTasks.map(t => `
        <div class="item-row ${t.completed ? "is-complete" : ""}">
          <label><input type="checkbox" data-task-toggle="${t.id}" ${t.completed ? "checked" : ""} /> <span>${escapeHtml(t.title)}</span></label>
          <span class="item-meta">${escapeHtml(t.subject || "")} · ${escapeHtml(t.due || "No due date")}</span>
          <button class="button button-quiet" type="button" data-task-delete="${t.id}">Delete</button>
        </div>
      `).join("") : `<p class="muted-line">No tasks added yet.</p>`;

      container.querySelectorAll("[data-task-toggle]").forEach(chk => {
        chk.addEventListener("change", async (e) => {
          const id = e.target.dataset.taskToggle;
          await updateDoc(doc(db, "users", currentUser.uid, "tasks", id), { completed: e.target.checked, done: e.target.checked });
          await loadTasks();
          await loadStats();
        });
      });

      container.querySelectorAll("[data-task-delete]").forEach(btn => {
        btn.addEventListener("click", async (e) => {
          const id = e.target.dataset.taskDelete;
          await deleteDoc(doc(db, "users", currentUser.uid, "tasks", id));
          await loadTasks();
          await loadStats();
        });
      });
    }

    renderPlannerCalendar(tasks);
    const clearDone = $("#clear-done");
    if (clearDone) clearDone.hidden = !tasks.some(task => task.completed);

    if (overviewContainer) {
      const activeTasks = tasks.filter(t => !t.completed).slice(0, 3);
      overviewContainer.innerHTML = activeTasks.length ? activeTasks.map(t => `
        <div class="today-task">
          <strong>${escapeHtml(t.title)}</strong>
          <span>${escapeHtml(t.subject || "")}</span>
        </div>
      `).join("") : `<p class="muted-line">All caught up for today!</p>`;
    }
  } catch (err) {
    console.error("Failed to load tasks:", err);
  }
}

async function loadExams() {
  if (!currentUser) return;
  const container = $("#exam-list");
  if (!container) return;

  try {
    const snap = await getDocs(query(collection(db, "users", currentUser.uid, "exams")));
    const exams = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    container.innerHTML = exams.length ? exams.map(ex => `
      <div class="item-row">
        <div><strong>${escapeHtml(ex.name)}</strong><span class="item-meta">${escapeHtml(ex.subject)} · Exam date: ${escapeHtml(ex.examDate)}</span></div>
        <button class="button button-quiet" type="button" data-exam-delete="${ex.id}">Delete</button>
      </div>
    `).join("") : `<p class="muted-line">No exams scheduled.</p>`;

    container.querySelectorAll("[data-exam-delete]").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        const id = e.target.dataset.examDelete;
        await deleteDoc(doc(db, "users", currentUser.uid, "exams", id));
        await loadExams();
      });
    });
  } catch (err) {
    console.error("Failed to load exams:", err);
  }
}

async function loadGrades() {
  if (!currentUser) return;
  const listContainer = $("#score-list");
  const summaryContainer = $("#score-summary");
  if (!listContainer || !summaryContainer) return;

  try {
    const snap = await getDocs(query(collection(db, "users", currentUser.uid, "grades")));
    const grades = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    listContainer.innerHTML = grades.length ? grades.map(g => `
      <div class="item-row">
        <div><strong>${escapeHtml(g.name)}</strong><span class="item-meta">${escapeHtml(g.subject)} · Score: ${g.score} / ${g.outOf} (${Math.round((g.score/g.outOf)*100)}%)</span></div>
        <button class="button button-quiet" type="button" data-grade-delete="${g.id}">Delete</button>
      </div>
    `).join("") : `<p class="muted-line">No results logged yet.</p>`;

    listContainer.querySelectorAll("[data-grade-delete]").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        const id = e.target.dataset.gradeDelete;
        await deleteDoc(doc(db, "users", currentUser.uid, "grades", id));
        await loadGrades();
      });
    });

    const bySubject = {};
    grades.forEach(g => {
      if (!bySubject[g.subject]) bySubject[g.subject] = { totalPct: 0, count: 0 };
      bySubject[g.subject].totalPct += (g.score / g.outOf) * 100;
      bySubject[g.subject].count++;
    });

    summaryContainer.innerHTML = Object.keys(bySubject).length ? Object.entries(bySubject).map(([sub, data]) => `
      <div class="item-row">
        <span><strong>${escapeHtml(sub)}</strong></span>
        <span>${Math.round(data.totalPct / data.count)}% average (${data.count} logged)</span>
      </div>
    `).join("") : `<p class="muted-line">No subject summaries available.</p>`;
  } catch (err) {
    console.error("Failed to load grades:", err);
  }
}

async function loadDecks() {
  if (!currentUser) return;
  const container = $("#deck-list");
  if (!container) return;

  try {
    const snap = await getDocs(query(collection(db, "users", currentUser.uid, "decks")));
    const decks = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    container.innerHTML = decks.length ? decks.map(d => `
      <div class="item-row">
        <div><strong>${escapeHtml(d.name)}</strong><span class="item-meta">${escapeHtml(d.subject)} · ${d.cards?.length || 0} cards</span></div>
        <div class="item-actions">
          <button class="button button-light" type="button" data-deck-study="${d.id}">Study</button>
          <button class="button button-quiet" type="button" data-deck-delete="${d.id}">Delete</button>
        </div>
      </div>
    `).join("") : `<p class="muted-line">No flashcard decks created.</p>`;

    container.querySelectorAll("[data-deck-study]").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const id = e.target.dataset.deckStudy;
        const deck = decks.find(d => d.id === id);
        if (deck) startFlashcardStudy(deck);
      });
    });

    container.querySelectorAll("[data-deck-delete]").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        const id = e.target.dataset.deckDelete;
        await deleteDoc(doc(db, "users", currentUser.uid, "decks", id));
        await loadDecks();
      });
    });
  } catch (err) {
    console.error("Failed to load decks:", err);
  }
}

function startFlashcardStudy(deck) {
  activeDeck = deck;
  cardIndex = 0;
  cardShowingAnswer = false;
  const dialog = $("#study-dialog");
  const title = $("#study-title");
  const body = $("#study-body");
  if (!dialog || !title || !body) return;

  title.textContent = deck.name;
  renderCard();
  dialog.showModal();

  const closeBtn = dialog.querySelector("[data-close-dialog]");
  if (closeBtn) {
    closeBtn.onclick = () => dialog.close();
  }
}

function renderCard() {
  const body = $("#study-body");
  if (!activeDeck || !body) return;
  const cards = activeDeck.cards || [];
  if (cardIndex >= cards.length) {
    body.innerHTML = `
      <div class="flashcard-finished">
        <h3>You finished this deck!</h3>
        <p>Great job reviewing your flashcards.</p>
        <button class="button button-dark" type="button" id="study-restart">Study again</button>
      </div>
    `;
    $("#study-restart")?.addEventListener("click", () => {
      cardIndex = 0;
      cardShowingAnswer = false;
      renderCard();
    });
    return;
  }

  const card = cards[cardIndex];
  body.innerHTML = `
    <div class="flashcard-card ${cardShowingAnswer ? "is-flipped" : ""}" id="flashcard-box">
      <span class="flashcard-counter">Card ${cardIndex + 1} of ${cards.length}</span>
      <div class="flashcard-content">
        <h4>${cardShowingAnswer ? "Answer" : "Question"}</h4>
        <p>${escapeHtml(cardShowingAnswer ? card.answer : card.question)}</p>
      </div>
      <button class="button button-light" type="button" id="flip-card">${cardShowingAnswer ? "Show question" : "Show answer"}</button>
    </div>
    <div class="flashcard-nav">
      <button class="button button-dark" type="button" id="next-card" ${cardShowingAnswer ? "" : "disabled"}>Next card →</button>
    </div>
  `;

  $("#flip-card")?.addEventListener("click", () => {
    cardShowingAnswer = !cardShowingAnswer;
    renderCard();
  });

  $("#next-card")?.addEventListener("click", () => {
    cardIndex++;
    cardShowingAnswer = false;
    renderCard();
  });
}


async function loadSessions() {
  if (!currentUser) return;
  const container = $("#session-list");
  if (!container) return;
  try {
    const snap = await getDocs(query(collection(db, "users", currentUser.uid, "sessions")));
    const sessions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    container.innerHTML = sessions.length ? sessions.map(s => `
      <div class="item-row">
        <span><strong>${escapeHtml(s.subject)}</strong> (${s.minutes} mins)</span>
        <span class="item-meta">${new Date(s.createdAt).toLocaleDateString()}</span>
      </div>
    `).join("") : `<p class="muted-line">No study sessions logged yet.</p>`;
  } catch (err) {
    console.error("Failed to load sessions:", err);
  }
}

async function loadNotes() {
  if (!currentUser) return;
  const container = $("#note-list");
  if (!container) return;
  try {
    const snap = await getDocs(query(collection(db, "users", currentUser.uid, "notes")));
    const notes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    container.innerHTML = notes.length ? notes.map(n => `
      <div class="item-row" data-note-id="${n.id}">
        <div><strong>${escapeHtml(n.title)}</strong><span class="item-meta">${escapeHtml(n.subject || "General")}</span></div>
      </div>
    `).join("") : `<p class="muted-line">No notes found.</p>`;

    container.querySelectorAll("[data-note-id]").forEach(row => {
      row.addEventListener("click", () => {
        const id = row.dataset.noteId;
        const note = notes.find(n => n.id === id);
        if (note) {
          activeNoteId = note.id;
          const form = $("#note-form");
          if (form) {
            form.elements["title"].value = note.title || "";
            form.elements["subject"].value = note.subject || "";
            form.elements["body"].value = note.body || "";
          }
          const status = $("#note-status");
          if (status) status.textContent = "Editing note";
          const delBtn = $("#note-delete");
          if (delBtn) delBtn.hidden = false;
        }
      });
    });
  } catch (err) {
    console.error("Failed to load notes:", err);
  }
}

async function loadGroups() {
  if (!currentUser) return;
  const container = $("#group-list");
  if (!container) return;
  try {
    const snap = await getDocs(query(collection(db, "groups"), where("memberIds", "array-contains", currentUser.uid)));
    const groups = snap.docs.map(entry => ({ id: entry.id, ...entry.data() })).sort((a, b) => String(a.name).localeCompare(String(b.name)));
    container.innerHTML = groups.length ? groups.map(group => `
      <button class="group-list-card${group.id === activeGroupCode ? " is-active" : ""}" type="button" data-group-open="${escapeHtml(group.id)}">
        <span class="group-list-icon">${escapeHtml((group.subject || "S").slice(0, 1).toUpperCase())}</span>
        <span class="group-list-copy"><strong>${escapeHtml(group.name)}</strong><small>${escapeHtml(group.subject)} · ${(group.memberIds || []).length} ${(group.memberIds || []).length === 1 ? "member" : "members"}</small></span>
        <span class="group-list-arrow">›</span>
      </button>`).join("") : `<div class="group-list-empty"><strong>No groups yet</strong><span>Create a group or join one with an invite code.</span></div>`;
    container.querySelectorAll("[data-group-open]").forEach(button => button.addEventListener("click", () => {
      const group = groups.find(item => item.id === button.dataset.groupOpen);
      if (!group) return;
      window.__studyGroupActiveData = group;
      openGroupChat(group.id, group.name, (group.memberIds || []).length);
      container.querySelectorAll(".group-list-card").forEach(item => item.classList.toggle("is-active", item === button));
    }));
    if (activeGroupCode && !groups.some(group => group.id === activeGroupCode)) {
      stopGroupMessages();
      activeGroupCode = null;
      $("#chat-room").hidden = true;
      $("#chat-empty").hidden = false;
    }
  } catch (error) {
    console.error("Could not load study groups:", error);
    container.innerHTML = `<div class="group-list-error">Your groups could not be loaded. ${escapeHtml(error.message || "Please refresh and try again.")}</div>`;
  }
}

function leaderboardPeriodKey(period, date = new Date()) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  if (period === 'monthly') return `${year}-${month}`;
  if (period === 'yearly') return `${date.getUTCMonth() >= 8 ? year : year - 1}-09-01`;
  const monday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  return monday.toISOString().slice(0, 10);
}

async function loadLeaderboard() {
  const container = $('#leaderboard-list');
  if (!container) return;
  const refreshBtn = $('#refresh-leaderboard');
  const period = ['weekly', 'monthly', 'yearly'].includes(currentBoard) ? currentBoard : 'weekly';
  const field = period === 'weekly' ? 'xpWeekly' : period === 'monthly' ? 'xpMonthly' : 'xpYearly';
  const keyField = period === 'weekly' ? 'weekKey' : period === 'monthly' ? 'monthKey' : 'yearKey';
  const key = leaderboardPeriodKey(period);
  const descriptions = {
    weekly: 'XP earned since Monday. Rankings reset every Monday.',
    monthly: 'XP earned this calendar month. Rankings reset on the 1st.',
    yearly: 'XP earned since 1 September. Rankings reset every 1 September.'
  };
  const subtitle = $('#leaderboard-subtitle');
  if (subtitle) subtitle.textContent = descriptions[period];
  const footnote = $('#leaderboard-footnote');
  if (footnote) footnote.textContent = `${period[0].toUpperCase()}${period.slice(1)} XP · resets automatically`;
  if (refreshBtn) { refreshBtn.disabled = true; refreshBtn.classList.add('is-refreshing'); }
  container.innerHTML = '<div class="leaderboard-loading"><span class="loading-spinner"></span> Loading the rankings…</div>';
  try {
    if (currentUser && state.profile?.leaderboardOptIn) await syncLeaderboardXp();
    const snap = await getDocs(query(collection(db, 'publicLeaderboard'), limit(250)));
    const users = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
      .filter((user) => user[keyField] === key && Number(user[field]) > 0)
      .sort((a, b) => (Number(b[field]) || 0) - (Number(a[field]) || 0))
      .slice(0, 10);
    if (!users.length) {
      const message = state.profile?.leaderboardOptIn
        ? "Your completed activities will appear here once your XP has synchronised. Try refreshing in a moment."
        : "Opt in from your profile to share your study name and appear here. Complete lessons and worksheets to earn XP.";
      container.innerHTML = `<div class="leaderboard-message"><span>✳</span><strong>A new ${period} starts here.</strong><p>${message}</p></div>`;
    } else {
      container.innerHTML = users.map((user, index) => {
        const rank = index + 1;
        const name = escapeHtml(user.displayName || user.nickname || 'Learner');
        const current = currentUser?.uid === user.id;
        const rankClass = rank <= 3 ? ` rank-${rank}` : '';
        return `<article class="leaderboard-row${current ? ' is-you' : ''}"><span class="leader-rank${rankClass}">${String(rank).padStart(2, '0')}</span><span class="leader-avatar leader-avatar-${(index % 4) + 1}">${name.slice(0, 1).toUpperCase()}</span><span class="leader-student"><strong><a href="/?${encodeURIComponent(user.handle || "")}" target="_blank" rel="noopener">${name}</a></strong><small>${current ? 'That’s you · keep it up!' : 'Making progress, one lesson at a time'}</small></span><span class="leader-points">${Number(user[field]) || 0}<small>XP</small></span></article>`;
      }).join('');
    }
    const myRank = $('#my-rank');
    if (myRank) {
      const index = users.findIndex((user) => user.id === currentUser?.uid);
      myRank.textContent = index >= 0 ? `You’re #${index + 1} on the ${period} leaderboard.` : state.profile?.leaderboardOptIn ? 'Earn XP this period to appear on the leaderboard.' : 'Opt in from your profile to appear on the leaderboard.';
    }
  } catch (err) {
    console.error('Failed to load leaderboard:', err);
    container.innerHTML = '<div class="leaderboard-message"><span>⌁</span><strong>We couldn’t load the leaderboard.</strong><p>Please check your connection and try again.</p><button class="leaderboard-retry" type="button" data-retry-leaderboard>Try again</button></div>';
  } finally {
    if (refreshBtn) { refreshBtn.disabled = false; refreshBtn.classList.remove('is-refreshing'); }
  }
}

async function loadSchoolData() {
  const container = $("#school-feed");
  if (!container) return;
  container.innerHTML = `<p class="muted-line">School announcements are up to date.</p>`;
}

function downloadUserData() {
  alert("Data export feature coming soon!");
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

initDashboard();
