import { getCurrentSession, getSessionUser } from "./auth-client.js";
import { collection, doc, getDoc, getDocs, limit, query, setDoc, updateDoc } from "./firestore-client.js";
import { db } from "./core.js";
import { closeNumber, generateMathQuestion, parseLinearExpression, shuffle } from "./question-generator.js";
import { playSound } from "./sound-effects.js";

const BOARD_INFO = {
  "AQA": { code: "8300", url: "https://www.aqa.org.uk/subjects/mathematics/gcse/mathematics-8300/specification/subject-content", detail: "Three papers: one non-calculator and two calculator papers. Foundation and Higher tiers." },
  "Edexcel": { code: "1MA1", url: "https://qualifications.pearson.com/en/qualifications/edexcel-gcses/mathematics-2015.html", detail: "Pearson Edexcel GCSE Mathematics (1MA1). Three papers, with Foundation and Higher tiers." },
  "Pearson Edexcel": { code: "1MA1", url: "https://qualifications.pearson.com/en/qualifications/edexcel-gcses/mathematics-2015.html", detail: "Three papers: one non-calculator and two calculator papers. Foundation and Higher tiers." },
  "OCR": { code: "J560", url: "https://www.ocr.org.uk/qualifications/gcse/mathematics-j560-from-2015/specification-at-a-glance/", detail: "Three papers. The specification groups content across number, algebra, ratio, geometry, probability and statistics." },
  "WJEC Eduqas": { code: "C300", url: "https://www.eduqas.co.uk/qualifications/mathematics-gcse/", detail: "Eduqas GCSE Mathematics (9–1), with Foundation and Higher tiers and two examination papers." },
  "WJEC (Wales)": { code: "Mathematics and Numeracy", url: "https://www.wjec.co.uk/qualifications/mathematics-gcse/", detail: "Wales qualification route. Check whether your school teaches the current Mathematics and Numeracy Double Award or another WJEC route." },
  "CCEA": { code: "GCSE Mathematics", url: "https://ccea.org.uk/downloads/docs/Specifications/GCSE/GCSE%20Mathematics%20%282017%29/GCSE%20Mathematics%20%282017%29-specification-Standard.pdf", detail: "Two tiers with unit choices; check the unit and assessment route used by your centre." },
  "Other": { code: "Check with school", url: "https://www.gov.uk/government/publications/gcse-subject-content-and-assessment-objectives", detail: "Ask your teacher which specification and qualification code your school uses." },
  "Not sure yet": { code: "Not selected", url: "https://www.gov.uk/government/publications/gcse-subject-content-and-assessment-objectives", detail: "Choose your board when your school confirms it." }
};
const BOARD_OPTIONS = Object.keys(BOARD_INFO).filter((board) => board !== "Edexcel");
const LEGACY_BOARD = { "Edexcel": "Pearson Edexcel", "Eduqas": "WJEC Eduqas", "WJEC": "WJEC (Wales)" };
const BOARD_HOME = { "AQA":"https://www.aqa.org.uk/subjects", "Pearson Edexcel":"https://qualifications.pearson.com/en/qualifications.html", "Edexcel":"https://qualifications.pearson.com/en/qualifications.html", "OCR":"https://www.ocr.org.uk/qualifications/", "WJEC Eduqas":"https://www.eduqas.co.uk/qualifications/", "WJEC (Wales)":"https://www.wjec.co.uk/qualifications/", "CCEA":"https://ccea.org.uk/qualifications", "Other":"https://www.gov.uk/government/collections/gcse-subject-content", "Not sure yet":"https://www.gov.uk/government/collections/gcse-subject-content" };
function boardInfoFor(course, board) {
  if (course.slug === "maths") return BOARD_INFO[board] || BOARD_INFO["Not sure yet"];
  return { code: "Subject specification", url: BOARD_HOME[board] || BOARD_HOME["Not sure yet"], detail: `${board} selected for ${course.title}. The exact specification code and topic coverage are subject-specific; confirm the qualification with your school.` };
}
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const normalise = (s) => String(s ?? "").toLowerCase().normalize("NFKD").replace(/[−–]/g,"-").replace(/×/g,"*").replace(/÷/g,"/").replace(/\s+/g,"").replace(/[£$,]/g,"").replace(/%/g,"%").replace(/\.0+(?=%|$)/g,"").replace(/\u00a0/g,"");

