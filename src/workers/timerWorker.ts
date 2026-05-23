type StartMessage = { type: 'start'; endAt: number };
type StopMessage = { type: 'stop' };
type IncomingMessage = StartMessage | StopMessage;

let intervalId: ReturnType<typeof setInterval> | null = null;

function cleanup() {
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

self.onmessage = (e: MessageEvent<IncomingMessage>) => {
  const msg = e.data;

  if (msg.type === 'stop') {
    cleanup();
    return;
  }

  if (msg.type === 'start') {
    cleanup();

    const tick = () => {
      const remaining = Math.max(0, Math.ceil((msg.endAt - Date.now()) / 1000));
      self.postMessage({ type: 'tick', remaining });

      if (remaining === 0) {
        cleanup();
        self.postMessage({ type: 'finished' });
      }
    };

    tick();
    intervalId = setInterval(tick, 1000);
  }
};
