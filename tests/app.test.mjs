import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
import { HIRAGANA_DATA } from '../js/hiragana-data.js';

const source = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8').replace(/^import .*;\s*/, '');
function setup({ speech = 'ok', audio = 'ok' } = {}) {
  const ids = ['start', 'question', 'result', 'character', 'review-image', 'progress', 'progress-bar', 'feedback', 'start-button', 'restart-button', 'count-correct', 'count-unsure', 'count-incorrect'];
  const element = id => ({ id, hidden: ['question', 'result', 'review-image'].includes(id), textContent: '', dataset: {}, disabled: false,
    classList: { remove() {}, toggle() {} }, removeAttribute(name) { delete this[name]; }, focus() {},
    addEventListener(name, handler) { this.handler = handler; }, click() { return this.handler?.(); },
  });
  const elements = Object.fromEntries(ids.map(id => [id, element(id)]));
  const buttons = ['correct', 'unsure', 'incorrect'].map(result => Object.assign(element(result), { dataset: { result } }));
  const timers = new Map(); let timerId = 0; let clock = 0;
  const events = []; const warnings = []; const utterances = []; let active = false;
  const context = { HIRAGANA_DATA, document: { getElementById: id => elements[id], querySelectorAll: () => buttons },
    console: { warn: text => warnings.push(text) }, Image: class {},
    setTimeout(fn, delay) { const id = ++timerId; timers.set(id, { fn, at: clock + delay, delay }); return id; }, clearTimeout(id) { timers.delete(id); },
    Audio: class {
      constructor(src) { this.src = src; }
      play() { assert.equal(active, false); active = true; events.push(this.src); if (audio === 'fail') return Promise.reject(new Error('blocked')); return Promise.resolve(); }
      pause() { active = false; }
    }, SpeechSynthesisUtterance: class { constructor(text) { this.text = text; } },
  };
  let utterance;
  const synthesis = { cancel() {}, getVoices: () => [{ lang: 'en-US' }, { lang: 'ja-JP' }], speak(item) {
    assert.equal(active, false); assert.equal(item.lang, 'ja-JP'); assert.equal(item.voice.lang, 'ja-JP');
    assert.equal(item.pitch, 1.1); assert.equal(item.rate, 0.95);
    utterance = item; utterances.push(item); events.push(item.text);
    if (speech === 'fail') item.onerror();
  }};
  context.window = speech === 'missing' ? {} : { speechSynthesis: synthesis, SpeechSynthesisUtterance: context.SpeechSynthesisUtterance };
  vm.createContext(context); vm.runInContext(source, context);
  const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
  return { elements, buttons, events, warnings, utterances, context, timers, flush,
    start: () => elements['start-button'].click(),
    async endEffect() { vm.runInContext('Object.values(effects).find(audio => audio.onended)?.onended()', context); await flush(); },
    async endSpeech() { utterance.onend(); await flush(); },
    async advance(ms) { clock += ms; for (const [id, timer] of [...timers]) if (timer.at <= clock) { timers.delete(id); timer.fn(); } await flush(); },
  };
}

test('20 questions: unique draw, all answers, assets, audio order, exact delays, totals and restart', async () => {
  const app = setup(); app.start(); const chosen = [];
  for (let index = 0; index < 20; index++) {
    const { elements, buttons } = app;
    const current = elements.character.textContent; chosen.push(current);
    const item = HIRAGANA_DATA.find(item => item.character === current);
    assert.ok(item); assert.equal(elements.progress.textContent, `${index + 1}もんめ / 20`);
    const type = ['correct', 'unsure', 'incorrect'][index % 3];
    const before = app.events.length;
    const pending = buttons[index % 3].click(); buttons[(index + 1) % 3].click();
    assert.ok(buttons.every(button => button.disabled));
    assert.equal(app.events.length, before + 1);
    assert.equal(elements['review-image'].hidden, true);
    await app.endEffect();
    assert.equal(elements['review-image'].src, item.image); assert.equal(elements['review-image'].alt, item.phrase);
    assert.equal(elements['review-image'].hidden, false);
    assert.equal(app.events.at(-1), item.character === 'は' ? item.phrase.slice(0, -1) : item.phrase);
    await app.endSpeech();
    if (item.character === 'は') { assert.equal(app.events.at(-1), 'ハ'); await app.endSpeech(); }
    if (type !== 'correct') { assert.equal(app.events.at(-1), 'どうぞ'); await app.endSpeech(); }
    const expected = {correct:'sfx_correct_pikoon.mp3', unsure:'sfx_unsure_bururun.mp3', incorrect:'sfx_incorrect_bu.mp3'}[type];
    assert.equal(app.events[before], `assets/audio/${expected}`);
    assert.equal(app.events.length - before, (type !== 'correct' ? 3 : 2) + (item.character === 'は' ? 1 : 0));
    const delay = type !== 'correct' ? 2500 : 1000;
    assert.deepEqual([...app.timers.values()].map(timer => timer.delay), [delay]);
    await app.advance(delay - 1); assert.equal(elements.character.textContent, current); assert.ok(buttons.every(button => button.disabled));
    await app.advance(1); await pending;
  }
  assert.equal(new Set(chosen).size, 20); assert.equal(app.elements.result.hidden, false);
  assert.deepEqual(['correct','unsure','incorrect'].map(type => Number(app.elements[`count-${type}`].textContent)), [7,7,6]);
  app.elements['restart-button'].click();
  assert.equal(app.elements.question.hidden, false); assert.equal(app.elements.progress.textContent, '1もんめ / 20');
  const fresh = vm.runInContext('questions.map(item => item.character).join("")', app.context);
  assert.equal(new Set([...fresh]).size, 20); assert.notEqual(fresh, chosen.join(''));
  assert.equal(vm.runInContext('answers.length', app.context), 0); assert.equal(app.warnings.length, 0);
});

