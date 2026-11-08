import { authClient } from "./auth-client.js";
import { collection, completeActivity, deleteDoc, doc, getDoc, getDocs, limit, orderBy, query, setDoc, updateDoc, where } from "./firestore-client.js";
import { $, $$, db, state, showBanner } from "./core.js";
import { ensureUserProfile, saveDailyGoal, saveProfileChoices, takeWelcomeFlag } from "./session.js";
import { initResourceFilter, setLessonUser } from "./resources.js";

const DEFAULT_SUBJECTS = ["Maths", "English", "Science", "Computer Science", "History", "Geography", "French", "Spanish"];

let currentUser = null;
let currentTab = "overview";
let currentTaskFilter = "all";
let currentBoard = "xp";
let calendarDate = new Date();
let activeGroupCode = null;
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

  try {
    const sessionResult = await authClient.getSession();
    if (sessionResult.error) throw sessionResult.error;
    const user = sessionResult.data?.user || null;
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
  const profile = await ensureUserProfile(currentUser);
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
  const name = profile.nickname || profile.displayName || "Learner";
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
  if (handleElem) handleElem.textContent = `@${profile.handle || "user"}`;
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
        const sessionResult = await authClient.getSession();
        if (sessionResult?.error) throw sessionResult.error;
        if (sessionResult.data?.user) {
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

function bindForms() {
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

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!currentUser) return;
    const data = new FormData(form);
    const nickname = data.get("nickname").trim();
    const displayName = data.get("displayName").trim();
    const handle = data.get("handle").trim().toLowerCase();
    const bio = data.get("bio").trim();
    const optIn = data.get("leaderboardOptIn") === "on";

    const errBox = $("#profile-error");
    try {
      if (errBox) errBox.hidden = true;
      await saveProfileChoices({ nickname, displayName, handle, bio }, optIn);
      dialog.close();
      const snapshot = await getDoc(doc(db, "users", currentUser.uid));
      if (snapshot.exists()) {
        renderSignedIn(snapshot.data());
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
  $$("[data-board]").forEach((btn) => {
    btn.addEventListener("click", () => {
      $$("[data-board]").forEach((b) => b.classList.toggle("is-active", b === btn));
      currentBoard = btn.dataset.board;
      loadLeaderboard();
    });
  });

  const refreshBtn = $("#refresh-leaderboard");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", loadLeaderboard);
  }

  const joinBtn = $("#member-join button");
  if (joinBtn) {
    joinBtn.addEventListener("click", () => openProfileDialog(false));
  }
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

function bindGroupActions() {
  const groupForm = $("#group-form");
  if (groupForm) {
    groupForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!currentUser) return;
      const data = new FormData(groupForm);
      const name = data.get("name").trim();
      const subject = data.get("subject");
      if (!name) return;

      const code = Math.random().toString(36).substring(2, 8).toUpperCase();
      try {
        await setDoc(doc(db, "groups", code), {
          name,
          subject,
          ownerId: currentUser.uid,
          memberIds: [currentUser.uid],
          code,
          createdAt: new Date().toISOString()
        });
        await setDoc(doc(db, "groupCodes", code), { groupId: code, ownerId: currentUser.uid });
        groupForm.reset();
        await loadGroups();
        openGroupChat(code, name);
      } catch (err) {
        console.error("Failed to create group:", err);
      }
    });
  }

  const joinForm = $("#join-form");
  if (joinForm) {
    joinForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!currentUser) return;
      const data = new FormData(joinForm);
      const code = data.get("code").trim().toUpperCase();
      if (!code) return;

      try {
        const groupRef = doc(db, "groups", code);
        const snap = await getDoc(groupRef);
        if (!snap.exists()) {
          alert("Group not found with that code.");
          return;
        }
        const groupData = snap.data();
        const members = groupData.memberIds || [];
        if (!members.includes(currentUser.uid)) {
          await updateDoc(groupRef, { memberIds: [...members, currentUser.uid] });
        }
        joinForm.reset();
        await loadGroups();
        openGroupChat(code, groupData.name);
      } catch (err) {
        console.error("Failed to join group:", err);
      }
    });
  }

  const chatForm = $("#chat-form");
  if (chatForm) {
    chatForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!currentUser || !activeGroupCode) return;
      const data = new FormData(chatForm);
      const text = data.get("text").trim();
      if (!text) return;

      try {
        const profileSnap = await getDoc(doc(db, "users", currentUser.uid));
        const senderName = profileSnap.exists() ? (profileSnap.data().nickname || profileSnap.data().displayName || "Learner") : "Learner";

        await setDoc(doc(collection(db, "groups", activeGroupCode, "messages")), {
          text,
          sender: currentUser.uid,
          senderName,
          createdAt: new Date().toISOString()
        });
        chatForm.reset();
      } catch (err) {
        console.error("Failed to send message:", err);
      }
    });
  }

  const copyBtn = $("#copy-code");
  if (copyBtn) {
    copyBtn.addEventListener("click", () => {
      if (!activeGroupCode) return;
      navigator.clipboard.writeText(activeGroupCode);
      copyBtn.textContent = "Copied!";
      setTimeout(() => copyBtn.textContent = "Copy invite code", 2000);
    });
  }

  const leaveBtn = $("#leave-group");
  if (leaveBtn) {
    leaveBtn.addEventListener("click", async () => {
      if (!currentUser || !activeGroupCode) return;
      try {
        const groupRef = doc(db, "groups", activeGroupCode);
        const snap = await getDoc(groupRef);
        if (snap.exists()) {
          const groupData = snap.data();
          if (groupData.ownerId === currentUser.uid) {
            await deleteDoc(groupRef);
            await deleteDoc(doc(db, "groupCodes", activeGroupCode));
          } else {
            const memberIds = (groupData.memberIds || []).filter(id => id !== currentUser.uid);
            await updateDoc(groupRef, { memberIds });
          }
        }
        activeGroupCode = null;
        $("#chat-room").hidden = true;
        $("#chat-empty").hidden = false;
        await loadGroups();
      } catch (err) {
        console.error("Failed to leave group:", err);
      }
    });
  }
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
    const tasks = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    if (container) {
      container.innerHTML = tasks.length ? tasks.map(t => `
        <div class="item-row ${t.completed ? "is-complete" : ""}">
          <label><input type="checkbox" data-task-toggle="${t.id}" ${t.completed ? "checked" : ""} /> <span>${escapeHtml(t.title)}</span></label>
          <span class="item-meta">${escapeHtml(t.subject || "")} · ${escapeHtml(t.due || "No due date")}</span>
          <button class="button button-quiet" type="button" data-task-delete="${t.id}">Delete</button>
        </div>
      `).join("") : `<p class="muted-line">No tasks added yet.</p>`;

      container.querySelectorAll("[data-task-toggle]").forEach(chk => {
        chk.addEventListener("change", async (e) => {
          const id = e.target.dataset.taskToggle;
          await updateDoc(doc(db, "users", currentUser.uid, "tasks", id), { completed: e.target.checked });
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
    const groups = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    container.innerHTML = groups.length ? groups.map(g => `
      <div class="item-row">
        <div><strong>${escapeHtml(g.name)}</strong><span class="item-meta">${escapeHtml(g.subject)} · Code: ${g.id}</span></div>
        <button class="button button-light" type="button" data-group-open="${g.id}" data-group-name="${escapeHtml(g.name)}">Open Chat</button>
      </div>
    `).join("") : `<p class="muted-line">You haven't joined any study groups yet.</p>`;

    container.querySelectorAll("[data-group-open]").forEach(btn => {
      btn.addEventListener("click", () => {
        openGroupChat(btn.dataset.groupOpen, btn.dataset.groupName);
      });
    });
  } catch (err) {
    console.error("Failed to load groups:", err);
  }
}

function openGroupChat(code, name) {
  activeGroupCode = code;
  const chatRoom = $("#chat-room");
  const chatEmpty = $("#chat-empty");
  const titleElem = $("#chat-group-title");
  if (chatRoom) chatRoom.hidden = false;
  if (chatEmpty) chatEmpty.hidden = true;
  if (titleElem) titleElem.textContent = name;
}

async function loadLeaderboard() {
  const container = $("#leaderboard-list");
  if (!container) return;
  try {
    const snap = await getDocs(query(collection(db, "publicLeaderboard"), limit(10)));
    const users = snap.docs.map(d => d.data());
    container.innerHTML = users.length ? users.map((u, index) => `
      <div class="item-row">
        <span><strong>#${index + 1} ${escapeHtml(u.nickname || u.displayName || "Learner")}</strong></span>
        <span>${u.xp || 0} XP</span>
      </div>
    `).join("") : `<p class="muted-line">No participants on the leaderboard yet.</p>`;
  } catch (err) {
    console.error("Failed to load leaderboard:", err);
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