function buildDiagram(courseSlug, topicSlug) {
  if (courseSlug === "maths" && topicSlug?.includes("gradient")) return `<figure class="sg-diagram"><svg viewBox="0 0 520 270" role="img" aria-label="Coordinate grid showing a straight line and its rise and run"><defs><pattern id="sggrid" width="32" height="32" patternUnits="userSpaceOnUse"><path d="M32 0H0V32" fill="none" stroke="#e6e9e2" stroke-width="1"/></pattern></defs><rect x="40" y="15" width="440" height="220" fill="url(#sggrid)"/><path d="M40 235H485M40 235V8" stroke="#343b35" stroke-width="2"/><path d="M105 205L395 45" stroke="#4b8062" stroke-width="4"/><path d="M105 205V45H395" fill="none" stroke="#d08a38" stroke-width="3" stroke-dasharray="7 5"/><circle cx="105" cy="205" r="5" fill="#4b8062"/><circle cx="395" cy="45" r="5" fill="#4b8062"/><text x="112" y="222" font-size="13" fill="#343b35">Point A</text><text x="400" y="40" font-size="13" fill="#343b35">Point B</text><text x="245" y="226" font-size="14" fill="#a66b25">Run</text><text x="70" y="130" font-size="14" fill="#a66b25" transform="rotate(-90 70 130)">Rise</text></svg><figcaption>Gradient = rise ÷ run. The sign matters: a line falling from left to right has a negative gradient.</figcaption></figure>`;
  if (courseSlug === "maths" && topicSlug?.includes("linear-equations")) return `<figure class="sg-diagram"><svg viewBox="0 0 520 170" role="img" aria-label="A balanced scale representing equality"><path d="M260 25V132M170 132H350M210 132L185 153M310 132L335 153" stroke="#485449" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M85 55H435M130 55L105 112H155ZM390 55L365 112H415Z" stroke="#4b8062" stroke-width="4" fill="#eaf2e9"/><path d="M105 112H155M365 112H415" stroke="#4b8062" stroke-width="4"/><text x="130" y="91" text-anchor="middle" font-size="18" fill="#344238">x + 4</text><text x="390" y="91" text-anchor="middle" font-size="18" fill="#344238">9</text><text x="260" y="20" text-anchor="middle" font-size="13" fill="#687367">Equal on both sides</text></svg><figcaption>An equation behaves like a balanced scale. Whatever you do to one side, do to the other.</figcaption></figure>`;
  if (courseSlug === "maths" && topicSlug?.includes("percentage")) return `<figure class="sg-diagram"><svg viewBox="0 0 520 125" role="img" aria-label="A bar split into ten equal parts to represent ten percent"><rect x="35" y="25" width="450" height="48" rx="7" fill="#eef0e9" stroke="#aeb8a9"/><rect x="35" y="25" width="45" height="48" rx="6" fill="#4b8062"/><path d="M80 25V73M125 25V73M170 25V73M215 25V73M260 25V73M305 25V73M350 25V73M395 25V73M440 25V73" stroke="#aeb8a9"/><text x="57" y="100" text-anchor="middle" font-size="13" fill="#344238">10%</text><text x="260" y="100" text-anchor="middle" font-size="13" fill="#687367">10 equal parts make 100%</text></svg><figcaption>10% is one tenth of the original amount. A percentage change is always compared with the original value.</figcaption></figure>`;
  if (courseSlug === "biology" && topicSlug?.includes("moving-substances")) return `<figure class="sg-diagram"><svg viewBox="0 0 520 205" role="img" aria-label="Particles moving across a cell membrane from higher to lower concentration"><rect x="20" y="55" width="480" height="90" rx="12" fill="#f2f6ee" stroke="#c8d5c4"/><path d="M20 78H500M20 122H500" stroke="#648b6a" stroke-width="7" stroke-dasharray="8 6"/><g fill="#d58c47"><circle cx="55" cy="34" r="7"/><circle cx="90" cy="35" r="7"/><circle cx="125" cy="35" r="7"/><circle cx="160" cy="35" r="7"/><circle cx="195" cy="35" r="7"/><circle cx="230" cy="35" r="7"/><circle cx="265" cy="35" r="7"/><circle cx="300" cy="35" r="7"/><circle cx="335" cy="35" r="7"/><circle cx="370" cy="35" r="7"/><circle cx="405" cy="35" r="7"/><circle cx="440" cy="35" r="7"/></g><g fill="#d58c47"><circle cx="115" cy="165" r="7"/><circle cx="235" cy="165" r="7"/><circle cx="355" cy="165" r="7"/></g><path d="M245 45V150M238 140L245 150L252 140" stroke="#4b8062" stroke-width="3" fill="none"/><text x="260" y="18" font-size="13" fill="#435344">Higher concentration</text><text x="260" y="195" font-size="13" fill="#435344">Lower concentration</text></svg><figcaption>Diffusion is the net movement of particles down a concentration gradient. The membrane controls what crosses the cell boundary.</figcaption></figure>`;
  if (courseSlug === "chemistry" && topicSlug?.includes("atoms-ions")) return `<figure class="sg-diagram"><svg viewBox="0 0 520 220" role="img" aria-label="Simplified atom diagram with nucleus and electrons"><circle cx="260" cy="108" r="73" fill="none" stroke="#91a58c" stroke-width="2"/><ellipse cx="260" cy="108" rx="115" ry="48" fill="none" stroke="#91a58c" stroke-width="2" transform="rotate(-35 260 108)"/><ellipse cx="260" cy="108" rx="115" ry="48" fill="none" stroke="#91a58c" stroke-width="2" transform="rotate(35 260 108)"/><circle cx="260" cy="108" r="28" fill="#e8b36d"/><circle cx="250" cy="100" r="7" fill="#a85c45"/><circle cx="270" cy="100" r="7" fill="#a85c45"/><circle cx="260" cy="117" r="7" fill="#8b9cb7"/><circle cx="145" cy="108" r="7" fill="#4e7fa5"/><circle cx="320" cy="38" r="7" fill="#4e7fa5"/><circle cx="375" cy="108" r="7" fill="#4e7fa5"/><text x="260" y="178" text-anchor="middle" font-size="13" fill="#485449">Nucleus: protons (+) and neutrons (0)</text><text x="260" y="202" text-anchor="middle" font-size="13" fill="#485449">Electrons (−) occupy shells around the nucleus</text></svg><figcaption>This is a simplified model, not a scale drawing. An ion forms when an atom gains or loses electrons.</figcaption></figure>`;
  if (courseSlug === "physics" && topicSlug?.includes("series-circuit")) return `<figure class="sg-diagram"><svg viewBox="0 0 520 190" role="img" aria-label="Simple series circuit with a cell and two resistors"><path d="M100 50H190M270 50H420V145H100V50" stroke="#4b7453" stroke-width="4" fill="none"/><rect x="190" y="36" width="80" height="28" rx="5" fill="#f5eadb" stroke="#c28b4b" stroke-width="3"/><path d="M100 83V113M88 89H112M92 107H108" stroke="#485449" stroke-width="3"/><path d="M320 145V115" stroke="#4b7453" stroke-width="3"/><path d="M312 124L320 114L328 124" stroke="#4b7453" stroke-width="3" fill="none"/><text x="230" y="55" text-anchor="middle" font-size="13" fill="#485449">Resistor 1</text><text x="320" y="105" text-anchor="middle" font-size="13" fill="#485449">Current</text><text x="100" y="135" text-anchor="middle" font-size="12" fill="#485449">Cell</text><text x="260" y="177" text-anchor="middle" font-size="13" fill="#485449">One complete path: the current is the same everywhere</text></svg><figcaption>In a series circuit, components share one path. The current is the same at every point in that loop.</figcaption></figure>`;
  if (courseSlug === "history" && topicSlug?.includes("cause-and-consequence")) return `<figure class="sg-diagram"><svg viewBox="0 0 520 150" role="img" aria-label="A chain showing cause, link and consequence"><g fill="#eef3eb" stroke="#9cac96" stroke-width="2"><rect x="8" y="35" width="145" height="72" rx="9"/><rect x="187" y="35" width="145" height="72" rx="9"/><rect x="366" y="35" width="145" height="72" rx="9"/></g><g fill="#405443" font-size="13" text-anchor="middle"><text x="80" y="65">Poor harvest</text><text x="80" y="84">(cause)</text><text x="260" y="65">Food prices rise</text><text x="260" y="84">(link)</text><text x="438" y="65">Hardship grows</text><text x="438" y="84">(consequence)</text></g><path d="M155 71H183M176 64L184 71L176 78M334 71H362M355 64L363 71L355 78" stroke="#6b8b68" stroke-width="3" fill="none"/></svg><figcaption>Strong historical explanations make the links between events explicit rather than listing events separately.</figcaption></figure>`;
  return "";
}

