import type { FunChatEvent, GatewayConnectionState, RemoteChatEvent, RemoteSnapshot } from './gateway';

/** One subscription owns its ticket, socket, timers and foreground listeners.
 * A socket is usable only after its authoritative initial snapshot arrives. */
export function connectRemoteGateway(options: {
  baseUrl: string;
  ticket: (signal: AbortSignal) => Promise<{ ticket: string }>;
  snapshot: (signal: AbortSignal) => Promise<RemoteSnapshot>;
  onSnapshot: (snapshot: RemoteSnapshot) => void;
  onState: (state: GatewayConnectionState) => void;
  onChatEvent?: (event: RemoteChatEvent) => void;
  onFunEvent?: (event: FunChatEvent) => void;
}): () => void {
  let disposed = false;
  let generation = 0;
  let attempt = 0;
  let socket: WebSocket | null = null;
  let pending: AbortController | null = null;
  let timer: number | undefined;
  let probeTimer: number | undefined;
  let probeDeadline: number | undefined;
  let revision = 0;
  let synchronized = false;

  const clear = () => {
    window.clearTimeout(timer);
    window.clearTimeout(probeTimer);
    window.clearTimeout(probeDeadline);
    pending?.abort();
    pending = null;
    const previous = socket;
    socket = null;
    synchronized = false;
    previous?.close();
  };
  const valid = (value: unknown): value is RemoteSnapshot => {
    const s = value as RemoteSnapshot | null;
    return !!s?.device && !!s.agent && Array.isArray(s.agent.timeline)
      && Array.isArray(s.sessions) && Array.isArray(s.projects)
      && Array.isArray(s.approvals) && Array.isArray(s.conversation)
      && typeof s.activeSessionId === 'string';
  };
  const retry = (id: number) => {
    if (disposed || id !== generation) return;
    ++generation; // Late events from this socket/ticket can no longer mutate state.
    clear();
    options.onState(navigator.onLine === false ? 'offline' : 'reconnecting');
    const delay = Math.min(15000, 800 * 2 ** Math.min(++attempt, 5));
    timer = window.setTimeout(() => void connect(), delay);
  };
  const probe = (id: number) => {
    probeTimer = window.setTimeout(async () => {
      if (disposed || id !== generation) return;
      if (document.visibilityState === 'hidden') { probe(id); return; }
      const before = revision;
      const controller = new AbortController();
      pending = controller;
      const deadline = window.setTimeout(() => { controller.abort(); retry(id); }, 12000);
      probeDeadline = deadline;
      try {
        const next = await options.snapshot(controller.signal);
        if (disposed || id !== generation) return;
        if (!valid(next)) throw new Error('Invalid remote snapshot');
        // A slower REST response must not replace a newer WebSocket frame.
        if (before === revision) options.onSnapshot(next);
        pending = null;
        probe(id);
      } catch { retry(id); }
      finally { window.clearTimeout(deadline); }
    }, 25000);
  };
  const connect = async () => {
    if (disposed) return;
    const id = ++generation;
    clear();
    if (navigator.onLine === false) {
      options.onState('offline');
      return;
    }
    options.onState(attempt ? 'reconnecting' : 'connecting');
    const controller = new AbortController();
    pending = controller;
    timer = window.setTimeout(() => retry(id), 12000);
    try {
      const { ticket } = await options.ticket(controller.signal);
      if (disposed || id !== generation) return;
      if (!ticket) throw new Error('Missing socket ticket');
      const url = new URL('/v1/events', options.baseUrl);
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      url.searchParams.set('ticket', ticket);
      const current = new WebSocket(url.toString());
      socket = current;
      current.addEventListener('message', event => {
        if (disposed || id !== generation || current !== socket) return;
        let message;
        try { message = JSON.parse(String(event.data)); } catch { return; }
        if (valid(message.snapshot)) {
          ++revision;
          options.onSnapshot(message.snapshot);
          if (!synchronized) {
            synchronized = true;
            attempt = 0;
            pending = null;
            window.clearTimeout(timer);
            options.onState('connected');
            probe(id);
          }
        }
        if (!synchronized || message.type !== 'action_event') return;
        if (message.action === 'chat' && message.payload) {
          ++revision;
          options.onChatEvent?.(message.payload);
        }
        if (message.action === 'fun' && message.payload) {
          ++revision;
          options.onFunEvent?.(message.payload);
        }
      });
      current.addEventListener('close', () => retry(id));
      current.addEventListener('error', () => retry(id));
    } catch { retry(id); }
  };
  const resume = () => { if (document.visibilityState !== 'hidden') void connect(); };
  const offline = () => { ++generation; clear(); options.onState('offline'); };
  window.addEventListener('online', resume);
  window.addEventListener('offline', offline);
  document.addEventListener('visibilitychange', resume);
  void connect();
  return () => {
    disposed = true;
    ++generation;
    clear();
    window.removeEventListener('online', resume);
    window.removeEventListener('offline', offline);
    document.removeEventListener('visibilitychange', resume);
  };
}
