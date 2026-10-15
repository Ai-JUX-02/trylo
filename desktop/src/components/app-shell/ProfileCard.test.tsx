import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';
import { ProfileCard, type ProfileCardProps } from './ProfileCard';
import { DEFAULT_AVATAR, type ResolvedProfile } from '../../user-profile/profile-types';

function profile(overrides?: Partial<ResolvedProfile>): ResolvedProfile {
  return { nickname: '小渡', bio: '', avatar: DEFAULT_AVATAR, avatarUrl: null, ...overrides };
}

function setup(overrides?: Partial<ProfileCardProps>): ProfileCardProps {
  const anchor = document.createElement('div');
  document.body.appendChild(anchor);
  const props: ProfileCardProps = {
    step: 'card',
    profile: profile(),
    draft: null,
    notice: null,
    picking: false,
    anchorRef: { current: anchor },
    onClose: vi.fn(),
    onOpenSettings: vi.fn(),
    onCommitNickname: vi.fn(),
    onCommitBio: vi.fn(),
    onStartAvatarEdit: vi.fn(),
    onBackToCard: vi.fn(),
    onPickImage: vi.fn(),
    onPickPreset: vi.fn(),
    onConfirmAvatar: vi.fn(),
    onCancelAvatar: vi.fn(),
    ...overrides,
  };
  render(<ProfileCard {...props} />);
  return props;
}

describe('ProfileCard card step', () => {
  it('renders the nickname, avatar and settings entry', () => {
    setup();
    expect(screen.getByText('小渡')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '设置与连接' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '更换头像' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '当前头像，点击更换' })).toBeInTheDocument();
  });

  it('v4: no band, no developer-speak subtitle, no 简介 label', () => {
    setup();
    const dialog = screen.getByRole('dialog');
    expect(dialog.querySelector('.profile-card__band')).toBeNull();
    expect(screen.queryByText(/本地账号/)).toBeNull();
    expect(screen.queryByText('简介')).toBeNull();
  });

  it('shows the bio placeholder when empty', () => {
    setup();
    expect(screen.getByText('写一句介绍自己')).toBeInTheDocument();
  });

  it('edits the nickname inline: Enter commits the typed value', () => {
    const props = setup();
    fireEvent.click(screen.getByRole('button', { name: '昵称' }));
    const input = screen.getByRole('textbox', { name: '昵称' });
    fireEvent.change(input, { target: { value: '小渡改' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(props.onCommitNickname).toHaveBeenCalledWith('小渡改');
  });

  it('Escape leaves edit mode without committing', () => {
    const props = setup();
    fireEvent.click(screen.getByRole('button', { name: '昵称' }));
    const input = screen.getByRole('textbox', { name: '昵称' });
    fireEvent.change(input, { target: { value: '不作数' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(props.onCommitNickname).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '昵称' })).toBeInTheDocument();
  });

  it('blur commits the bio', () => {
    const props = setup();
    fireEvent.click(screen.getByRole('button', { name: '简介' }));
    const input = screen.getByRole('textbox', { name: '简介' });
    fireEvent.change(input, { target: { value: '一起把事弄明白' } });
    fireEvent.blur(input);
    expect(props.onCommitBio).toHaveBeenCalledWith('一起把事弄明白');
  });

  it('renders the stored avatar image when present', () => {
    setup({
      profile: profile({
        avatar: { kind: 'image', file: 'avatar.png' },
        avatarUrl: 'data:image/png;base64,QUJD',
      }),
    });
    expect(screen.getByRole('dialog').querySelector('img')?.getAttribute('src')).toBe(
      'data:image/png;base64,QUJD',
    );
  });

  it('opens settings from the menu row', () => {
    const props = setup();
    fireEvent.click(screen.getByRole('button', { name: '设置与连接' }));
    expect(props.onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it('shows the notice when the store reports a failure', () => {
    setup({ notice: '资料保存失败，请稍后再试' });
    expect(screen.getByText('资料保存失败，请稍后再试')).toBeInTheDocument();
  });
});

describe('ProfileCard avatar step', () => {
  function setupAvatar(overrides?: Partial<ProfileCardProps>): ProfileCardProps {
    return setup({
      step: 'avatar',
      draft: { avatar: DEFAULT_AVATAR, avatarUrl: null },
      ...overrides,
    });
  }

  it('renders the picker, presets and confirm/cancel', () => {
    setupAvatar();
    expect(screen.getByText('更换头像', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '从本机选图' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '预设头像 T' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '确定' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '取消' })).toBeInTheDocument();
  });

  it('marks exactly the staged preset as pressed', () => {
    setupAvatar({
      draft: { avatar: { kind: 'initial', letter: 'A', bg: '#e9eef2', fg: '#5a7185' }, avatarUrl: null },
    });
    const pressed = screen
      .getAllByRole('button')
      .filter((b) => b.getAttribute('aria-pressed') === 'true');
    expect(pressed).toHaveLength(1);
    expect(pressed[0]).toHaveTextContent('A');
  });

  it('routes preset clicks, picker clicks and confirm/cancel/back', () => {
    const props = setupAvatar();
    fireEvent.click(screen.getByRole('button', { name: '预设头像 L' }));
    expect(props.onPickPreset).toHaveBeenCalledWith({ letter: 'L', bg: '#e9f0e9', fg: '#5c7359' });
    fireEvent.click(screen.getByRole('button', { name: '从本机选图' }));
    expect(props.onPickImage).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: '确定' }));
    expect(props.onConfirmAvatar).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    expect(props.onCancelAvatar).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: '返回资料卡' }));
    expect(props.onBackToCard).toHaveBeenCalledTimes(1);
  });

  it('previews a staged image avatar', () => {
    setupAvatar({
      draft: { avatar: { kind: 'image', file: 'avatar.png' }, avatarUrl: 'data:image/png;base64,AAAA' },
    });
    expect(screen.getByRole('dialog').querySelector('img')?.getAttribute('src')).toBe(
      'data:image/png;base64,AAAA',
    );
  });
});