function makeCards(course, lesson) {
  const cards = [];
  cards.push({front:`What is the main idea of ${lesson.title}?`,back:lesson.summary});
  for (const point of lesson.points) cards.push({front:`Explain: ${point.split(" is ")[0].split(" means ")[0]}.`,back:point});
  cards.push({front:"What is the worked example?",back:lesson.example});
  if (course.slug === "maths" && lesson.title.toLowerCase().includes("linear")) {
    cards.push({front:"What keeps an equation equivalent?",back:"Perform the same valid operation on both sides."},{front:"How do you check a solution?",back:"Substitute it into the original equation."},{front:"What is the inverse of multiplication?",back:"Division."});
  }
  return shuffle(cards).slice(0, Math.min(12,cards.length));
}

async function loadProfile() {
  try {
    const session = await getCurrentSession();
    if (session.error) throw session.error;
    const user = getSessionUser(session);
    if (!user) return { user:null, profile:null };
    const id = user.uid || user.id;
    const snap = await getDoc(doc(db,"users",id));
    return { user, profile:snap.data() || {}, id };
  } catch (error) { console.warn("StudyGroup board preferences could not be loaded.",error); return {user:null,profile:null}; }
}

function renderFlashcards(course, lesson) {
  const cards = makeCards(course,lesson);
  return `<section class="sg-flashcards" aria-label="Lesson flashcards"><div class="sg-section-heading"><div><span class="sg-eyebrow">ACTIVE RECALL</span><h2>Flashcards · ${cards.length} cards</h2><p>Try to recall the answer before revealing it.</p></div><button type="button" class="sg-secondary-button" data-card-shuffle>Shuffle</button></div><div class="sg-card" data-sg-card tabindex="0" role="button" aria-label="Flashcard. Activate to reveal answer"><span class="sg-card-count" data-card-count>Card 1 of ${cards.length}</span><span class="sg-card-side" data-card-side>QUESTION</span><strong data-card-text>${esc(cards[0].front)}</strong><span class="sg-card-hint" data-card-hint>Tap or press Enter to reveal</span></div><div class="sg-card-controls"><button type="button" data-card-prev>← Previous</button><button type="button" data-card-flip>Reveal answer</button><button type="button" data-card-next>Next →</button></div><div class="sg-card-rating" hidden data-card-rating><span>Did you know it?</span><button type="button" data-card-known="yes">I knew it</button><button type="button" data-card-known="no">Need to review</button></div><p class="sg-card-progress" data-card-progress>0 known · ${cards.length} to review</p><p class="sg-review-insight" data-review-insight aria-live="polite">Your review schedule will appear here.</p></section>`;
}

