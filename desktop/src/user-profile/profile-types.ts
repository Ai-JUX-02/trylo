// Trylo Desktop — user profile types + forgiving JSON codec.
// The profile is the user's own identity card (nickname, one-line
// bio, avatar). It lives in its OWN area under the app data dir
// (`<appDataDir>/profile/`), deliberately separate from the
// per-workspace `.trylo/settings.json` — identity is machine-wide,
// settings are per-project.
//
// Reads are forgiving (missing file / malformed JSON / unknown
// avatar shape → defaults), mirroring SettingsService's contract.

export interface InitialAvatar {
  readonly kind: 'initial';
  readonly letter: string;
  readonly bg: string;
  readonly fg: string;
}

export interface ImageAvatar {
  readonly kind: 'image';
  /** Bare file name inside the profile dir (e.g. `avatar.png`).
   *  Never a path — validated on parse. */
  readonly file: string;
}

export type ProfileAvatar = InitialAvatar | ImageAvatar;

export interface UserProfile {
  readonly nickname: string;
  readonly bio: string;
  readonly avatar: ProfileAvatar;
}

/** A UserProfile plus the resolved display URL for image avatars
 *  (a data URL built from the stored bytes; null for initials). */
export interface ResolvedProfile extends UserProfile {
  readonly avatarUrl: string | null;
}

export interface ProfilePreset {
  readonly letter: string;
  readonly bg: string;
  readonly fg: string;
}

export const DEFAULT_NICKNAME = '本地用户';
export const MAX_NICKNAME_LENGTH = 24;
export const MAX_BIO_LENGTH = 80;

/** Matches the rail avatar the product shipped with: a white
 *  circle with the dark "T" letter. */
export const DEFAULT_AVATAR: InitialAvatar = {
  kind: 'initial',
  letter: 'T',
  bg: '#ffffff',
  fg: '#262725',
};

/** Four tinted initials offered in the avatar step. Low-saturation
 *  earth + slate tones — colour is deliberately quiet here; the
 *  picked photo (or the user's chosen letter) is the only thing
 *  allowed to be loud. */
export const PROFILE_PRESETS: readonly ProfilePreset[] = [
  { letter: 'T', bg: '#f2ede2', fg: '#8a7638' },
  { letter: 'A', bg: '#e9eef2', fg: '#5a7185' },
  { letter: 'L', bg: '#e9f0e9', fg: '#5c7359' },
  { letter: 'M', bg: '#eeeae6', fg: '#6f6459' },
];

const AVATAR_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif'] as const;
export type AvatarExtension = (typeof AVATAR_EXTENSIONS)[number];

export function defaultProfile(): UserProfile {
  return { nickname: DEFAULT_NICKNAME, bio: '', avatar: DEFAULT_AVATAR };
}

/** Extension of a file name (lower-cased, after the last dot), or
 *  null when the name has no supported avatar extension. */
export function avatarExtensionOf(fileName: string): AvatarExtension | null {
  const dot = fileName.lastIndexOf('.');
  if (dot < 0) return null;
  const ext = fileName.slice(dot + 1).toLowerCase();
  return (AVATAR_EXTENSIONS as readonly string[]).includes(ext)
    ? (ext as AvatarExtension)
    : null;
}

/** MIME type for a supported avatar extension. */
export function avatarMimeOf(ext: AvatarExtension): string {
  switch (ext) {
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
  }
}

/** Validate an avatar file name read back from disk: a bare,
 *  short, separator-free name with a supported extension. Anything
 *  else (path traversal, weird chars, unsupported ext) → null. */
export function parseAvatarFile(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.trim();
  if (name.length === 0 || name.length > 64) return null;
  if (!/^[A-Za-z0-9._-]+$/.test(name)) return null;
  if (name.startsWith('.')) return null;
  if (avatarExtensionOf(name) === null) return null;
  return name;
}

function parseInitialAvatar(value: unknown): InitialAvatar | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as Record<string, unknown>;
  const letter = typeof raw.letter === 'string' ? raw.letter.trim().charAt(0) : '';
  if (letter.length === 0) return null;
  const bg = typeof raw.bg === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(raw.bg) ? raw.bg : DEFAULT_AVATAR.bg;
  const fg = typeof raw.fg === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(raw.fg) ? raw.fg : DEFAULT_AVATAR.fg;
  return { kind: 'initial', letter, bg, fg };
}

function parseAvatar(value: unknown): ProfileAvatar {
  if (typeof value === 'object' && value !== null) {
    const raw = value as Record<string, unknown>;
    if (raw.kind === 'image') {
      const file = parseAvatarFile(raw.file);
      if (file !== null) return { kind: 'image', file };
    }
    const initial = parseInitialAvatar(value);
    if (initial !== null) return initial;
  }
  return DEFAULT_AVATAR;
}

function parseText(value: unknown, maxLength: number, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const text = value.trim().slice(0, maxLength);
  return text.length > 0 ? text : fallback;
}

/** Parse profile.json contents into a UserProfile. Never throws;
 *  every malformed field degrades to its default. */
export function parseProfileJson(raw: string | null): UserProfile {
  if (raw === null || raw.trim().length === 0) return defaultProfile();
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return defaultProfile();
  }
  if (typeof data !== 'object' || data === null) return defaultProfile();
  const record = data as Record<string, unknown>;
  return {
    nickname: parseText(record.nickname, MAX_NICKNAME_LENGTH, DEFAULT_NICKNAME),
    bio: typeof record.bio === 'string' ? record.bio.trim().slice(0, MAX_BIO_LENGTH) : '',
    avatar: parseAvatar(record.avatar),
  };
}

export function serializeProfile(profile: UserProfile): string {
  return JSON.stringify({
    version: 1,
    nickname: profile.nickname,
    bio: profile.bio,
    avatar: profile.avatar,
  });
}
