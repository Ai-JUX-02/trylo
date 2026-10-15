import { describe, expect, it } from 'vitest';
import {
  AVATAR_MAX_BYTES,
  createProfileStore,
  type ProfileEnv,
  type ProfileFs,
} from './profile-store';
import { DEFAULT_AVATAR, DEFAULT_NICKNAME } from './profile-types';

const APP_DATA = '/data';

function fakeFs(initial?: Record<string, string>): ProfileFs & {
  files: Map<string, string>;
  writes: Array<{ path: string; content: string }>;
} {
  const files = new Map<string, string>(Object.entries(initial ?? {}));
  const writes: Array<{ path: string; content: string }> = [];
  return {
    files,
    writes,
    readFile: async (path: string) => {
      const value = files.get(path);
      if (value === undefined) throw new Error(`ENOENT ${path}`);
      return value;
    },
    writeFile: async (path: string, content: string) => {
      files.set(path, content);
      writes.push({ path, content });
    },
    readFileBytes: async (path: string) => {
      const value = files.get(path);
      if (value === undefined) throw new Error(`ENOENT ${path}`);
      const binary = atob(value);
      const out = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
      return out;
    },
    writeFileBytes: async (path: string, base64: string) => {
      files.set(path, base64);
      writes.push({ path, content: base64 });
    },
  };
}

function fakeEnv(picked: string | null = null): ProfileEnv {
  return {
    paths: async () => ({ appDataDir: APP_DATA }),
    pickImage: async () => picked,
  };
}

function store(fs: ProfileFs, env: ProfileEnv = fakeEnv()): ReturnType<typeof createProfileStore> {
  return createProfileStore(fs, env);
}

const DIR = `${APP_DATA}/profile`;
const JSON_PATH = `${DIR}/profile.json`;

describe('profile store load', () => {
  it('returns defaults when profile.json is missing', async () => {
    const result = await store(fakeFs()).load();
    expect(result.nickname).toBe(DEFAULT_NICKNAME);
    expect(result.bio).toBe('');
    expect(result.avatar).toEqual(DEFAULT_AVATAR);
    expect(result.avatarUrl).toBeNull();
  });

  it('parses a well-formed profile.json', async () => {
    const fs = fakeFs({
      [JSON_PATH]: JSON.stringify({
        version: 1,
        nickname: '小渡',
        bio: '一起把事弄明白的人',
        avatar: { kind: 'initial', letter: '渡', bg: '#f7efd9', fg: '#946d22' },
      }),
    });
    const result = await store(fs).load();
    expect(result.nickname).toBe('小渡');
    expect(result.bio).toBe('一起把事弄明白的人');
    expect(result.avatar).toEqual({ kind: 'initial', letter: '渡', bg: '#f7efd9', fg: '#946d22' });
    expect(result.avatarUrl).toBeNull();
  });

  it('falls back to defaults on malformed JSON', async () => {
    const fs = fakeFs({ [JSON_PATH]: '{not json' });
    const result = await store(fs).load();
    expect(result.nickname).toBe(DEFAULT_NICKNAME);
    expect(result.avatar).toEqual(DEFAULT_AVATAR);
  });

  it('degrades an image avatar whose file is missing, keeping nickname and bio', async () => {
    const fs = fakeFs({
      [JSON_PATH]: JSON.stringify({
        nickname: '阿橙',
        bio: '简介',
        avatar: { kind: 'image', file: 'avatar.png' },
      }),
    });
    const result = await store(fs).load();
    expect(result.nickname).toBe('阿橙');
    expect(result.bio).toBe('简介');
    expect(result.avatar).toEqual(DEFAULT_AVATAR);
    expect(result.avatarUrl).toBeNull();
  });

  it('rejects a traversal avatar file name', async () => {
    const fs = fakeFs({
      [JSON_PATH]: JSON.stringify({
        nickname: '阿橙',
        avatar: { kind: 'image', file: '..\\..\\evil.png' },
      }),
    });
    const result = await store(fs).load();
    expect(result.avatar).toEqual(DEFAULT_AVATAR);
  });

  it('builds a data URL for a present image avatar', async () => {
    const fs = fakeFs({
      [JSON_PATH]: JSON.stringify({
        nickname: '阿橙',
        avatar: { kind: 'image', file: 'avatar.png' },
      }),
      [`${DIR}/avatar.png`]: 'AAAA',
    });
    const result = await store(fs).load();
    expect(result.avatar).toEqual({ kind: 'image', file: 'avatar.png' });
    expect(result.avatarUrl).toBe('data:image/png;base64,AAAA');
  });
});