function renderGenerator() {
  return `<section class="sg-generator"><div class="sg-section-heading"><div><span class="sg-eyebrow">PROCEDURAL PRACTICE</span><h2>Fresh practice, every time</h2><p>New values and contexts are generated when you create a worksheet. Each question carries its own answer and worked solution.</p></div><span class="sg-random-mark">↻</span></div><div class="sg-generator-controls"><label>Tier<select data-sg-tier><option>Foundation</option><option>Higher</option></select></label><label>Questions<select data-sg-count><option>8</option><option selected>12</option><option>16</option><option>20</option></select></label><button type="button" class="sg-primary-button" data-sg-generate>Generate new worksheet</button></div><div class="sg-generated-meta" data-sg-meta aria-live="polite">No worksheet generated yet.</div><ol class="sg-generated-questions" data-sg-questions></ol><div class="sg-generated-score" data-sg-score hidden></div></section>`;
}

function reviewKey(text) {
  let hash = 2166136261;
  for (const character of String(text)) { hash ^= character.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return `card-${(hash >>> 0).toString(36)}`;
}

async function initFlashcards(root, userId, course, lesson) {
  const section = root.querySelector(".sg-flashcards"); if (!section) return;
  const cards = makeCards(course, lesson);
  const reviewRecords = new Map();
  if (userId) {
    try {
      const snapshot = await getDocs(query(collection(db, "users", userId, "learningReviews"), limit(250)));
      snapshot.docs.forEach((entry) => {
        const data = entry.data();
        if (data.course === course.slug && data.topic === lesson.title) reviewRecords.set(entry.id, data);
      });
    } catch (error) { console.warn("Could not load spaced-repetition history.", error); }
  } else {
    for (const card of cards) {
      const key = reviewKey(card.front);
      try {
        const saved = localStorage.getItem(`sg-review:${key}`);
        if (saved) {
          const data = JSON.parse(saved);
          if (data.course === course.slug && data.topic === lesson.title) reviewRecords.set(key, data);
        }
      } catch {}
    }
  }
  const now = Date.now();
  let order = cards.map((_, i) => i).sort((a, b) => {
    const first = reviewRecords.get(reviewKey(cards[a].front));
    const second = reviewRecords.get(reviewKey(cards[b].front));
    const firstDue = first?.nextReviewAt ? new Date(first.nextReviewAt).getTime() : 0;
    const secondDue = second?.nextReviewAt ? new Date(second.nextReviewAt).getTime() : 0;
    const firstRank = !first ? 1 : firstDue <= now ? 0 : 2;
    const secondRank = !second ? 1 : secondDue <= now ? 0 : 2;
    return firstRank - secondRank || firstDue - secondDue;
  }), index=0, revealed=false, known=new Set(), missed=new Set();
  const card=section.querySelector("[data-sg-card]"), text=section.querySelector("[data-card-text]"), side=section.querySelector("[data-card-side]"), hint=section.querySelector("[data-card-hint]"), rating=section.querySelector("[data-card-rating]");
  const show=()=>{const c=cards[order[index]]; text.textContent=revealed?c.back:c.front; side.textContent=revealed?"ANSWER":"QUESTION"; hint.textContent=revealed?"Mark your confidence below":"Tap or press Enter to reveal"; section.querySelector("[data-card-count]").textContent=`Card ${index+1} of ${cards.length}`; rating.hidden=!revealed; section.querySelector("[data-card-progress]").textContent=`${known.size} known · ${missed.size} marked to review · ${cards.length-known.size} not yet known`;};
  const flip=()=>{revealed=!revealed;playSound("flip");show();};
  card.addEventListener("click",flip); card.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();flip();}});
  section.querySelector("[data-card-flip]").addEventListener("click",flip);
  section.querySelector("[data-card-prev]").addEventListener("click",()=>{index=(index-1+cards.length)%cards.length;revealed=false;show();});
  section.querySelector("[data-card-next]").addEventListener("click",()=>{index=(index+1)%cards.length;revealed=false;show();});
  section.querySelector("[data-card-shuffle]").addEventListener("click",()=>{order=shuffle(order);index=0;revealed=false;show();});
  rating.addEventListener("click", async e => {
    const btn = e.target.closest("[data-card-known]"); if (!btn) return;
    const cardIndex = order[index];
    const currentCard = cards[cardIndex];
    const key = reviewKey(currentCard.front);
    const previous = reviewRecords.get(key) || {};
    const recalled = btn.dataset.cardKnown === "yes";
    if (recalled) { known.add(cardIndex); missed.delete(cardIndex); }
    else { missed.add(cardIndex); known.delete(cardIndex); }
    const repetitions = recalled ? (Number(previous.repetitions) || 0) + 1 : 0;
    const previousInterval = Number(previous.intervalDays) || 0;
    const intervalDays = recalled ? (repetitions === 1 ? 1 : repetitions === 2 ? 3 : Math.min(30, Math.max(1, previousInterval * 2))) : 1;
    const reviewedAt = new Date();
    const nextReviewAt = new Date(reviewedAt.getTime() + intervalDays * 86_400_000).toISOString();
    const record = { cardFront: currentCard.front, cardBack: currentCard.back, course: course.slug, topic: lesson.title, repetitions, intervalDays, nextReviewAt, lastReviewedAt: reviewedAt.toISOString(), lastResult: recalled ? "remembered" : "review-again", mastery: Math.min(100, Math.round(repetitions / 5 * 100)) };
    reviewRecords.set(key, record);
    const dueCount = [...reviewRecords.values()].filter(item => item.nextReviewAt && new Date(item.nextReviewAt).getTime() <= Date.now()).length;
    const insight = section.querySelector("[data-review-insight]");
    const secureCount = [...reviewRecords.values()].filter(item => Number(item.mastery) >= 80).length;
    if (insight) insight.textContent = `${dueCount} due for review · ${secureCount}/${cards.length} cards secure · next review in ${intervalDays} day${intervalDays === 1 ? "" : "s"}`;
    if (userId) {
      btn.disabled = true;
      try { await setDoc(doc(db, "users", userId, "learningReviews", key), record, { merge: true }); }
      catch (error) { console.warn("Could not save spaced-repetition review.", error); }
      finally { btn.disabled = false; }
    } else {
      try { localStorage.setItem(`sg-review:${key}`, JSON.stringify(record)); } catch {}
    }
    index=(index+1)%cards.length;revealed=false;show();
  });
  const dueCount = [...reviewRecords.values()].filter(item => item.nextReviewAt && new Date(item.nextReviewAt).getTime() <= Date.now()).length;
  const insight = section.querySelector("[data-review-insight]");
  const secureCount = [...reviewRecords.values()].filter(item => Number(item.mastery) >= 80).length;
  if (insight) insight.textContent = `${dueCount} due for review · ${secureCount}/${cards.length} cards secure${userId ? " · schedule synced to your account" : " · saved on this device"}`;
  show();
}

