import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it, vi } from 'vitest';
import { RemotePairingModal } from './RemotePairingModal';
import { EMPTY_REMOTE_STATUS } from '../../remote/remote-port';
import type { RemotePairingInfoResult } from '../../services-host/methods';

const pairingDetails: RemotePairingInfoResult['pairing'] = {
  protocol: 1, service: 'trylo-remote', deviceId: 'fixture-device',
  deviceName: 'Fixture', workspaceName: 'Fixture workspace',
  baseUrl: 'https://fixture.invalid', token: 'fixture-pairing-token',
};

afterEach(cleanup);

it('offers a real startup retry after failure and displays the recovered QR', async () => {
  let resolve!: (info: RemotePairingInfoResult) => void;
  const pairing = vi.fn().mockRejectedValueOnce(new Error('远程服务启动失败：host script not found'))
    .mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const props = { open: true, remoteEnabled: true, remoteController: { pairing }, onClose: vi.fn() };
  const { rerender } = render(<RemotePairingModal {...props} remoteStatus={EMPTY_REMOTE_STATUS} />);
  expect(await screen.findByText('远程服务启动失败：host script not found')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '重试启动并生成二维码' }));
  rerender(<RemotePairingModal {...props} remoteStatus={{ ...EMPTY_REMOTE_STATUS, running: true }} />);
  await act(async () => resolve({ pairing: pairingDetails, qrDataUrl: 'data:image/png;base64,test' }));
  expect(await screen.findByAltText('配对二维码 — 用手机扫码连接')).toBeVisible();
  expect(pairing).toHaveBeenCalledTimes(2);
});

it('a user retry can restart the gateway and still display the new QR', async () => {
  let resolve!: (info: RemotePairingInfoResult) => void;
  const controller = { pairing: vi.fn(() => new Promise<RemotePairingInfoResult>(done => { resolve = done; })) };
  const props = { open: true, remoteEnabled: true, remoteController: controller, onClose: vi.fn() };
  const { rerender } = render(<RemotePairingModal {...props} remoteStatus={{ ...EMPTY_REMOTE_STATUS, running: true }} />);
  rerender(<RemotePairingModal {...props} remoteStatus={EMPTY_REMOTE_STATUS} />);
  rerender(<RemotePairingModal {...props} remoteStatus={{ ...EMPTY_REMOTE_STATUS, running: true }} />);
  await act(async () => resolve({ pairing: pairingDetails, qrDataUrl: 'data:image/png;base64,recovered' }));
  expect(screen.getByRole('img')).toHaveAttribute('src', 'data:image/png;base64,recovered');
});

it('rejects empty QR data and ignores a late result after closing', async () => {
  let resolve!: (info: RemotePairingInfoResult) => void;
  const controller = { pairing: vi.fn(() => new Promise<RemotePairingInfoResult>((done) => { resolve = done; })) };
  const { rerender } = render(<RemotePairingModal open remoteEnabled remoteController={controller} onClose={vi.fn()} />);
  rerender(<RemotePairingModal open={false} remoteEnabled remoteController={controller} onClose={vi.fn()} />);
  await act(async () => resolve({ pairing: pairingDetails, qrDataUrl: 'old-qr' }));
  controller.pairing.mockResolvedValueOnce({ pairing: pairingDetails, qrDataUrl: '' });
  rerender(<RemotePairingModal open remoteEnabled remoteController={controller} onClose={vi.fn()} />);
  expect(await screen.findByText('配对二维码生成失败，请重试。')).toBeVisible();
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
});

it('invalidates an in-flight QR when the gateway stops', async () => {
  let resolve!: (info: RemotePairingInfoResult) => void;
  const controller = { pairing: vi.fn(() => new Promise<RemotePairingInfoResult>((done) => { resolve = done; })) };
  const props = { open: true, remoteEnabled: true, remoteController: controller, onClose: vi.fn() };
  const { rerender } = render(<RemotePairingModal {...props} remoteStatus={{ ...EMPTY_REMOTE_STATUS, running: true }} />);
  rerender(<RemotePairingModal {...props} remoteStatus={EMPTY_REMOTE_STATUS} />);
  await act(async () => resolve({ pairing: pairingDetails, qrDataUrl: 'stale-qr' }));
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
  expect(screen.getByText('远程服务已断开，请重试启动。')).toBeVisible();
});
