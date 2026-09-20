import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createFeedStatus } from '../src/status';
beforeEach(() => { vi.useFakeTimers(); document.body.innerHTML = ''; });
afterEach(() => { vi.useRealTimers(); document.querySelector('.ytf-status')?.remove(); });
it('shows loading before the body exists and keeps fast responses visible', () => {
  const body = document.body;
  body.remove();
  const status = createFeedStatus();
  status.start();
  const toast = document.querySelector<HTMLElement>('.ytf-status')!;
  expect(toast.hidden).toBe(false);
  expect(toast.dataset.state).toBe('loading');
  document.documentElement.append(body);
  status.complete();
  vi.advanceTimersByTime(999);
  expect(toast.dataset.state).toBe('loading');
  vi.advanceTimersByTime(1);
  expect(toast.textContent).toBe('Brain snacks, sorted.');
  vi.advanceTimersByTime(1400);
  expect(toast.hidden).toBe(true);
});
it('does not let a previous completion timer hide a new batch', () => {
  const status = createFeedStatus(); status.start(); status.complete();
  vi.advanceTimersByTime(1100);
  status.start();
  vi.advanceTimersByTime(3000);
  expect(document.querySelector<HTMLElement>('.ytf-status')!.hidden).toBe(false);
  expect(document.querySelector('.ytf-status')!.getAttribute('data-state')).toBe('loading');
});
it('pausing hides immediately and errors replace loading without an old timer clearing them', () => {
  const status = createFeedStatus(); status.start(); status.complete(); status.hide();
  expect(document.querySelector<HTMLElement>('.ytf-status')!.hidden).toBe(true);
  status.start(); status.complete(); status.error('Connection lost');
  vi.advanceTimersByTime(5000);
  expect(document.querySelector('.ytf-status')!.textContent).toBe('Connection lost');
  expect(document.querySelector<HTMLElement>('.ytf-status')!.hidden).toBe(false);
});