function initGenerator(root, board) {
  const section=root.querySelector(".sg-generator"); if(!section)return;
  const list=section.querySelector("[data-sg-questions]"), meta=section.querySelector("[data-sg-meta]"), score=section.querySelector("[data-sg-score]");
  let questions=[], checked=new Set();
  const generate=()=>{const count=Number(section.querySelector("[data-sg-count]").value),tier=section.querySelector("[data-sg-tier]").value;questions=shuffle(Array.from({length:count},(_,i)=>generateMathQuestion(tier,i)));checked.clear();score.hidden=true;list.innerHTML=questions.map((q,i)=>`<li class="sg-question" data-sg-q="${i}"><div class="sg-question-top"><span>${esc(q.topic)}</span><span>${q.marks} marks</span></div><p>${esc(q.prompt)}</p><label>Your answer<input type="text" maxlength="120" autocomplete="off" data-sg-answer="${i}" placeholder="Enter your answer"></label><div class="sg-question-actions"><button type="button" data-sg-check="${i}">Mark answer</button><button type="button" data-sg-show="${i}">Show worked solution</button></div><div class="sg-feedback" data-sg-feedback="${i}" aria-live="polite"></div><details class="sg-solution" data-sg-solution="${i}"><summary>Worked solution and marking</summary><ol>${q.steps.map(s=>`<li>${esc(s)}</li>`).join("")}</ol><p><strong>Answer: ${esc(q.answer)}</strong></p><p class="sg-mark-note">${q.marks} marks available. Method marks reward correct steps, not just the final answer.</p></details></li>`).join("");meta.textContent=`${count} newly generated questions · Selected board: ${board} · ${tier} tier. These are original questions on shared GCSE-style topics, not official past-paper questions.`;};
  section.querySelector("[data-sg-generate]").addEventListener("click",generate);
  section.addEventListener("click",e=>{const check=e.target.closest("[data-sg-check]");const reveal=e.target.closest("[data-sg-show]");if(reveal){section.querySelector(`[data-sg-solution="${reveal.dataset.sgShow}"]`).open=true;return;}if(!check)return;const i=Number(check.dataset.sgCheck),q=questions[i],input=section.querySelector(`[data-sg-answer="${i}"]`),feedback=section.querySelector(`[data-sg-feedback="${i}"]`);if(!input.value.trim()){feedback.textContent="Enter an attempt first. You can include your working in the answer field.";feedback.className="sg-feedback is-error";input.focus();return;}const raw=input.value.trim();const expressionAnswer = q.linear ? parseLinearExpression(raw) : null;const numericAttempt = raw.replace(/^[a-z]+=/i, "").trim();const isCorrect=(q.accepts||[]).some(a=>normalise(raw)===normalise(a))||(typeof q.numeric==="number"&&closeNumber(numericAttempt,q.numeric))||(Boolean(q.linear&&expressionAnswer&&Math.abs(expressionAnswer.x-q.linear.x)<1e-9&&Math.abs(expressionAnswer.constant-q.linear.constant)<1e-9));if(isCorrect){checked.add(i);playSound("success");feedback.innerHTML=`<strong>Correct.</strong> Your answer matches the expected result. Open the worked solution to review the method.`;feedback.className="sg-feedback is-correct";}else{checked.delete(i);feedback.innerHTML=`<strong>Not quite yet.</strong> ${esc(q.hint)} Try again, or reveal the worked solution when ready.`;feedback.className="sg-feedback is-error";}const correct=section.querySelectorAll(".sg-feedback.is-correct").length;score.hidden=false;score.textContent=`${correct} of ${questions.length} currently correct. Keep trying the questions marked for review.`;});
  generate();
}


