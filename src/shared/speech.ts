export function composeSpokenText(base: string, spoken: string): string {
  const head = base.trimEnd();
  const tail = spoken.replace(/\s+/g, ' ').trim();
  if (!tail) return head;
  if (!head) return tail;
  return `${head}${/[\s，。！？、；：]$/.test(head) ? '' : ' '}${tail}`;
}

export function speechErrorMessage(code: string): string {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return '没有麦克风权限，请允许后重试';
    case 'audio-capture':
      return '找不到麦克风';
    case 'network':
      return '识别需要网络，请检查连接';
    case 'no-speech':
      return '没有听清，再试一次';
    case 'language-not-supported':
      return '这台浏览器还不支持中文识别';
    default:
      return '';
  }
}

interface SpeechAlternative {
  transcript: string;
}

interface SpeechResult {
  isFinal: boolean;
  0?: SpeechAlternative;
  length: number;
}

interface SpeechResultList {
  length: number;
  [index: number]: SpeechResult;
}

interface SpeechRecognitionApi {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: { results: SpeechResultList }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}

type SpeechCtor = new () => SpeechRecognitionApi;

function getSpeechCtor(): SpeechCtor | null {
  const w = window as Window & {
    SpeechRecognition?: SpeechCtor;
    webkitSpeechRecognition?: SpeechCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isSpeechAvailable(): boolean {
  return getSpeechCtor() !== null;
}

export interface SpeechSession {
  start(): void;
  stop(): void;
}

export function createSpeechSession(handlers: {
  lang?: string;
  onTranscript: (spoken: string) => void;
  onError: (message: string) => void;
  onEnd: () => void;
}): SpeechSession | null {
  const Ctor = getSpeechCtor();
  if (!Ctor) return null;

  let rec: SpeechRecognitionApi | null = null;
  let active = false;

  const detach = () => {
    if (!rec) return;
    rec.onresult = null;
    rec.onerror = null;
    rec.onend = null;
    rec.abort();
    rec = null;
  };

  const stop = () => {
    const wasActive = active;
    active = false;
    detach();
    if (wasActive) handlers.onEnd();
  };

  const start = () => {
    detach();
    const next = new Ctor();
    next.lang = handlers.lang ?? 'zh-CN';
    next.continuous = true;
    next.interimResults = true;
    next.onresult = (event) => {
      let spoken = '';
      for (let i = 0; i < event.results.length; i += 1) {
        spoken += event.results[i]?.[0]?.transcript ?? '';
      }
      handlers.onTranscript(spoken);
    };
    next.onerror = (event) => {
      if (event.error === 'aborted') return;
      active = false;
      const message = speechErrorMessage(event.error);
      if (message) handlers.onError(message);
    };
    next.onend = () => {
      rec = null;
      active = false;
      handlers.onEnd();
    };
    rec = next;
    active = true;
    next.start();
  };

  return { start, stop };
}
