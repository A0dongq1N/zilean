import { composeSpokenText, createSpeechSession, isSpeechAvailable } from '@shared/speech';
import { ICON } from './icons';

export interface VoiceField {
  button: HTMLButtonElement;
  available: boolean;
  start(): void;
  stop(): void;
  bind(button: HTMLButtonElement): void;
}

const MIC = ICON.mic;

export function createVoiceField(
  field: HTMLTextAreaElement | HTMLInputElement,
  options?: { lang?: string },
): VoiceField {
  const buttons: HTMLButtonElement[] = [];
  let base = '';
  let listening = false;
  let hint = '';

  const session = createSpeechSession({
    lang: options?.lang ?? 'zh-CN',
    onTranscript: (spoken) => {
      field.value = composeSpokenText(base, spoken);
      field.dispatchEvent(new Event('input', { bubbles: true }));
    },
    onError: (message) => {
      hint = message;
      sync();
    },
    onEnd: () => {
      listening = false;
      hint = '';
      sync();
    },
  });

  const sync = () => {
    for (const button of buttons) {
      button.classList.toggle('listening', listening);
      button.title = listening ? '说完了' : hint || '说话';
      button.setAttribute('aria-label', button.title);
      button.setAttribute('aria-pressed', listening ? 'true' : 'false');
    }
    if (hint) field.setAttribute('data-voice-hint', hint);
    else field.removeAttribute('data-voice-hint');
  };

  const start = () => {
    if (!session) return;
    hint = '';
    base = field.value;
    listening = true;
    sync();
    try {
      session.start();
    } catch {
      listening = false;
      hint = '暂时没法听，请再试一次';
      sync();
    }
  };

  const stop = () => {
    listening = false;
    hint = '';
    session?.stop();
    sync();
  };

  const decorate = (button: HTMLButtonElement) => {
    button.type = 'button';
    button.classList.add('zl-voice');
    if (!button.innerHTML.trim()) button.innerHTML = MIC;
    button.hidden = !session;
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (listening) stop();
      else start();
    });
    buttons.push(button);
    sync();
  };

  const button = document.createElement('button');
  decorate(button);

  return {
    button,
    available: isSpeechAvailable(),
    start,
    stop,
    bind: decorate,
  };
}