describe('profile store save', () => {
  it('writes profile.json under the app data profile dir', async () => {
    const fs = fakeFs();
    await store(fs).save({ nickname: '小渡', bio: '', avatar: DEFAULT_AVATAR });
    expect(fs.writes).toHaveLength(1);
    expect(fs.writes[0]!.path).toBe(JSON_PATH);
    const parsed = JSON.parse(fs.writes[0]!.content) as Record<string, unknown>;
    expect(parsed).toMatchObject({ version: 1, nickname: '小渡', bio: '' });
  });

  it('round-trips through load', async () => {
    const fs = fakeFs();
    const s = store(fs);
    await s.save({ nickname: '小渡', bio: '签名', avatar: DEFAULT_AVATAR });
    const loaded = await s.load();
    expect(loaded.nickname).toBe('小渡');
    expect(loaded.bio).toBe('签名');
    expect(loaded.avatar).toEqual(DEFAULT_AVATAR);
  });
});

describe('profile store importAvatar', () => {
  it('copies the picked image into the profile dir and returns a preview URL', async () => {
    const fs = fakeFs({ '/pics/photo.png': 'QUJD' });
    const s = store(fs, fakeEnv('/pics/photo.png'));
    const imported = await s.importAvatar('/pics/photo.png');
    expect(imported.avatar).toEqual({ kind: 'image', file: 'avatar.png' });
    expect(imported.avatarUrl).toBe('data:image/png;base64,QUJD');
    expect(fs.files.get(`${DIR}/avatar.png`)).toBe('QUJD');
  });

  it('normalizes .jpeg to avatar.jpg with a jpeg mime', async () => {
    const fs = fakeFs({ '/pics/photo.jpeg': 'QUJD' });
    const imported = await store(fs).importAvatar('/pics/photo.jpeg');
    expect(imported.avatar).toEqual({ kind: 'image', file: 'avatar.jpg' });
    expect(imported.avatarUrl).toBe('data:image/jpeg;base64,QUJD');
  });

  it('rejects unsupported extensions before touching the fs', async () => {
    const fs = fakeFs({ '/pics/notes.txt': 'QUJD' });
    await expect(store(fs).importAvatar('/pics/notes.txt')).rejects.toThrow(/png/);
    expect(fs.writes).toHaveLength(0);
  });

  it('rejects oversize images', async () => {
    const fs = {
      ...fakeFs(),
      readFileBytes: async () => new Uint8Array(AVATAR_MAX_BYTES + 1),
    };
    await expect(store(fs).importAvatar('/pics/huge.png')).rejects.toThrow(/16MB/);
    expect(fs.writes).toHaveLength(0);
  });

  it('import then save then load keeps the image avatar', async () => {
    const fs = fakeFs({ '/pics/photo.png': 'QUJD' });
    const s = store(fs, fakeEnv('/pics/photo.png'));
    const imported = await s.importAvatar('/pics/photo.png');
    const saved = await s.save({ nickname: '小渡', bio: '', avatar: imported.avatar });
    expect(saved.avatarUrl).toBe('data:image/png;base64,QUJD');
    const loaded = await s.load();
    expect(loaded.avatar).toEqual({ kind: 'image', file: 'avatar.png' });
    expect(loaded.avatarUrl).toBe('data:image/png;base64,QUJD');
  });
});

describe('profile store pickImage', () => {
  it('delegates to the environment and returns null on cancel', async () => {
    const s = store(fakeFs(), fakeEnv(null));
    expect(await s.pickImage()).toBeNull();
  });
});
