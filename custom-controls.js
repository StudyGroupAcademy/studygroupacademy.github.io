/*
 * StudyGroup form controls. Keep real HTML controls interactive.
 * The previous contenteditable proxy broke native keyboard behaviour,
 * label activation, browser autofill, validation and form integrations.
 * Native controls are now styled directly, so every existing form listener
 * continues to receive genuine input/change events and native values.
 */
(() => {
  const selector = 'input:not([type=hidden]):not([type=submit]):not([type=reset]):not([type=button]):not([type=image]), select, textarea';
  const enhance = (element) => {
    if (!(element instanceof HTMLElement) || element.dataset.sgControlReady === 'true') return;
    element.dataset.sgControlReady = 'true';
    element.classList.add('sg-native-control');
  };
  const scan = (root) => {
    if (root.matches?.(selector)) enhance(root);
    root.querySelectorAll?.(selector).forEach(enhance);
  };
  const start = () => {
    scan(document);
    new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) scan(node);
        }
      }
    }).observe(document.body, { childList: true, subtree: true });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
