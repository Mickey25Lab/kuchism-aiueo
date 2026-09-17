import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { HIRAGANA_DATA } from "../js/hiragana-data.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];

const requiredFiles = [
  "MVP_SPEC.md",
  "CLAUDE.md",
  "assets/images/ui/screen_01_start_bg.webp",
  "assets/images/ui/screen_02_question_bg.webp",
  "assets/images/ui/screen_05_result_bg.webp",
  "assets/audio/sfx_correct_pikoon.mp3",
  "assets/audio/sfx_unsure_bururun.mp3",
  "assets/audio/sfx_incorrect_bu.mp3",
  "docs/design-reference/screen_01_start.png",
  "docs/design-reference/screen_05_result.png"
];

function checkFile(relativePath) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) {
    errors.push(`不足: ${relativePath}`);
    return;
  }
  if (fs.statSync(absolutePath).size === 0) {
    errors.push(`0バイト: ${relativePath}`);
  }
}

requiredFiles.forEach(checkFile);

if (HIRAGANA_DATA.length !== 46) {
  errors.push(`ひらがなデータ件数: 46件ではなく${HIRAGANA_DATA.length}件`);
}

const ids = new Set();
const characters = new Set();
const images = new Set();

for (const item of HIRAGANA_DATA) {
  if (ids.has(item.id)) errors.push(`ID重複: ${item.id}`);
  if (characters.has(item.character)) errors.push(`文字重複: ${item.character}`);
  if (images.has(item.image)) errors.push(`画像パス重複: ${item.image}`);

  ids.add(item.id);
  characters.add(item.character);
  images.add(item.image);

  if (item.phrase !== `${item.word}の${item.character}`) {
    errors.push(`フレーズ不一致: ${item.character}`);
  }
  checkFile(item.image);
}

for (let id = 1; id <= 46; id += 1) {
  if (!ids.has(id)) errors.push(`ID不足: ${id}`);
}

if (errors.length > 0) {
  console.error("素材検査に失敗しました。\n" + errors.map((error) => `- ${error}`).join("\n"));
  process.exit(1);
}

console.log("素材検査OK: 46文字、画像46枚、画面背景3点、効果音3点、デザイン見本2点");
