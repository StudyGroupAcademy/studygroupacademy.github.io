import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";
import { getDoc, serverTimestamp, updateDoc } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";
import {
  $,
  $$,
  auth,
  fillSubjectSelects,
  getErrorMessage,
  setFormError,
  showBanner,
  showToast,
  state
} from "./core.js";
import { cleanNickname, validNickname } from "./helpers.js";
import { initLeaderboard, loadLeaderboard } from "./leaderboard.js";
import { initResourceFilter } from "./resources.js";
import {
  ensureUserProfile,
  leaderboardReference,
  NICKNAME_RULE,
  saveProfileChoices,
  takeWelcomeFlag
} from "./session.js";
import { exportData, startWorkspace, stopWorkspace } from "./workspace.js";

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const profileDialog = $("#profile-dialog");
const profileForm = $("#profile-form");
const leaderboardList = $("#leaderboard-list");

let loadToken = 0;
let leaving = false;

function leaveToLanding() {
  if (leaving) return;
  leaving = true;
  window.location.replace("../");
}

function revealPage() {
  document.body.classList.remove("checking");
}

function renderAccount() {
  if (!state.user) return;
  const nickname = state.profile?.displayName || state.user.displayName || "Study buddy";
  $("#header-name").textContent = nickname;
  $("#header-initial").textContent = nickname.slice(0, 1).toUpperCase();
  $("#account-email").textContent = state.user.email || "";
  $("#workspace-name").textContent = nickname;
  const canCheckIn = Boolean(state.profile?.leaderboardOptIn);
  $("#member-checkin").hidden = !canCheckIn;
  $("#member-join").hidden = canCheckIn || !state.profile;
  $("#checkin-name").textContent = nickname;
  const checkedToday = leaderboardList.dataset.checkedInUid === state.user.uid;
  $("#daily-checkin").disabled = checkedToday || !canCheckIn;
  $("#daily-checkin").textContent = checkedToday ? "You checked in today ✓" : "Check in for today +1";
}

function openProfileDialog(welcome = false) {
  $("#account-popover").hidden = true;
  profileForm.elements.nickname.value = state.profile?.displayName || "";
  profileForm.elements.leaderboardOptIn.checked = Boolean(state.profile?.leaderboardOptIn);
  $("#profile-title").textContent = welcome ? "Welcome. Pick a nickname." : "Make yourself at home.";
  $("#profile-intro").textContent = welcome
    ? "This is the name other students see. Your email and real name stay private."
    : "Choose the nickname students see. Your email stays private.";
  setFormError($("#profile-error"), "");
  if (!profileDialog.open) profileDialog.showModal();
}

async function updateCheckinStatus() {
  if (!state.user || !state.profile?.leaderboardOptIn) {
    leaderboardList.dataset.checkedInUid = "";
    renderAccount();
    return;
  }
  try {
    const snapshot = await getDoc(leaderboardReference(state.user.uid));
    const lastPointAt = snapshot.data()?.lastPointAt;
    const checkedIn = lastPointAt?.toDate && Date.now() - lastPointAt.toDate().getTime() < DAY_IN_MS;
    leaderboardList.dataset.checkedInUid = checkedIn ? state.user.uid : "";
    renderAccount();
  } catch (error) {
    console.error("Could not check the student's leaderboard check-in status.", error);
    showBanner(getErrorMessage(error), true);
  }
}

let lastBoardLoad = 0;

async function refreshBoard() {
  lastBoardLoad = Date.now();
  await loadLeaderboard();
  await updateCheckinStatus();
}

async function loadUser(user) {
  const token = ++loadToken;
  state.user = user;
  state.profile = null;
  stopWorkspace();
  try {
    const profile = await ensureUserProfile(user);
    if (token !== loadToken) return;
    state.profile = profile;
    renderAccount();
    revealPage();
    startWorkspace();
    await refreshBoard();
    showBanner(`Welcome${profile.displayName ? `, ${profile.displayName}` : ""}. Your account is ready.`);
    if (takeWelcomeFlag()) openProfileDialog(true);
  } catch (error) {
    console.error("Could not load the student's private StudyGroup profile.", error);
    revealPage();
    showBanner(getErrorMessage(error), true);
  }
}

async function downloadMyData() {
  if (!state.user) return;
  $("#account-popover").hidden = true;
  try {
    const data = await exportData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "studygroup-my-data.json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(link.href), 2000);
    showToast("Your data has been downloaded.");
  } catch (error) {
    console.error("Could not export the student's StudyGroup data.", error);
    showToast(getErrorMessage(error));
  }
}

