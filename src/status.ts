const MIN_LOADING_MS = 1000;
const DONE_MS = 1400;

export function createFeedStatus() {
  let element: HTMLDivElement | undefined;
  let phase: 'idle' | 'loading' | 'done' | 'error' = 'idle';
  let started = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  function cancel() { clearTimeout(timer); timer = undefined; }
  function render(text: string, state: string) {
    if (!element) {
      element = document.createElement('div');
      element.className = 'ytf-status';
      element.setAttribute('role', 'status');
      element.setAttribute('aria-live', 'polite');
    }
    if (!element.isConnected) (document.body ?? document.documentElement).append(element);
    element.dataset.state = state;
    element.textContent = text;
    element.hidden = false;
  }
  function hide() {
    cancel(); phase = 'idle';
    if (element) element.hidden = true;
  }
  return {
    start() {
      cancel();
      if (phase !== 'loading') started = Date.now();
      phase = 'loading';
      render('Sorting snacks for your brain…', 'loading');
    },
    complete() {
      if (phase !== 'loading' || timer !== undefined) return;
      timer = setTimeout(() => {
        phase = 'done';
        render('Brain snacks, sorted.', 'done');
        timer = setTimeout(hide, DONE_MS);
      }, Math.max(0, MIN_LOADING_MS - (Date.now() - started)));
    },
    error(text: string) { cancel(); phase = 'error'; render(text, 'error'); },
    hide,
  };
}
