import { collection, doc, getDoc, getDocs } from "./firestore-client.js";

const rawQuery = window.location.search.slice(1).split("&")[0];
const handle = decodeURIComponent(rawQuery.split("=")[0] || "").trim().replace(/^@/, "").toLowerCase();
const reserved = new Set(["", "invite", "oauth", "error", "utm_source", "utm_medium", "utm_campaign"]);

if (!reserved.has(handle) && /^[a-z0-9_]{3,20}$/.test(handle)) {
  document.documentElement.classList.add("public-profile-mode");
  document.body.insertAdjacentHTML("afterbegin", `
    <header class="public-profile-nav"><a href="/" class="public-profile-brand">StudyGroup<span>.</span></a><a href="/" class="public-profile-home">Back to StudyGroup ↗</a></header>
    <main class="public-profile-shell"><div class="public-profile-loading" id="public-profile-content"><span class="public-profile-spinner"></span><p>Loading learner profile…</p></div></main>
    <footer class="public-profile-footer">StudyGroup · Learn a little, every day.</footer>`);
  loadProfile(handle).catch((error) => {
    const target = document.querySelector("#public-profile-content");
    if (target) target.innerHTML = `<div class="public-profile-error"><span>404</span><h1>Profile unavailable</h1><p>${escapeHTML(error.message || "This profile could not be loaded.")}</p><a href="/">Return to StudyGroup</a></div>`;
  });
}

async function loadProfile(username) {
  const snapshot = await getDoc(doc(null, "publicProfiles", username));
  if (!snapshot.exists()) throw new Error("We couldn't find a public profile with that handle.");
  const profile = snapshot.data();
  const leaderboard = await getDocs(collection(null, "publicLeaderboard")).catch(() => ({ docs: [] }));
  const ranked = leaderboard.docs.map((entry) => entry.data()).sort((a, b) => Number(b.xp) - Number(a.xp));
  const rankIndex = ranked.findIndex((entry) => entry.uid === profile.uid);
  const rank = rankIndex >= 0 ? rankIndex + 1 : null;
  const xp = Number(profile.xp) || 0;
  const achievements = [
    { threshold: 10, title: "First steps", detail: "Earned 10 XP" },
    { threshold: 50, title: "Finding a rhythm", detail: "Earned 50 XP" },
    { threshold: 100, title: "Dedicated learner", detail: "Earned 100 XP" },
    { threshold: 250, title: "Knowledge builder", detail: "Earned 250 XP" },
    { threshold: 500, title: "StudyGroup regular", detail: "Earned 500 XP" },
    { threshold: 1000, title: "Learning legend", detail: "Earned 1,000 XP" }
  ];
  const earned = achievements.filter((item) => xp >= item.threshold);
  const subjects = Object.entries(profile.boards || {}).filter(([, board]) => board);
  const name = profile.displayName || profile.nickname || "StudyGroup learner";
  document.title = `${name} (@${username}) · StudyGroup`;
  const target = document.querySelector("#public-profile-content");
  target.className = "public-profile-content";
  target.innerHTML = `
    <section class="public-profile-hero">
      <div class="public-profile-avatar">${escapeHTML(name.slice(0, 1).toUpperCase())}</div>
      <div class="public-profile-identity"><span class="public-profile-eyebrow">STUDYGROUP LEARNER</span><h1>${escapeHTML(name)}</h1><p>@${escapeHTML(username)}</p></div>
      <div class="public-profile-xp"><strong>${xp.toLocaleString()}</strong><span>total XP</span></div>
    </section>
    <section class="public-profile-bio"><span class="public-profile-label">ABOUT</span><p>${escapeHTML(profile.bio || "This learner hasn't added a bio yet.")}</p>${profile.yearGroup ? `<small>${escapeHTML(profile.yearGroup)}</small>` : ""}</section>
    <section class="public-profile-stats"><article><strong>${rank ? `#${rank}` : "—"}</strong><span>Leaderboard rank</span></article><article><strong>${earned.length}</strong><span>Achievements</span></article><article><strong>${subjects.length}</strong><span>Subjects set up</span></article></section>
    <section class="public-profile-section"><div class="public-profile-section-head"><div><span class="public-profile-label">MILESTONES</span><h2>Achievements</h2></div><span>${earned.length} / ${achievements.length} unlocked</span></div>
      <div class="public-profile-achievements">${achievements.map((item, index) => `<article class="public-profile-achievement${xp >= item.threshold ? " is-earned" : " is-locked"}"><span class="achievement-mark">${xp >= item.threshold ? "✦" : "·"}</span><div><strong>${item.title}</strong><small>${item.detail}</small></div><span class="achievement-status">${xp >= item.threshold ? "Unlocked" : "Locked"}</span></article>`).join("")}</div>
    </section>
    <section class="public-profile-section"><div class="public-profile-section-head"><div><span class="public-profile-label">LEARNING SETUP</span><h2>Subjects & exam boards</h2></div></div>
      ${subjects.length ? `<div class="public-profile-subjects">${subjects.map(([subject, board]) => `<span><strong>${escapeHTML(subject)}</strong><small>${escapeHTML(board)}</small></span>`).join("")}</div>` : `<p class="public-profile-muted">No subjects added yet.</p>`}
    </section>
    <div class="public-profile-bottom"><span>Keep learning, one step at a time.</span><a href="/">Join StudyGroup ↗</a></div>`;
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}