for (const speech of ['missing', 'fail']) test(`unavailable speech (${speech}) and blocked effect do not stop review`, async () => {
  const app = setup({ speech, audio: 'fail' }); app.start();
  const pending = app.buttons[2].click(); await app.flush();
  assert.equal(app.elements['review-image'].hidden, false); assert.ok(app.warnings.length > 0);
  await app.advance(2500); await pending;
  assert.equal(app.elements.progress.textContent, '2もんめ / 20');
});

test('stalled speech is cancelled and review resumes', async () => {
  const app = setup(); app.start();
  vm.runInContext('questions[0] = HIRAGANA_DATA[0]; showQuestion()', app.context);
  const pending = app.buttons[0].click();
  await app.endEffect(); await app.advance(20000); assert.ok(app.warnings.length > 0);
  await app.advance(1000); await pending; assert.equal(app.elements.progress.textContent, '2もんめ / 20');
});

for (const type of ['correct', 'unsure', 'incorrect']) test(`ha is isolated; ${type} retains its own count and repeat timing`, async () => {
  const app = setup(); app.start();
  vm.runInContext('questions = [HIRAGANA_DATA.find(item => item.character === "は")]; showQuestion()', app.context);
  const pending = app.buttons.find(button => button.dataset.result === type).click();
  await app.endEffect();
  assert.equal(app.elements['review-image'].alt, 'はちのは');
  assert.equal(app.events.at(-1), 'はちの');
  assert.equal(app.timers.size, 1); // Only speech watchdog; no next-question delay yet.
  await app.endSpeech(); assert.equal(app.events.at(-1), 'ハ');
  await app.endSpeech();
  if (type !== 'correct') {
    assert.equal(app.events.at(-1), 'どうぞ');
    assert.equal(app.timers.size, 1);
    await app.endSpeech();
  }
  const delay = type === 'correct' ? 1000 : 2500;
  assert.deepEqual([...app.timers.values()].map(timer => timer.delay), [delay]);
  await app.advance(delay); await pending;
  assert.equal(Number(app.elements[`count-${type}`].textContent), 1);
  for (const other of ['correct', 'unsure', 'incorrect'].filter(other => other !== type)) assert.equal(Number(app.elements[`count-${other}`].textContent), 0);
});

test('voice selection prefers Japanese female names and falls back to Japanese default', () => {
  const app = setup();
  app.context.voices = [{ lang: 'en-US', name: 'Female' }, { lang: 'ja-JP', name: 'Ichiro', default: true }, { lang: 'ja-JP', name: 'Microsoft Haruka' }];
  assert.equal(vm.runInContext('selectJapaneseVoice(voices).name', app.context), 'Microsoft Haruka');
  app.context.voices.pop();
  assert.equal(vm.runInContext('selectJapaneseVoice(voices).name', app.context), 'Ichiro');
  app.context.voices = [{ lang: 'en-US', name: 'Female' }];
  assert.equal(vm.runInContext('selectJapaneseVoice(voices)', app.context), undefined);
});

test('all changed text files are valid UTF-8 with expected Japanese text', () => {
  for (const file of ['index.html','css/style.css','js/app.js','scripts/serve.mjs','tests/app.test.mjs','tests/pages.test.mjs','tests/run.mjs','.gitignore','package.json','README.md']) {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(fs.readFileSync(new URL('../' + file, import.meta.url)));
    assert.equal(text.includes('\uFFFD'), false, file);
    assert.equal(/[\u7e3a\u7e67\u8b41]\S*[\u7e3a\u7e67\u8b41]/u.test(text), false, file);
  }
  assert.ok(fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8').includes('クチズムあいうえお'));
});