function renderQuickFire(course) {
  const topics = course.notes.map((note, index) => `<option value="${index}">${esc(note.title)}</option>`).join("");
  return `<section class="sg-quick-fire"><header class="sg-quick-fire-header"><span class="sg-eyebrow">QUICK FIRE · ACTIVE RECALL</span><h2>Test what you know.</h2><p>Choose a topic and get a fresh, shuffled set of short questions. Questions are generated locally from the StudyGroup topic notes and practice material.</p></header><div class="sg-quick-fire-setup"><label>Topic<select data-qf-topic>${topics}</select></label><label>Questions<select data-qf-count><option value="5">5 questions</option><option value="10" selected>10 questions</option><option value="15">15 questions</option></select></label><button class="sg-primary-button" type="button" data-qf-start>Start Quick Fire →</button></div><div class="sg-quick-fire-stage" data-qf-stage hidden><div class="sg-quick-fire-progress"><span data-qf-counter>Question 1 of 10</span><progress max="10" value="1" data-qf-progress></progress></div><div class="sg-quick-fire-question" data-qf-question></div><div class="sg-quick-fire-feedback" data-qf-feedback aria-live="polite"></div><div class="sg-quick-fire-actions"><button type="button" class="sg-secondary-button" data-qf-skip>Skip</button><button type="button" class="sg-primary-button" data-qf-next disabled>Next question →</button></div></div><div class="sg-quick-fire-finish" data-qf-finish hidden><span class="sg-eyebrow">ROUND COMPLETE</span><h3 data-qf-result>0 / 10</h3><p data-qf-summary></p><button type="button" class="sg-primary-button" data-qf-again>Generate another round</button></div></section>`;
}

