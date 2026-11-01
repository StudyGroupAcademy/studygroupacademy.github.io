import { $, $$ } from "./core.js";

function applyResourceFilter() {
  const active = $("[data-resource-filter].is-active");
  const topic = active ? active.dataset.resourceFilter : "all";
  const term = $("#resource-search").value.trim().toLowerCase();
  let shown = 0;
  $$(".resource-pick").forEach((card) => {
    const subjects = card.dataset.subjects.split(" ");
    const matchesTopic = topic === "all" || subjects.includes(topic);
    const matchesTerm = !term || card.textContent.toLowerCase().includes(term);
    card.hidden = !(matchesTopic && matchesTerm);
    if (!card.hidden) shown += 1;
  });
  $("#resource-empty").hidden = shown > 0;
}

export function initResourceFilter() {
  $$("[data-resource-filter]").forEach((chip) => {
    chip.addEventListener("click", () => {
      $$("[data-resource-filter]").forEach((other) => other.classList.toggle("is-active", other === chip));
      applyResourceFilter();
    });
  });
  $("#resource-search").addEventListener("input", applyResourceFilter);
}