$$("[data-close-dialog]").forEach((button) => {
  button.addEventListener("click", () => button.closest("dialog").close());
});

$$("dialog").forEach((dialog) => {
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
});

$("#account-toggle").addEventListener("click", () => {
  const popover = $("#account-popover");
  const open = popover.hidden;
  popover.hidden = !open;
  $("#account-toggle").setAttribute("aria-expanded", String(open));
});

document.addEventListener("click", (event) => {
  const popover = $("#account-popover");
  if (!popover.hidden && !event.target.closest("#signed-in-menu")) {
    popover.hidden = true;
    $("#account-toggle").setAttribute("aria-expanded", "false");
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") $("#account-popover").hidden = true;
});

$$("[data-open-settings]").forEach((button) => {
  button.addEventListener("click", () => openProfileDialog(false));
});

$("#download-data").addEventListener("click", downloadMyData);

profileForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!state.user) return;
  const nickname = cleanNickname(String(new FormData(profileForm).get("nickname") || ""));
  const optIn = profileForm.elements.leaderboardOptIn.checked;
  const errorContainer = $("#profile-error");
  const submitButton = profileForm.querySelector("[type=submit]");
  setFormError(errorContainer, "");
  if (!validNickname(nickname)) {
    setFormError(errorContainer, NICKNAME_RULE);
    return;
  }
  submitButton.disabled = true;
  submitButton.textContent = "Saving your preferences…";
  try {
    await saveProfileChoices(nickname, optIn);
    renderAccount();
    profileDialog.close();
    await refreshBoard();
    showToast(optIn ? "Your nickname is on the study leaderboard." : "Your profile is private from the leaderboard.");
  } catch (error) {
    console.error("Could not update the student's StudyGroup profile.", error);
    setFormError(errorContainer, getErrorMessage(error));
  } finally {
    submitButton.disabled = false;
    submitButton.innerHTML = "Save my preferences <span>→</span>";
  }
});

$("#sign-out").addEventListener("click", async () => {
  try {
    await signOut(auth);
    leaveToLanding();
  } catch (error) {
    console.error("Could not sign out of StudyGroup.", error);
    showToast(getErrorMessage(error));
  }
});

$("#member-join").addEventListener("click", () => {
  openProfileDialog(false);
  profileForm.elements.leaderboardOptIn.checked = true;
});

$("#daily-checkin").addEventListener("click", async () => {
  if (!state.user || !state.profile?.leaderboardOptIn) return;
  const checkInButton = $("#daily-checkin");
  checkInButton.disabled = true;
  checkInButton.textContent = "Checking you in…";
  try {
    const reference = leaderboardReference(state.user.uid);
    const snapshot = await getDoc(reference);
    if (!snapshot.exists()) {
      throw new Error("Your public study profile could not be found. Try switching the leaderboard off and on in your profile.");
    }
    const lastPointAt = snapshot.data().lastPointAt;
    if (lastPointAt?.toDate && Date.now() - lastPointAt.toDate().getTime() < DAY_IN_MS) {
      leaderboardList.dataset.checkedInUid = state.user.uid;
      renderAccount();
      showToast("You've already checked in today. Come back tomorrow for another point.");
      return;
    }
    await updateDoc(reference, {
      points: snapshot.data().points + 1,
      lastPointAt: serverTimestamp()
    });
    await loadLeaderboard();
    leaderboardList.dataset.checkedInUid = state.user.uid;
    renderAccount();
    showToast("You showed up for yourself today. That counts. ✳");
  } catch (error) {
    console.error("The daily leaderboard check-in failed.", error);
    showToast(getErrorMessage(error));
    checkInButton.disabled = false;
    checkInButton.textContent = "Check in for today +1";
  }
});

document.addEventListener("studygroup:tab", (event) => {
  if (event.detail === "leaderboard" && state.profile && Date.now() - lastBoardLoad > 20000) refreshBoard();
});

fillSubjectSelects();
initResourceFilter();
initLeaderboard(refreshBoard);

window.setTimeout(() => {
  if (document.body.classList.contains("checking")) {
    revealPage();
    showBanner("StudyGroup is taking longer than usual to reach Firebase. Check your connection and refresh.", true);
  }
}, 8000);

onAuthStateChanged(auth, (user) => {
  if (!user) {
    stopWorkspace();
    leaveToLanding();
    return;
  }
  loadUser(user);
});
