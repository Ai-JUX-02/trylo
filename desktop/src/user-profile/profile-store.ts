// Trylo Desktop — user profile store. Identity lives in its own
// area under the app data dir (`<appDataDir>/profile/`):
//
//   profile.json   { version, nickname, bio, avatar }
//   avatar.<ext>   the imported image (png/jpg/webp/gif)
//
// Deliberately NOT in the workspace `.trylo/settings.json` — the
// profile belongs to the machine/user, settings belong to a project.
//
// The store takes its two collaborators (file IO + environment)
// as constructor arguments so tests can fake both; the module
// singleton at the bottom wires the real Tauri implementations.
// Every read is forgiving (any failure → defaults); writes reject
// so the UI can surface a save failure instead of lying.

import { invoke } from '@tauri-apps/api/core';
import { tauriFsCommands } from '../host-adapter/tauri-fs-commands';
import { isTauri } from '../host-adapter/tauri-detect';
import {
  DEFAULT_AVATAR,
  avatarExtensionOf,
  avatarMimeOf,
  defaultProfile,
  parseProfileJson,
  serializeProfile,
  type ProfileAvatar,
  type ResolvedProfile,
  type UserProfile,
} from './profile-types';

/** 16 MB cap on imported avatar images. */
export const AVATAR_MAX_BYTES = 16 * 1024 * 1024;

const PROFILE_DIR_NAME = 'profile';
const PROFILE_FILE_NAME = 'profile.json';

/** Narrow file-IO port. `tauriFsCommands` satisfies it structurally;
 *  tests pass an in-memory fake. */
export interface ProfileFs {
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  readFileBytes(path: string): Promise<Uint8Array>;
  writeFileBytes(path: string, base64: string): Promise<void>;
}

/** Environment port: where the profile area is, and how the user
 *  picks an image. */
export interface ProfileEnv {
  paths(): Promise<{ appDataDir: string }>;
  pickImage(): Promise<string | null>;
}

export interface ImportedAvatar {
  readonly avatar: ProfileAvatar;
  /** Data URL of the imported bytes, ready for `<img src>`. */
  readonly avatarUrl: string;
}

export interface ProfileStore {
  load(): Promise<ResolvedProfile>;
  save(profile: UserProfile): Promise<ResolvedProfile>;
  /** Copy the picked image into the profile area and return the
   *  avatar descriptor + preview URL. Rejects on unsupported
   *  extension, oversize files, or IO failure. */
  importAvatar(sourcePath: string): Promise<ImportedAvatar>;
  /** Open the native image picker. Resolves null on cancel (and in
   *  browser dev, where no picker exists). */
  pickImage(): Promise<string | null>;
}

function joinPath(dir: string, name: string): string {
  return `${dir.replace(/[\\/]+$/, '')}/${name}`;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

export function createProfileStore(fs: ProfileFs, env: ProfileEnv): ProfileStore {
  async function profileDir(): Promise<string> {
    const { appDataDir } = await env.paths();
    return joinPath(appDataDir, PROFILE_DIR_NAME);
  }

  async function resolveAvatarUrl(
    dir: string,
    avatar: ProfileAvatar,
  ): Promise<string | null> {
    if (avatar.kind !== 'image') return null;
    try {
      const bytes = await fs.readFileBytes(joinPath(dir, avatar.file));
      const ext = avatarExtensionOf(avatar.file);
      const mime = ext === null ? 'image/png' : avatarMimeOf(ext);
      return `data:${mime};base64,${bytesToBase64(bytes)}`;
    } catch {
      return null;
    }
  }

  /** Image avatar whose file vanished (manual delete, partial
   *  copy) degrades to the default initial instead of a broken
   *  image; nickname and bio are kept. */
  async function settle(dir: string, profile: UserProfile): Promise<ResolvedProfile> {
    const avatarUrl = await resolveAvatarUrl(dir, profile.avatar);
    if (profile.avatar.kind === 'image' && avatarUrl === null) {
      return { ...profile, avatar: DEFAULT_AVATAR, avatarUrl: null };
    }
    return { ...profile, avatarUrl };
  }

  return {
    async load(): Promise<ResolvedProfile> {
      try {
        const dir = await profileDir();
        const raw = await fs.readFile(joinPath(dir, PROFILE_FILE_NAME));
        return await settle(dir, parseProfileJson(raw));
      } catch {
        return { ...defaultProfile(), avatarUrl: null };
      }
    },

    async save(profile: UserProfile): Promise<ResolvedProfile> {
      const dir = await profileDir();
      await fs.writeFile(joinPath(dir, PROFILE_FILE_NAME), serializeProfile(profile));
      return await settle(dir, profile);
    },

    async importAvatar(sourcePath: string): Promise<ImportedAvatar> {
      const ext = avatarExtensionOf(sourcePath);
      if (ext === null) {
        throw new Error('只支持 png / jpg / webp / gif 图片');
      }
      const bytes = await fs.readFileBytes(sourcePath);
      if (bytes.byteLength > AVATAR_MAX_BYTES) {
        throw new Error('图片太大（上限 16MB）');
      }
      const base64 = bytesToBase64(bytes);
      const file = `avatar.${ext === 'jpeg' ? 'jpg' : ext}`;
      const dir = await profileDir();
      await fs.writeFileBytes(joinPath(dir, file), base64);
      return {
        avatar: { kind: 'image', file },
        avatarUrl: `data:${avatarMimeOf(ext)};base64,${base64}`,
      };
    },

    async pickImage(): Promise<string | null> {
      return await env.pickImage();
    },
  };
}

/** Native single-image picker for the avatar step. Cancel → null.
 *  Browser dev (no Tauri runtime) → null; the profile area is not
 *  writable there anyway. */
export async function pickAvatarImage(): Promise<string | null> {
  if (!isTauri()) return null;
  const { open } = await import('@tauri-apps/plugin-dialog');
  const selected = await open({
    directory: false,
    multiple: false,
    title: '选择头像',
    filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }],
  });
  if (selected === null || Array.isArray(selected)) return null;
  return selected;
}

/** App data dir provider (same Tauri command the service host
 *  uses — `servicehost_paths`). */
export async function profileAppDataDir(): Promise<{ appDataDir: string }> {
  const paths = await invoke<{ sidecarsDir: string; appDataDir: string }>(
    'servicehost_paths',
  );
  return { appDataDir: paths.appDataDir };
}

export const userProfileStore: ProfileStore = createProfileStore(tauriFsCommands, {
  paths: profileAppDataDir,
  pickImage: pickAvatarImage,
});
