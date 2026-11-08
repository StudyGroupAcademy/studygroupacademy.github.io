import { auth, googleProvider } from "./firestore-client.js";
import { signInWithPopup, signOut as firebaseSignOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
  $,
  $$,
  fillSubjectSelects,
  getErrorMessage,
  setFormError,
  showBanner,
  showToast,
  state
} from "./core.js";
import { cleanNickname, consumeOAuthCallback, describeOAuthError, earnedNameTag, NAME_TAG_MILESTONES, validNickname } from "./helpers.js";
import { initLeaderboard, loadLeaderboard } from "./leaderboard.js";
import { initResourceFilter, setLessonUser } from "./resources.js";
import { initSchoolPortal, startSchoolPortal } from "./school-portal.js";
import {
  ensureUserProfile,
  NICKNAME_RULE,
  saveProfileChoices,
  takeWelcomeFlag
} from "./session.js";
import { exportData, initWorkspaceUI } from "./workspace.js";

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
  const accountName = state.profile?.displayName || state.user.displayName || state.user.email?.split("@")[0] || "Learner";
  const nickname = state.profile?.nickname || accountName;
  $("#header-name").textContent = accountName;
  $("#header-initial").textContent = accountName.slice(0, 1).toUpperCase();
  $("#account-email").textContent = state.user.email || "";
  $("#workspace-name").textContent = accountName;
  $("#account-handle").textContent = `@${state.profile?.handle || nickname.toLowerCase().replace(/[^a-z0-9]+/g, "")}`;
  renderNameTag(Number(state.profile?.xp) || 0);
  const canCheckIn = Boolean(state.profile?.leaderboardOptIn);
  $("#member-join").hidden = canCheckIn || !state.profile;
  $("#member-xp").hidden = !canCheckIn;
  $("#member-xp-value").textContent = String(Number(state.profile?.xp) || 0);
}

function renderNameTag(xp) {
  const tag = earnedNameTag(xp);
  for (const selector of ["#header-name-tag", "#workspace-name-tag"]) {
    const element = $(selector);
    element.textContent = tag ? `[${tag.tag}]` : "";
    element.hidden = !tag;
  }
  const accountTag = $("#account-badge");
  accountTag.textContent = tag ? `Earned name tag · ${tag.tag}` : `Next name tag at ${NAME_TAG_MILESTONES[0].xp} XP`;
  renderAchievements(xp);
}

function renderAchievements(xp) {
  $("#badge-summary").textContent = `${xp} XP earned · Name tags unlock through lessons and worksheet achievements.`;
  $("#badge-grid").innerHTML = NAME_TAG_MILESTONES.map((milestone) => {
    const unlocked = xp >= milestone.xp;
    return `<article class="badge${unlocked ? " is-unlocked" : ""}">
      <span class="badge-icon">${unlocked ? "✦" : "◇"}</span>
      <strong>${milestone.tag}</strong>
      <small>${milestone.description}</small>
      <em>${unlocked ? "Unlocked · shown next to your name" : `${milestone.xp - xp} XP to unlock`}</em>
    </article>`;
  }).join("");
}

function openProfileDialog(welcome = false) {
  profileDialog.dataset.onboarding = String(welcome);
  profileDialog.querySelector("[data-close-dialog]").hidden = welcome;
  $("#account-popover").hidden = true;
  profileForm.elements.displayName.value = state.profile?.displayName || state.user?.displayName || "";
  profileForm.elements.nickname.value = state.profile?.nickname || state.profile?.displayName || "";
  profileForm.elements.handle.value = state.profile?.handle || "";
  profileForm.elements.bio.value = state.profile?.bio || "";
  const boards = state.profile?.boards || {};
  for (const subject of ["maths", "english-language", "english-literature", "biology", "chemistry", "physics", "history", "geography", "computer-science", "french", "spanish"]) {
    profileForm.elements[`board-${subject}`].value = boards[subject] || "";
  }
  profileForm.elements.leaderboardOptIn.checked = Boolean(state.profile?.leaderboardOptIn);
  $("#profile-title").textContent = welcome ? "Finish your profile." : "Profile & account settings.";
  $("#profile-intro").textContent = welcome
    ? "Add your name, nickname, profile details and exam boards. Your email stays private."
    : "Your account name is for your dashboard; your nickname is shown publicly only if you opt in.";
  setFormError($("#profile-error"), "");
  if (!profileDialog.open) profileDialog.showModal();
}

let lastBoardLoad = 0;

async function refreshBoard() {
  lastBoardLoad = Date.now();
  await loadLeaderboard();
}