describe('ProfileCard dismissal', () => {
  it('positions itself so the whole card and its actions stay in the viewport', () => {
    // Field bug 2026-10-14: placing once in useLayoutEffect measured a
    // half-laid-out card, so the Confirm/Cancel row rendered BELOW the
    // viewport and was unclickable — the avatar could be picked but
    // never saved. jsdom reports zero-size rects, so assert the two
    // things the fix guarantees: the card is fixed-positioned with a
    // viewport-relative top and a max-height, and the confirm button
    // carries the primary (filled) styling hook.
    const anchor = document.createElement('div');
    document.body.appendChild(anchor);
    setup({ step: 'avatar', draft: { avatar: DEFAULT_AVATAR, avatarUrl: null }, anchorRef: { current: anchor } });
    const card = screen.getByRole('dialog');
    const confirm = screen.getByRole('button', { name: '确定' });
    expect(card).toHaveClass('profile-card');
    expect(confirm).toHaveClass('profile-card__primary');
    expect(card.style.maxHeight).not.toBe('');
  });

  it('Escape closes the card', () => {
    const props = setup();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('a pointerdown outside closes the card', () => {
    const props = setup();
    fireEvent.pointerDown(document.body);
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('a pointerdown inside the card does not close it', () => {
    const props = setup();
    fireEvent.pointerDown(screen.getByRole('dialog'));
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('a pointerdown on the rail profile row (the anchor) does not close it', () => {
    const anchor = document.createElement('div');
    document.body.appendChild(anchor);
    const props = setup({ anchorRef: { current: anchor } });
    fireEvent.pointerDown(anchor);
    expect(props.onClose).not.toHaveBeenCalled();
    anchor.remove();
  });

  it('a pointerdown outside does NOT close the card while an import is in flight', () => {
    // 2026-10-14 regression: the closing native dialog synthesizes
    // a stray pointerdown; closing then lost the staged photo.
    const props = setup({ picking: true });
    fireEvent.pointerDown(document.body);
    expect(props.onClose).not.toHaveBeenCalled();
  });
});

describe('ProfileCard avatar step picking state', () => {
  it('disables the picker button and shows the reading label while picking', () => {
    setup({
      step: 'avatar',
      draft: { avatar: DEFAULT_AVATAR, avatarUrl: null },
      picking: true,
    });
    const button = screen.getByRole('button', { name: /正在读取图片/ });
    expect(button).toBeDisabled();
  });
});
