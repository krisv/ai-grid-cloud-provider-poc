import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
afterEach(cleanup);
window.matchMedia = vi.fn().mockImplementation(query=>({matches:false,media:query,addListener:vi.fn(),removeListener:vi.fn(),addEventListener:vi.fn(),removeEventListener:vi.fn(),dispatchEvent:vi.fn()}));
class ResizeObserverMock {observe() {} unobserve() {} disconnect() {}}
vi.stubGlobal('ResizeObserver',ResizeObserverMock);
HTMLElement.prototype.scrollIntoView = vi.fn();
