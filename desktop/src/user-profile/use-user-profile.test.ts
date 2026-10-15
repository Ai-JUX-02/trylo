import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useUserProfile } from './use-user-profile';
import type { ProfileStore } from './profile-store';
import { DEFAULT_AVATAR, defaultProfile, type ResolvedProfile, type UserProfile } from './profile-types';

interface FakeStore extends ProfileStore {
  readonly saves: UserProfile[];
  readonly profile: ResolvedProfile;
}

function fakeStore(initial?: Partial<ResolvedProfile>): FakeStore & {
  pickImageResult: string | null;
  importError: Error | null;
} {
  let current: ResolvedProfile = { ...defaultProfile(), avatarUrl: null, ...initial };
  const saves: UserProfile[] = [];
  const handle = {
    saves,
    get profile(): ResolvedProfile {
      return current;
    },
    pickImageResult: null as string | null,
    importError: null as Error | null,
    load: async () => current,
    save: async (next: UserProfile) => {
      saves.push(next);
      current = { ...next, avatarUrl: null };
      return current;
    },
    importAvatar: async (source: string) => {
      if (handle.importError !== null) throw handle.importError;
      return {
        avatar: { kind: 'image' as const, file: 'avatar.png' },
        avatarUrl: `data:image/png;base64,${source}`,
      };
    },
    pickImage: async () => handle.pickImageResult,
  };
  return handle;
}

describe('useUserProfile load', () => {
  it('starts at defaults and adopts the stored profile after load', async () => {
    const store = fakeStore({ nickname: '小渡', bio: '签名', avatar: DEFAULT_AVATAR });
    const { result } = renderHook(() => useUserProfile(store));
    expect(result.current.step).toBe('closed');
    expect(result.current.profile.nickname).toBe('本地用户');
    await waitFor(() => expect(result.current.profile.nickname).toBe('小渡'));
    expect(result.current.profile.bio).toBe('签名');
  });

  it('stays at defaults when the store load fails', async () => {
    const store = fakeStore();
    vi.spyOn(store, 'load').mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useUserProfile(store));
    await act(async () => undefined);
    expect(result.current.profile.nickname).toBe('本地用户');
  });
});

describe('useUserProfile steps', () => {
  it('toggle opens the card and closes it again', () => {
    const { result } = renderHook(() => useUserProfile(fakeStore()));
    act(() => result.current.toggle());
    expect(result.current.step).toBe('card');
    act(() => result.current.toggle());
    expect(result.current.step).toBe('closed');
  });

  it('close returns to closed from the avatar step and keeps the draft', () => {
    const { result } = renderHook(() => useUserProfile(fakeStore()));
    act(() => result.current.startAvatarEdit());
    act(() => result.current.close());
    expect(result.current.step).toBe('closed');
    // 2026-10-14 regression: close used to discard the staged
    // avatar, so a mid-pick dismissal lost the user's photo.
    expect(result.current.draft).not.toBeNull();
  });
});

describe('useUserProfile text commits', () => {
  it('persists a trimmed nickname', async () => {
    const store = fakeStore();
    const { result } = renderHook(() => useUserProfile(store));
    await waitFor(() => expect(result.current.profile.nickname).toBe('本地用户'));
    act(() => result.current.commitNickname('  小渡  '));
    await waitFor(() => expect(store.saves).toHaveLength(1));
    expect(store.saves[0]!.nickname).toBe('小渡');
    expect(result.current.profile.nickname).toBe('小渡');
  });

  it('falls back to the default nickname when cleared', async () => {
    const store = fakeStore({ nickname: '小渡' });
    const { result } = renderHook(() => useUserProfile(store));
    await waitFor(() => expect(result.current.profile.nickname).toBe('小渡'));
    act(() => result.current.commitNickname('   '));
    await waitFor(() => expect(store.saves).toHaveLength(1));
    expect(store.saves[0]!.nickname).toBe('本地用户');
  });

  it('persists a trimmed bio', async () => {
    const store = fakeStore();
    const { result } = renderHook(() => useUserProfile(store));
    act(() => result.current.commitBio('  一起把事弄明白  '));
    await waitFor(() => expect(store.saves).toHaveLength(1));
    expect(store.saves[0]!.bio).toBe('一起把事弄明白');
  });

  it('surfaces a notice when save fails', async () => {
    const store = fakeStore();
    vi.spyOn(store, 'save').mockRejectedValue(new Error('disk full'));
    const { result } = renderHook(() => useUserProfile(store));
    act(() => result.current.commitBio('签名'));
    await waitFor(() => expect(result.current.notice).toBe('资料保存失败，请稍后再试'));
  });
});

