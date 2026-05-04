import { apiFetch, setTokens, clearTokens } from './client';
import { adaptUser, type CurrentUser, type RawUser } from './adapters/user.adapter';

export type { CurrentUser };

// ---------------------------------------------------------------------------
// Auth API
// ---------------------------------------------------------------------------

interface LoginResponse {
  user: RawUser;
  token: string;
  refreshToken: string;
}

export async function login(email: string, password: string): Promise<CurrentUser> {
  const data = await apiFetch<LoginResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  setTokens(data.token, data.refreshToken);
  return adaptUser(data.user);
}

export async function logout(): Promise<void> {
  clearTokens();
}

interface ProfileResponse {
  user: RawUser;
}

export async function fetchProfile(): Promise<CurrentUser> {
  const data = await apiFetch<ProfileResponse>('/api/auth/profile');
  return adaptUser(data.user);
}

export async function updateProfile(
  patch: Partial<Pick<CurrentUser, 'firstName' | 'lastName' | 'email' | 'phone' | 'avatar'>>,
): Promise<CurrentUser> {
  const data = await apiFetch<RawUser>('/api/auth/me', {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  return adaptUser(data);
}

export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  await apiFetch('/api/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}
