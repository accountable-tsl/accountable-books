import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setLogoutReason, getLogoutReason, clearLogoutReason } from './utils';

const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};

Object.defineProperty(window, 'localStorage', { value: localStorageMock });

describe('Logout Reason Management', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.setSystemTime(1640995200000); // 2022-01-01 00:00:00 UTC
  });

  it('should set and get logout reason', () => {
    setLogoutReason('expired');
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'logoutReason',
      JSON.stringify({ reason: 'expired', timestamp: 1640995200000 }),
    );

    localStorageMock.getItem.mockReturnValue(
      JSON.stringify({ reason: 'expired', timestamp: 1640995200000 }),
    );
    expect(getLogoutReason()).toBe('expired');
  });

  it('should expire after 12 hours', () => {
    localStorageMock.getItem.mockReturnValue(
      JSON.stringify({ reason: 'expired', timestamp: 1640995200000 }),
    );
    vi.setSystemTime(1640995200000 + 13 * 60 * 60 * 1000); // 13 hours later

    expect(getLogoutReason()).toBeNull();
    expect(localStorageMock.removeItem).toHaveBeenCalledWith('logoutReason');
  });

  it('should handle invalid data gracefully', () => {
    localStorageMock.getItem.mockReturnValue('invalid json');
    expect(getLogoutReason()).toBeNull();
    expect(localStorageMock.removeItem).toHaveBeenCalledWith('logoutReason');
  });

  it('should clear logout reason', () => {
    clearLogoutReason();
    expect(localStorageMock.removeItem).toHaveBeenCalledWith('logoutReason');
  });
});