describe('useUserProfile avatar step', () => {
  it('stages the current avatar on entry', async () => {
    const store = fakeStore({ avatar: DEFAULT_AVATAR });
    const { result } = renderHook(() => useUserProfile(store));
    await waitFor(() => expect(result.current.profile.nickname).toBe('本地用户'));
    act(() => result.current.startAvatarEdit());
    expect(result.current.step).toBe('avatar');
    expect(result.current.draft?.avatar).toEqual(DEFAULT_AVATAR);
  });

  it('stages a preset and persists it on confirm', async () => {
    const store = fakeStore();
    const { result } = renderHook(() => useUserProfile(store));
    act(() => result.current.pickPreset({ letter: 'A', bg: '#e9f1ff', fg: '#286597' }));
    expect(result.current.draft?.avatar).toEqual({ kind: 'initial', letter: 'A', bg: '#e9f1ff', fg: '#286597' });
    act(() => result.current.confirmAvatar());
    await waitFor(() => expect(store.saves).toHaveLength(1));
    expect(store.saves[0]!.avatar).toEqual({ kind: 'initial', letter: 'A', bg: '#e9f1ff', fg: '#286597' });
    expect(result.current.step).toBe('card');
    expect(result.current.draft).toBeNull();
  });

  it('cancel discards the staged avatar without saving', async () => {
    const store = fakeStore();
    const { result } = renderHook(() => useUserProfile(store));
    act(() => result.current.pickPreset({ letter: 'A', bg: '#e9f1ff', fg: '#286597' }));
    act(() => result.current.cancelAvatar());
    expect(store.saves).toHaveLength(0);
    expect(result.current.step).toBe('card');
    expect(result.current.draft).toBeNull();
  });

  it('back returns to the card without saving', () => {
    const store = fakeStore();
    const { result } = renderHook(() => useUserProfile(store));
    act(() => result.current.startAvatarEdit());
    act(() => result.current.backToCard());
    expect(result.current.step).toBe('card');
    expect(store.saves).toHaveLength(0);
  });

  it('stages an imported image with its preview URL', async () => {
    const store = fakeStore();
    store.pickImageResult = '/pics/photo.png';
    const { result } = renderHook(() => useUserProfile(store));
    await act(async () => {
      await result.current.pickImage();
    });
    expect(result.current.draft).toEqual({
      avatar: { kind: 'image', file: 'avatar.png' },
      avatarUrl: 'data:image/png;base64,/pics/photo.png',
    });
    expect(result.current.notice).toBeNull();
  });

  it('keeps the draft and shows a notice when import fails', async () => {
    const store = fakeStore();
    store.pickImageResult = '/pics/photo.png';
    store.importError = new Error('只支持 png / jpg / webp / gif 图片');
    const { result } = renderHook(() => useUserProfile(store));
    act(() => result.current.pickPreset({ letter: 'A', bg: '#e9f1ff', fg: '#286597' }));
    await act(async () => {
      await result.current.pickImage();
    });
    expect(result.current.draft?.avatar).toEqual({ kind: 'initial', letter: 'A', bg: '#e9f1ff', fg: '#286597' });
    expect(result.current.notice).toBe('只支持 png / jpg / webp / gif 图片');
  });

  it('does nothing when the picker is cancelled', async () => {
    const store = fakeStore();
    store.pickImageResult = null;
    const { result } = renderHook(() => useUserProfile(store));
    await act(async () => {
      await result.current.pickImage();
    });
    expect(result.current.draft).toBeNull();
    expect(result.current.notice).toBeNull();
  });

  it('confirming after a successful pick actually persists the image avatar', async () => {
    // Field bug 2026-10-14 (second report): the photo landed on
    // disk (avatar.png written) but profile.json never appeared —
    // save() was never called because confirmAvatar saw a stale
    // null draft. This asserts the whole chain: pick → draft set →
    // confirm → store.save called with the image avatar.
    const store = fakeStore();
    store.pickImageResult = '/pics/photo.png';
    const { result } = renderHook(() => useUserProfile(store));
    act(() => result.current.startAvatarEdit());
    await act(async () => {
      await result.current.pickImage();
    });
    expect(result.current.draft).not.toBeNull();
    act(() => result.current.confirmAvatar());
    await waitFor(() => expect(store.saves).toHaveLength(1));
    expect(store.saves[0]!.avatar).toEqual({ kind: 'image', file: 'avatar.png' });
    expect(result.current.step).toBe('card');
  });

  it('confirmAvatar uses the latest draft even when called from a stale render', async () => {
    // The "确定" button can fire from a closure captured before the
    // draft landed (picking true→false re-render). confirmAvatar
    // must read the current draft, not a stale captured one.
    const store = fakeStore();
    store.pickImageResult = '/pics/photo.png';
    const { result } = renderHook(() => useUserProfile(store));
    act(() => result.current.startAvatarEdit());
    await act(async () => {
      await result.current.pickImage();
    });
    // Grab the confirm callback the avatar step rendered BEFORE the
    // pick landed — this is the stale closure the real UI can fire.
    const staleConfirm = result.current.confirmAvatar;
    await act(async () => {
      staleConfirm();
    });
    await waitFor(() => expect(store.saves).toHaveLength(1));
    expect(store.saves[0]!.avatar).toEqual({ kind: 'image', file: 'avatar.png' });
  });

  it('keeps a staged import when the card closes after the import lands', async () => {
    // The other race ordering: the import resolves first, then a
    // stray pointerdown closes the card. The old close() wiped the
    // draft here — photo picked, avatar.png on disk, UI unchanged.
    const store = fakeStore();
    store.pickImageResult = '/pics/photo.png';
    const { result } = renderHook(() => useUserProfile(store));
    act(() => result.current.startAvatarEdit());
    await act(async () => {
      await result.current.pickImage();
    });
    expect(result.current.draft).not.toBeNull();
    act(() => result.current.close());
    expect(result.current.draft).not.toBeNull();
    expect(result.current.step).toBe('closed');
  });

  it('keeps a staged import when the card closes mid-pick (modal dialog race)', async () => {
    // Reproduces the 2026-10-14 field bug: the native file dialog
    // closing synthesizes a pointerdown that used to close the card
    // and wipe the draft before the import promise resolved.
    const store = fakeStore();
    let release!: (value: string | null) => void;
    store.pickImage = () => new Promise<string | null>((resolve) => {
      release = resolve;
    });
    const { result } = renderHook(() => useUserProfile(store));
    act(() => result.current.startAvatarEdit());
    act(() => {
      void result.current.pickImage();
    });
    expect(result.current.picking).toBe(true);
    act(() => result.current.close());
    await act(async () => {
      release('/pics/photo.png');
    });
    expect(result.current.draft).not.toBeNull();
    expect(result.current.picking).toBe(false);
  });

  it('reopens straight into the avatar step when a draft is pending', async () => {
    const store = fakeStore();
    let release!: (value: string | null) => void;
    store.pickImage = () => new Promise<string | null>((resolve) => {
      release = resolve;
    });
    const { result } = renderHook(() => useUserProfile(store));
    act(() => result.current.startAvatarEdit());
    act(() => {
      void result.current.pickImage();
    });
    act(() => result.current.close());
    await act(async () => {
      release('/pics/photo.png');
    });
    act(() => result.current.toggle());
    expect(result.current.step).toBe('avatar');
    expect(result.current.draft?.avatarUrl).toBe('data:image/png;base64,/pics/photo.png');
  });
});