async function loadUser(user) {
  const token = ++loadToken;
  const uid = user?.uid || user?.id;
  if (!uid) {
    revealPage();
    showBanner("The signed-in account is missing its user ID. Please log in again.", true);
    return;
  }
  const account = user.uid === uid ? user : { ...user, uid };
  state.user = account;
  state.profile = null;
  try {
    const profile = await ensureUserProfile(account);
    if (token !== loadToken) return;
    state.profile = profile;
    renderAccount();
    void setLessonUser(account);
    revealPage();
    initWorkspaceUI();
    void startSchoolPortal(account, profile);
    await refreshBoard();
    showBanner(`Welcome${profile.displayName ? `, ${profile.displayName}` : ""}. Your account is ready.`);
    const url = new URL(window.location.href);
    const welcomeFlag = takeWelcomeFlag();
    const needsProfileSetup = profile.onboardingComplete === false || welcomeFlag;
    const editProfile = url.searchParams.get("settings") === "profile";
    if (needsProfileSetup || editProfile) {
      url.searchParams.delete("settings");
      window.history.replaceState({}, "", url.toString());
      openProfileDialog(needsProfileSetup);
    }
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
    if (event.target === dialog && !(dialog === profileDialog && dialog.dataset.onboarding === "true")) dialog.close();
  });
});
profileDialog.addEventListener("cancel", (event) => {
  if (profileDialog.dataset.onboarding === "true") event.preventDefault();
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
  const formValues = new FormData(profileForm);
  const nickname = cleanNickname(String(formValues.get("nickname") || ""));
  const displayName = cleanNickname(String(formValues.get("displayName") || ""));
  const handle = String(formValues.get("handle") || "").trim().replace(/^@/, "");
  const bio = String(formValues.get("bio") || "").trim();
  const boards = Object.fromEntries(["maths", "english-language", "english-literature", "biology", "chemistry", "physics", "history", "geography", "computer-science", "french", "spanish"]
    .map((subject) => [subject, String(formValues.get(`board-${subject}`) || "")]).filter(([, board]) => board));
  const optIn = profileForm.elements.leaderboardOptIn.checked;
  const errorContainer = $("#profile-error");
  const submitButton = profileForm.querySelector("[type=submit]");
  setFormError(errorContainer, "");
  if (!validNickname(nickname) || displayName.length < 2 || !/^[A-Za-z0-9_]{3,20}$/.test(handle)) {
    setFormError(errorContainer, !validNickname(nickname) ? NICKNAME_RULE : "Enter an account name (at least 2 characters) and a handle with 3–20 letters, numbers or underscores.");
    return;
  }
  submitButton.disabled = true;
  submitButton.textContent = "Saving your preferences…";
  try {
    await saveProfileChoices({ displayName, nickname, handle, bio, boards }, optIn);
    renderAccount();
    profileDialog.dataset.onboarding = "false";
    profileDialog.querySelector("[data-close-dialog]").hidden = false;
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

$("#link-google").addEventListener("click", async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  setFormError($("#profile-error"), "");
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const authUser = result.user;
    const user = { uid: authUser.uid, email: authUser.email, displayName: authUser.displayName };
    await loadUser(user);
    showToast("Google account connected successfully.");
  } catch (error) {
    console.error("Could not sign in with Google via Firebase.", error);
    setFormError($("#profile-error"), error.message || getErrorMessage(error));
  } finally {
    button.disabled = false;
  }
});

$("#sign-out").addEventListener("click", async () => {
  try {
    await firebaseSignOut(auth);
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

window.addEventListener("studygroup:xpprogress", (event) => {
  if (!state.profile) return;
  state.profile.xp = Number(event.detail?.xp) || 0;
  renderAccount();
});

document.addEventListener("studygroup:tab", (event) => {
  if (event.detail === "leaderboard" && state.profile && Date.now() - lastBoardLoad > 20000) refreshBoard();
});

fillSubjectSelects();
initResourceFilter();
initLeaderboard(refreshBoard);
initWorkspaceUI();
initSchoolPortal();

const authCallback = consumeOAuthCallback();
if (authCallback.error) showBanner(describeOAuthError(authCallback.error), true);
if (authCallback.result === "google-linked") showBanner("Google is now connected to your StudyGroup account.");

window.setTimeout(() => {
  if (document.body.classList.contains("checking")) {
    revealPage();
    showBanner("StudyGroup is taking longer than usual to check your account. Check your connection and refresh.", true);
  }
}, 8000);

auth.onAuthStateChanged((authUser) => {
  if (!authUser) {
    leaveToLanding();
    return;
  }
  const user = { uid: authUser.uid, email: authUser.email, displayName: authUser.displayName };
  loadUser(user);
});
