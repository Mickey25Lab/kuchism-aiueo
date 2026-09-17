import { HIRAGANA_DATA } from './hiragana-data.js';

const QUESTION_COUNT = 20;
const screens = ['start', 'question', 'result'].map(id => document.getElementById(id));
const buttons = [...document.querySelectorAll('[data-result]')];
const character = document.getElementById('character');
const reviewImage = document.getElementById('review-image');
const effects = Object.fromEntries(Object.entries({
  correct: 'assets/audio/sfx_correct_pikoon.mp3',
  unsure: 'assets/audio/sfx_unsure_bururun.mp3',
  incorrect: 'assets/audio/sfx_incorrect_bu.mp3',
}).map(([key, path]) => [key, new Audio(path)]));
Object.values(effects).forEach(audio => { audio.preload = 'auto'; });
let questions = [];
let answers = [];
let currentIndex = 0;
let busy = false;
const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

function showScreen(id) {
  screens.forEach(screen => { screen.hidden = screen.id !== id; });
}

function startSession() {
  questions = [...HIRAGANA_DATA];
  for (let index = questions.length - 1; index > 0; index -= 1) {
    const other = Math.floor(Math.random() * (index + 1));
    [questions[index], questions[other]] = [questions[other], questions[index]];
  }
  questions = questions.slice(0, QUESTION_COUNT);
  answers = [];
  currentIndex = 0;
  busy = false;
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  // Preload selected review images without changing the supplied assets.
  questions.forEach(item => { const image = new Image(); image.src = item.image; });
  showScreen('question');
  showQuestion();
}

function showQuestion() {
  const item = questions[currentIndex];
  document.getElementById('progress').textContent = `${currentIndex + 1}もんめ / ${QUESTION_COUNT}`;
  document.getElementById('progress-bar').value = currentIndex;
  character.textContent = item.character;
  character.hidden = false;
  reviewImage.hidden = true;
  reviewImage.removeAttribute('src');
  document.getElementById('feedback').textContent = '';
  buttons.forEach(button => { button.disabled = false; button.classList.remove('selected'); });
  busy = false;
}

function playEffect(audio) {
  return new Promise(resolve => {
    let timer;
    const finish = () => {
      clearTimeout(timer);
      audio.onended = audio.onerror = null;
      audio.pause();
      resolve();
    };
    audio.currentTime = 0;
    audio.onended = finish;
    audio.onerror = () => { console.warn('効果音を再生できません。'); finish(); };
    timer = setTimeout(() => { console.warn('効果音の再生を終了します。'); finish(); }, 10000);
    audio.play().catch(() => { console.warn('効果音を再生できません。'); finish(); });
  });
}

// Keep all speech in one replaceable function; never overlap speech and effects.
function selectJapaneseVoice(voices) {
  const japanese = voices.filter(voice => /^ja(?:-|_|$)/i.test(voice.lang));
  // Web Speech exposes no gender/timbre field. Prefer recognizable female
  // voice names when available, with a Japanese default as the fallback.
  const female = /haruka|nanami|kyoko|mizuki|ayumi|sayaka|o-ren|female|女性|はるか|ななみ|きょうこ|さやか/i;
  return japanese.find(voice => female.test(voice.name || ''))
    || japanese.find(voice => voice.default) || japanese[0];
}

function speak(text) {
  return new Promise(resolve => {
    if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) {
      console.warn('このブラウザでは読み上げを利用できません。');
      resolve();
      return;
    }
    const synthesis = window.speechSynthesis;
    synthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ja-JP';
    const voice = selectJapaneseVoice(synthesis.getVoices());
    if (voice) utterance.voice = voice;
    utterance.pitch = 1.1;
    utterance.rate = 0.95;
    let timer;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      utterance.onend = utterance.onerror = null;
      resolve();
    };
    utterance.onend = finish;
    utterance.onerror = () => { console.warn('読み上げを利用できません。'); synthesis.cancel(); finish(); };
    timer = setTimeout(() => {
      console.warn('読み上げが応答しないため、画面表示を続けます。');
      synthesis.cancel();
      finish();
    }, 20000);
    try { synthesis.speak(utterance); }
    catch { console.warn('読み上げを利用できません。'); finish(); }
  });
}

async function answer(result) {
  if (busy || screens[1].hidden || currentIndex >= questions.length) return;
  busy = true;
  buttons.forEach(button => { button.disabled = true; button.classList.toggle('selected', button.dataset.result === result); });
  const item = questions[currentIndex];
  answers.push({ character: item.character, result });
  await playEffect(effects[result]);
  character.hidden = true;
  reviewImage.src = item.image;
  reviewImage.alt = item.phrase;
  reviewImage.hidden = false;
  document.getElementById('feedback').textContent = item.phrase;
  if (item.character === 'は') {
    // Keep the confirmed phrase intact in data and UI. Isolate the final
    // character and use katakana for speech so it cannot become a particle.
    await speak(item.phrase.slice(0, -1));
    await speak('ハ');
  } else {
    await speak(item.phrase);
  }
  const repeat = result === 'unsure' || result === 'incorrect';
  if (repeat) await speak('どうぞ');
  await wait(repeat ? 2500 : 1000);
  currentIndex += 1;
  if (currentIndex < questions.length) showQuestion();
  else {
    for (const type of ['correct', 'unsure', 'incorrect']) {
      document.getElementById(`count-${type}`).textContent = answers.filter(item => item.result === type).length;
    }
    showScreen('result');
    document.getElementById('restart-button').focus({ preventScroll: true });
  }
}

document.getElementById('start-button').addEventListener('click', startSession);
document.getElementById('restart-button').addEventListener('click', startSession);
buttons.forEach(button => button.addEventListener('click', () => answer(button.dataset.result)));
