import type { User } from '../lib/api/types';

/** Public URL of a user's avatar served by the API, or null when they have none. */
export function avatarUrlFor(user: Pick<User, 'avatarPath' | 'updatedAt'>): string | null {
  if (!user.avatarPath) return null;
  const fileName = user.avatarPath.split('/').pop();
  // updatedAt busts the browser cache after the user changes their photo.
  return `/api/v1/files/avatars/${encodeURIComponent(fileName ?? '')}?v=${encodeURIComponent(user.updatedAt)}`;
}
