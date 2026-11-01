import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";
import { $, db, getErrorMessage, runSafely, showBanner, showToast, state } from "./core.js";
import { escapeHTML, formatDay, formatTime, dateKey } from "./helpers.js";
import { setData } from "./insights.js";

const nt = { notes: [], activeId: null, listener: null, bound: false, search: "" };

function notesCollection() {
  return collection(db, "users", state.user.uid, "notes");
}

function toNote(snapshot) {
  const data = snapshot.data({ serverTimestamps: "estimate" });
  const updated = data.updatedAt && typeof data.updatedAt.toDate === "function" ? data.updatedAt.toDate() : null;
  return { id: snapshot.id, ...data, updated };
}

function stamp(date) {
  if (!date) return "just now";
  return dateKey(date) === dateKey(new Date()) ? `today ${formatTime(date)}` : `${formatDay(dateKey(date))} ${formatTime(date)}`;
}

function resetEditor() {
  const form = $("#note-form");
  form.reset();
  nt.activeId = null;
  $("#note-status").textContent = "New note";
  $("#note-delete").hidden = true;
}

function loadEditor(note) {
  const form = $("#note-form");
  nt.activeId = note.id;
  form.elements.title.value = note.title;
  form.elements.subject.value = note.subject;
  form.elements.body.value = note.body || "";
  $("#note-status").textContent = `Saved ${stamp(note.updated)}`;
  $("#note-delete").hidden = false;
}

function renderNotes() {
  const list = $("#note-list");
  const term = nt.search.trim().toLowerCase();
  const visible = nt.notes
    .filter((note) => !term || `${note.title} ${note.subject} ${note.body}`.toLowerCase().includes(term))
    .sort((first, second) => (second.updated?.getTime() || 0) - (first.updated?.getTime() || 0));
  if (visible.length === 0) {
    list.innerHTML = `<div class="empty-state"><span>✎</span><strong>${term ? "No notes match" : "No notes yet"}</strong><p>${term ? "Try a different search." : "Press New note to start writing."}</p></div>`;
    return;
  }
  list.innerHTML = visible.map((note) => `<button class="group-item${note.id === nt.activeId ? " is-active" : ""}" type="button" data-open-note="${note.id}">
    <strong>${escapeHTML(note.title)}</strong>
    <small>${escapeHTML(note.subject)} · ${escapeHTML(stamp(note.updated))}</small>
  </button>`).join("");
}

function bindOnce() {
  if (nt.bound) return;
  nt.bound = true;

  $("#note-search").addEventListener("input", (event) => {
    nt.search = event.target.value;
    renderNotes();
  });

  $("#note-new").addEventListener("click", () => {
    resetEditor();
    renderNotes();
    $("#note-form").elements.title.focus();
  });

  $("#note-list").addEventListener("click", (event) => {
    const button = event.target.closest("[data-open-note]");
    if (!button) return;
    const note = nt.notes.find((entry) => entry.id === button.dataset.openNote);
    if (note) {
      loadEditor(note);
      renderNotes();
    }
  });

  $("#note-form").addEventListener("submit", (event) => {
    event.preventDefault();
    if (!state.user) return;
    const form = event.currentTarget;
    const title = form.elements.title.value.trim();
    if (!title) return;
    const body = form.elements.body.value.slice(0, 5000);
    const subject = form.elements.subject.value;
    runSafely(async () => {
      if (nt.activeId) {
        await updateDoc(doc(db, "users", state.user.uid, "notes", nt.activeId), {
          title,
          subject,
          body,
          updatedAt: serverTimestamp()
        });
        $("#note-status").textContent = "Saved just now";
      } else {
        const created = await addDoc(notesCollection(), {
          title,
          subject,
          body,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        nt.activeId = created.id;
        $("#note-delete").hidden = false;
        $("#note-status").textContent = "Saved just now";
      }
      showToast("Note saved.");
    }, event.submitter);
  });

  $("#note-delete").addEventListener("click", () => {
    if (!nt.activeId || !window.confirm("Delete this note?")) return;
    const id = nt.activeId;
    runSafely(async () => {
      await deleteDoc(doc(db, "users", state.user.uid, "notes", id));
      resetEditor();
      showToast("Note deleted.");
    });
  });
}

export function startNotes() {
  stopNotes();
  if (!state.user) return;
  bindOnce();
  resetEditor();
  nt.listener = onSnapshot(
    query(notesCollection(), limit(100)),
    (snapshot) => {
      nt.notes = snapshot.docs.map(toNote);
      setData("notes", nt.notes);
      if (nt.activeId && !nt.notes.some((note) => note.id === nt.activeId)) resetEditor();
      renderNotes();
    },
    (error) => {
      console.error("StudyGroup notes listener failed.", error);
      showBanner(getErrorMessage(error), true);
    }
  );
}

export function stopNotes() {
  if (nt.listener) nt.listener();
  nt.listener = null;
  nt.notes = [];
  nt.search = "";
  if (nt.bound) {
    $("#note-search").value = "";
    resetEditor();
    renderNotes();
  }
}