function initQuickFire(root, course) {
  const section = root.querySelector(".sg-quick-fire"); if (!section) return;
  const stage = section.querySelector("[data-qf-stage]"), finish = section.querySelector("[data-qf-finish]");
  let questions = [], index = 0, score = 0, answered = false;
  const buildQuestions = () => {
    const topicIndex = Number(section.querySelector("[data-qf-topic]").value) || 0;
    const topic = course.notes[topicIndex];
    const count = Number(section.querySelector("[data-qf-count]").value) || 10;
    const facts = course.notes.flatMap((note) => note.points.map((fact) => ({ topic: note.title, fact })));
    const sourceFacts = topic.points.length ? topic.points : [topic.summary];
    const bank = [];
    for (let i = 0; i < count; i++) {
      const fact = sourceFacts[i % sourceFacts.length];
      const distractors = shuffle(facts.filter((entry) => entry.fact !== fact).map((entry) => entry.fact)).slice(0, 3);
      const options = shuffle([fact, ...distractors]);
      const stems = [`Which statement is correct about ${topic.title.toLowerCase()}?`, `Choose the key idea that best matches ${topic.title.toLowerCase()}.`, `Which fact belongs in your revision notes for ${topic.title.toLowerCase()}?`, `A student is revising ${topic.title.toLowerCase()}. Which statement should they remember?`];
      bank.push({ prompt: stems[i % stems.length], answer: fact, options });
    }
    return shuffle(bank);
  };
  const show = () => {
    const q = questions[index]; answered = false;
    section.querySelector("[data-qf-counter]").textContent = `Question ${index + 1} of ${questions.length}`;
    const progress = section.querySelector("[data-qf-progress]"); progress.max = questions.length; progress.value = index + 1;
    section.querySelector("[data-qf-feedback]").textContent = "";
    section.querySelector("[data-qf-next]").disabled = true;
    section.querySelector("[data-qf-question]").innerHTML = `<h3>${esc(q.prompt)}</h3><div class="sg-quick-fire-options">${q.options.map((option, i) => `<button type="button" class="sg-quick-fire-option" data-qf-option="${i}">${String.fromCharCode(65 + i)} <span>${esc(option)}</span></button>`).join("")}</div>`;
  };
  const start = () => { questions = buildQuestions(); index = 0; score = 0; finish.hidden = true; stage.hidden = false; show(); };
  section.querySelector("[data-qf-start]").addEventListener("click", start);
  section.querySelector("[data-qf-again]").addEventListener("click", start);
  section.querySelector("[data-qf-question]").addEventListener("click", (event) => {
    const option = event.target.closest("[data-qf-option]"); if (!option || answered) return;
    answered = true; const q = questions[index], chosen = q.options[Number(option.dataset.qfOption)];
    const correct = chosen === q.answer; if (correct) { score++; playSound("success"); }
    section.querySelectorAll("[data-qf-option]").forEach((button) => { button.disabled = true; const value = q.options[Number(button.dataset.qfOption)]; if (value === q.answer) button.classList.add("is-correct"); else if (button === option) button.classList.add("is-incorrect"); });
    section.querySelector("[data-qf-feedback]").textContent = correct ? "Correct — nicely recalled." : `Not quite. The key idea is: ${q.answer}`;
    section.querySelector("[data-qf-next]").disabled = false;
  });
  section.querySelector("[data-qf-skip]").addEventListener("click", () => { if (!answered) { answered = true; section.querySelector("[data-qf-feedback]").textContent = `Answer: ${questions[index].answer}`; section.querySelectorAll("[data-qf-option]").forEach((button) => { button.disabled = true; if (questions[index].options[Number(button.dataset.qfOption)] === questions[index].answer) button.classList.add("is-correct"); }); section.querySelector("[data-qf-next]").disabled = false; } });
  section.querySelector("[data-qf-next]").addEventListener("click", () => { if (!answered) return; if (index < questions.length - 1) { index++; show(); } else { stage.hidden = true; finish.hidden = false; playSound("xp"); section.querySelector("[data-qf-result]").textContent = `${score} / ${questions.length}`; section.querySelector("[data-qf-summary]").textContent = score === questions.length ? "Perfect round. Excellent recall." : `You got ${score} right. Try another shuffled round to strengthen recall.`; } });
}

