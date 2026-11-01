import { doc, getDoc, serverTimestamp, setDoc, updateDoc, writeBatch } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";
import { db, state } from "./core.js";
import { sanitizeNickname, weekStartKey } from "./helpers.js";

export const NICKNAME_RULE = "Use 2 to 24 letters, numbers, spaces, dots, underscores or hyphens for your nickname.";

const WELCOME_KEY = "studygroup-welcome";
const inflightProfiles = new Map();

export function profileReference(user) {
  return doc(db, "users", user.uid);
}

export function leaderboardReference(uid) {
  return doc(db, "publicLeaderboard", uid);
}

function setWelcomeFlag() {
  try {
    sessionStorage.setItem(WELCOME_KEY, "1");
  } catch (error) {
    console.error("The welcome flag could not be stored.", error);
  }
}

export function takeWelcomeFlag() {
  try {
    const flagged = sessionStorage.getItem(WELCOME_KEY) === "1";
    sessionStorage.removeItem(WELCOME_KEY);
    return flagged;
  } catch (error) {
    return false;
  }
}

async function createOrLoadProfile(user) {
  const reference = profileReference(user);
  const snapshot = await getDoc(reference);
  if (!snapshot.exists()) {
    const fallback = `Learner ${user.uid.slice(0, 5)}`;
    const newProfile = {
      displayName: sanitizeNickname(user.displayName, fallback),
      leaderboardOptIn: false,
      createdAt: serverTimestamp()
    };
    await setDoc(reference, newProfile);
    setWelcomeFlag();
    return { displayName: newProfile.displayName, leaderboardOptIn: false };
  }
  const existing = snapshot.data();
  if (existing.leaderboardOptIn === true) {
    const publicReference = leaderboardReference(user.uid);
    const publicSnapshot = await getDoc(publicReference);
    if (!publicSnapshot.exists()) {
      await setDoc(publicReference, {
        displayName: existing.displayName,
        points: 0,
        lastPointAt: null,
        joinedAt: serverTimestamp()
      });
    }
  }
  return existing;
}

export function ensureUserProfile(user) {
  if (!inflightProfiles.has(user.uid)) {
    const pending = createOrLoadProfile(user).finally(() => inflightProfiles.delete(user.uid));
    inflightProfiles.set(user.uid, pending);
  }
  return inflightProfiles.get(user.uid);
}

export async function saveProfileChoices(nickname, optIn) {
  const publicReference = leaderboardReference(state.user.uid);
  const publicSnapshot = await getDoc(publicReference);
  const batch = writeBatch(db);
  batch.update(profileReference(state.user), { displayName: nickname, leaderboardOptIn: optIn });
  if (optIn && publicSnapshot.exists()) {
    batch.update(publicReference, { displayName: nickname });
  } else if (optIn) {
    batch.set(publicReference, {
      displayName: nickname,
      points: 0,
      lastPointAt: null,
      joinedAt: serverTimestamp()
    });
  } else if (publicSnapshot.exists()) {
    batch.delete(publicReference);
  }
  await batch.commit();
  state.profile = { ...state.profile, displayName: nickname, leaderboardOptIn: optIn };
}

export async function addWeeklyMinutes(minutes) {
  if (!state.user || !state.profile?.leaderboardOptIn) return;
  const reference = leaderboardReference(state.user.uid);
  const snapshot = await getDoc(reference);
  if (!snapshot.exists()) return;
  const data = snapshot.data();
  const key = weekStartKey();
  const current = data.weekKey === key ? Number(data.weekMinutes) || 0 : 0;
  await updateDoc(reference, { weekKey: key, weekMinutes: Math.min(6000, current + minutes) });
}

export async function saveDailyGoal(minutes) {
  await updateDoc(profileReference(state.user), { dailyGoal: minutes });
  state.profile = { ...state.profile, dailyGoal: minutes };
}
