import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SettingsModal } from './SettingsModal';
import { connectionFields, loadSettings, saveSettings, settingsDefaults } from '../../settings/settings-store';

vi.mock('./AppearanceSettings', () => ({ AppearanceSettings: () => null }));
vi.mock('./WorkToolsSettings', () => ({ WorkToolsSettings: () => null }));
vi.mock('./SkillsModal', () => ({ SkillsModal: () => null }));

const profile = { id: 'old', name: 'Old', ...connectionFields(settingsDefaults), apiFormat: 'anthropic' as const, apiModel: 'old-model' };
const initial = { ...settingsDefaults, ...connectionFields(profile), modelProfiles: [profile], activeModelProfileId: profile.id, poolModel: 'old-pool' };
beforeEach(() => { window.localStorage.clear(); saveSettings(initial); });
afterEach(() => { vi.restoreAllMocks(); window.localStorage.clear(); });

it('saving an edited OpenAI connection detaches a stale saved-profile pointer and pool override', () => {
  const onSave = vi.fn(), onClose = vi.fn();
  render(<SettingsModal open initial={initial} onSave={onSave} onClose={onClose} />);
  fireEvent.change(screen.getByLabelText(/^Format/), { target: { value: 'openai' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ apiFormat: 'openai', activeModelProfileId: '', poolModel: '' }), 'connection');
  expect(loadSettings()).toMatchObject({ apiFormat: 'openai', activeModelProfileId: '', poolModel: '' });
  expect(loadSettings().modelProfiles[0]?.apiFormat).toBe('anthropic');
  expect(onClose).toHaveBeenCalledOnce();
});

it('a failed primary write keeps the edited form open and never reports save success', () => {
  const onSave = vi.fn(), onClose = vi.fn();
  render(<SettingsModal open initial={initial} onSave={onSave} onClose={onClose} />);
  fireEvent.change(screen.getByLabelText(/^Format/), { target: { value: 'openai' } });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('quota', 'QuotaExceededError'); });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(screen.getByRole('alert')).toHaveTextContent('保存');
  expect(screen.getByLabelText(/^Format/)).toHaveValue('openai');
  expect(onSave).not.toHaveBeenCalled();
  expect(onClose).not.toHaveBeenCalled();
  expect(loadSettings().apiFormat).toBe('anthropic');
});