export async function mountLearningEnhancements({course, lesson, pageType, topicSlug}) {
  const main=document.querySelector(".course-main"); if(!main||!course)return;
  if (pageType === "quick-fire") { const mount = main.querySelector("[data-quick-fire-mount]"); if (mount) { mount.innerHTML = renderQuickFire(course); initQuickFire(mount, course); } return; }
  const {user,profile,id}=await loadProfile();
  const subjectName=course.title === "Mathematics" ? "Maths" : course.title;
  let board=profile?.boards?.[subjectName] || profile?.boards?.[course.title] || "Not sure yet";
  if (board === "Not sure yet") { try { board=localStorage.getItem(`sg-board:${course.slug}`)||board; } catch {} }
  if (LEGACY_BOARD[board]) board = LEGACY_BOARD[board];
  if(!BOARD_INFO[board]) board="Not sure yet";
  let boardInfo = boardInfoFor(course, board);
  const boardPanel=document.createElement("section");boardPanel.className="sg-board-panel";
  boardPanel.innerHTML=`<div><span class="sg-eyebrow">YOUR EXAM ROUTE</span><h2>${esc(board)} <span>${esc(boardInfo.code)}</span></h2><p>${esc(boardInfo.detail)}</p><a href="${boardInfo.url}" target="_blank" rel="noopener noreferrer">Official specification and subject content ↗</a></div><label>My exam board<select data-sg-board>${BOARD_OPTIONS.map(b=>`<option value="${esc(b)}" ${b===board?"selected":""}>${esc(b)}</option>`).join("")}</select></label>`;
  const tabs=main.querySelector(".course-view-tabs"); if(tabs)tabs.insertAdjacentElement("beforebegin",boardPanel);else main.prepend(boardPanel);
  if (course.slug === "maths") {
    const strands = ["Number", "Algebra", "Ratio, proportion and rates of change", "Geometry and measures", "Probability", "Statistics"];
    const map = document.createElement("section"); map.className = "sg-curriculum-map";
    map.innerHTML = `<div><span class="sg-eyebrow">GCSE MATHEMATICS CONTENT MAP</span><h2>Core topic areas</h2><p>Use this as the StudyGroup topic structure, then check the linked specification for the exact requirements of your qualification and tier.</p></div><div class="sg-strand-grid">${strands.map((name,i)=>`<div><span>0${i+1}</span><strong>${esc(name)}</strong></div>`).join("")}</div>`;
    boardPanel.insertAdjacentElement("afterend", map);
  }
  boardPanel.querySelector("[data-sg-board]").addEventListener("change",async e=>{const next=e.target.value;board=next;boardInfo=boardInfoFor(course,board);boardPanel.querySelector("h2").innerHTML=`${esc(board)} <span>${esc(boardInfo.code)}</span>`;boardPanel.querySelector("p").textContent=boardInfo.detail;boardPanel.querySelector("a").href=boardInfo.url;try{localStorage.setItem(`sg-board:${course.slug}`,board);}catch{}if(user&&id){try{await updateDoc(doc(db,"users",id),{boards:{...(profile?.boards||{}),[subjectName]:board}});boardPanel.querySelector("a").insertAdjacentText("afterend"," · Saved to your profile");}catch(error){console.warn("Could not sync exam board selection.",error);}}if(course.slug==="maths"){const meta=main.querySelector("[data-sg-meta]");if(meta)meta.textContent=`Board changed to ${board}. Generate a fresh set to use this board context.`;}});
  const activeLesson=topicSlug?course.notes.find(n=>n.title.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)/g,"")===topicSlug):null;
  const flashLesson=activeLesson||course.notes[0];
  if(flashLesson){const wrapper=document.createElement("div");wrapper.innerHTML=renderFlashcards(course,flashLesson);const lessonPlayer=main.querySelector(".lesson-player");const lessonCard=main.querySelector(".course-note-card");const anchor=lessonPlayer||lessonCard||main.querySelector(".course-view-tabs");if(anchor)anchor.insertAdjacentElement("afterend",wrapper.firstElementChild);else main.append(wrapper.firstElementChild);window.__sgCourse=course;window.__sgLesson=flashLesson;void initFlashcards(main, id, course, flashLesson);}
  if(course.slug==="maths"&&pageType==="worksheets"){const wrapper=document.createElement("div");wrapper.innerHTML=renderGenerator();const target=main.querySelector(".course-material-list");if(target)target.insertAdjacentElement("beforebegin",wrapper.firstElementChild);else main.append(wrapper.firstElementChild);initGenerator(main,board);}
  if(course.slug==="maths"&&topicSlug){const diagram=buildDiagram(course.slug,topicSlug);const lesson=main.querySelector(".lesson-player");if(diagram&&lesson){const slide=lesson.querySelector(".lesson-slide-intro");if(slide)slide.insertAdjacentHTML("beforeend",diagram);}}
}
