const QUIZ_URL = "./透明星_quiz.json";
const RESULTS_URL = "./透明星_results.json";

const AXIS_ORDER = ["visibility", "activity", "relation", "voice"];
const TIE_BREAKERS = {
  visibility: "hidden",
  activity: "quiet",
  relation: "connected",
  voice: "true"
};

/* ─── Colour themes ─── */
const TYPE_THEMES = {
  visible_active_connected_true:   "coral",
  visible_active_connected_safe:   "gold",
  visible_active_solo_true:        "coral",
  visible_active_solo_safe:        "gold",
  visible_quiet_connected_true:    "teal",
  visible_quiet_connected_safe:    "lime",
  visible_quiet_solo_true:         "teal",
  visible_quiet_solo_safe:         "lime",
  hidden_active_connected_true:    "sky",
  hidden_active_connected_safe:    "slate",
  hidden_active_solo_true:         "sky",
  hidden_active_solo_safe:         "slate",
  hidden_quiet_connected_true:     "violet",
  hidden_quiet_connected_safe:     "rose",
  hidden_quiet_solo_true:          "violet",
  hidden_quiet_solo_safe:          "rose"
};

const TYPE_CODES = {
  visible: "V", hidden: "H",
  active: "A", quiet: "Q",
  connected: "C", solo: "S",
  true: "T", safe: "F"
};

function getTypeCode(key) {
  return key.split("_").map(w => TYPE_CODES[w] || w[0].toUpperCase()).join("");
}

function getFlavourText(result) {
  const trait = (result.traitCn || result.trait || "");
  const strength = (result.strengthCn || result.strength || "");
  return trait + "\n" + strength;
}

function computeCompat(currentKey) {
  const parts = currentKey.split("_");
  const allKeys = buildAllResultKeys();
  const scored = allKeys
    .filter(k => k !== currentKey)
    .map(k => {
      const kp = k.split("_");
      let score = 0;
      for (let i = 0; i < 4; i++) if (kp[i] === parts[i]) score++;
      return { key: k, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  return scored;
}

const LANG_STORAGE_KEY = "transparentStarLang";
const SUPPORTED_LANGS = ["en", "cn"];

const els = {};
let quizData = null;
let resultsData = null;
let quizState = null;
let currentLang = "en";
const svgCache = new Map();

window.addEventListener("DOMContentLoaded", init);

async function init() {
  cacheElements();
  loadLanguagePreference();
  applyLanguage();
  bindEvents();

  try {
    const [quizResponse, resultsResponse] = await Promise.all([fetch(QUIZ_URL), fetch(RESULTS_URL)]);
    quizData = await quizResponse.json();
    resultsData = await resultsResponse.json();
    validateQuizData(quizData, resultsData);
    hydratePreviewAvatars();
    els.startBtn.disabled = false;
    setStartButtonLabel();
  } catch (error) {
    console.error(error);
    setStartButtonLabel("error");
    els.startBtn.disabled = true;
    document.querySelectorAll(".lead [data-lang-en], .start-note [data-lang-en]").forEach((node) => {
      node.textContent = "The quiz data could not be loaded. Please open this page through a local server.";
    });
    document.querySelectorAll(".lead [data-lang-cn], .start-note [data-lang-cn]").forEach((node) => {
      node.textContent = "測試資料載入失敗，請通過本地伺服器打開此頁面。";
    });
  }
}

function cacheElements() {
  [
    "startScreen",
    "quizScreen",
    "resultScreen",
    "startBtn",
    "restartBtn",
    "progressText",
    "progressBar",
    "questionKicker",
    "questionText",
    "leftOption",
    "rightOption",
    "leftLabel",
    "rightLabel",
    "questionCard",
    "resultCard",
    "rcFlavour",
    "rcHero",
    "resultImage",
    "resultThumb",
    "resultTypeCode",
    "resultName",
    "resultOccupation",
    "resultTrait",
    "resultStrength",
    "resultDayTitle",
    "resultDayStory",
    "signatureMoveList",
    "againBtn",
    "saveBtn",
    "langToggle"
  ].forEach((id) => {
    els[id] = document.getElementById(id);
  });
}

function bindEvents() {
  els.startBtn.addEventListener("click", startQuiz);
  els.restartBtn.addEventListener("click", startQuiz);
  els.againBtn.addEventListener("click", startQuiz);
  els.saveBtn.addEventListener("click", saveResultAsImage);
  els.leftOption.addEventListener("click", () => answerCurrentQuestion("left"));
  els.rightOption.addEventListener("click", () => answerCurrentQuestion("right"));
  els.langToggle.addEventListener("click", toggleLanguage);

  window.addEventListener("keydown", (event) => {
    if (els.quizScreen.classList.contains("hidden")) return;
    if (event.key === "ArrowLeft") answerCurrentQuestion("left");
    if (event.key === "ArrowRight") answerCurrentQuestion("right");
  });
}

function loadLanguagePreference() {
  try {
    const saved = localStorage.getItem(LANG_STORAGE_KEY);
    if (SUPPORTED_LANGS.includes(saved)) currentLang = saved;
  } catch {
    /* ignore */
  }
}

function toggleLanguage() {
  currentLang = currentLang === "en" ? "cn" : "en";
  try {
    localStorage.setItem(LANG_STORAGE_KEY, currentLang);
  } catch {
    /* ignore */
  }
  applyLanguage();
  if (quizState && quizData && !els.quizScreen.classList.contains("hidden")) {
    renderQuestion();
  }
  if (quizState?.finalResult && !els.resultScreen.classList.contains("hidden")) {
    renderResult(quizState.finalResult);
  }
}

function applyLanguage() {
  document.documentElement.lang = currentLang === "cn" ? "zh-Hant" : "en";
  document.body.dataset.lang = currentLang;
}

function setStartButtonLabel(state) {
  const enSpan = els.startBtn.querySelector("[data-lang-en]");
  const cnSpan = els.startBtn.querySelector("[data-lang-cn]");
  if (!enSpan || !cnSpan) return;
  if (state === "error") {
    enSpan.textContent = "Data Failed to Load";
    cnSpan.textContent = "資料載入失敗";
    return;
  }
  enSpan.textContent = "Start Test";
  cnSpan.textContent = "開始測試";
}

function startQuiz() {
  quizState = {
    currentIndex: 0,
    answers: [],
    scores: createEmptyScores(),
    finalResult: null
  };

  showScreen("quiz");
  renderQuestion();
}

function createEmptyScores() {
  return {
    visibility: { visible: 0, hidden: 0 },
    activity: { active: 0, quiet: 0 },
    relation: { connected: 0, solo: 0 },
    voice: { true: 0, safe: 0 }
  };
}

function renderQuestion() {
  const question = quizData.questions[quizState.currentIndex];
  const progress = quizState.currentIndex + 1;
  const total = quizData.questions.length;

  els.progressText.textContent = currentLang === "cn"
    ? `第 ${progress} 題 / 共 ${total} 題`
    : `${progress} / ${total}`;
  els.progressBar.style.width = `${(progress / total) * 100}%`;
  els.questionKicker.textContent = pickLocalized(quizData.axes[question.axis], "label");
  els.questionText.textContent = pickLocalized(question, "text");
  els.leftLabel.textContent = pickLocalized(question.left, "label");
  els.rightLabel.textContent = pickLocalized(question.right, "label");

  els.leftOption.disabled = false;
  els.rightOption.disabled = false;

  /* card enter animation */
  els.questionCard.classList.remove("exit-left", "exit-right");
  els.questionCard.classList.add("entering");
  els.questionCard.addEventListener("animationend", () => {
    els.questionCard.classList.remove("entering");
  }, { once: true });
}

function pickLocalized(obj, baseKey) {
  if (!obj) return "";
  if (currentLang === "cn") {
    const cnKey = baseKey + "Cn";
    if (obj[cnKey]) return obj[cnKey];
  }
  return obj[baseKey] || "";
}

function answerCurrentQuestion(side) {
  if (!quizState || els.leftOption.disabled) return;

  const question = quizData.questions[quizState.currentIndex];
  const choice = question[side];
  quizState.scores[question.axis][choice.value] += 1;
  quizState.answers.push({
    questionId: question.id,
    axis: question.axis,
    side,
    value: choice.value,
    label: choice.label
  });

  els.leftOption.disabled = true;
  els.rightOption.disabled = true;

  /* card exit animation */
  const exitClass = side === "left" ? "exit-left" : "exit-right";
  els.questionCard.classList.add(exitClass);
  els.questionCard.classList.remove("entering");

  window.setTimeout(() => {
    quizState.currentIndex += 1;
    if (quizState.currentIndex >= quizData.questions.length) {
      finishQuiz();
      return;
    }
    renderQuestion();
  }, 200);
}

function finishQuiz() {
  els.progressBar.style.width = "100%";
  const resultKey = buildResultKey(quizState.scores);
  const result = resultsData.results[resultKey];
  quizState.finalResult = { key: resultKey, ...result };
  saveQuizSession(quizState);

  /* Show result screen first so the card enter animation plays before
     content renders (avoids layout jump when async images load mid-animation). */
  showScreen("result");

  /* Re-trigger enter animation: remove + force reflow + restore */
  els.resultCard.style.animation = "none";
  void els.resultCard.offsetHeight;
  els.resultCard.style.animation = "";

  /* Render content after animation starts (small delay so card is visible first) */
  requestAnimationFrame(() => {
    renderResult(quizState.finalResult);
  });
}

function buildResultKey(scores) {
  return AXIS_ORDER.map((axis) => getAxisWinner(axis, scores[axis])).join("_");
}

function getAxisWinner(axis, score) {
  const sides = Object.entries(score);
  const [firstSide, firstScore] = sides[0];
  const [secondSide, secondScore] = sides[1];
  if (firstScore > secondScore) return firstSide;
  if (secondScore > firstScore) return secondSide;
  return TIE_BREAKERS[axis];
}

function renderResult(result) {
  const name = pickLocalized(result, "name");
  const occupation = pickLocalized(result, "occupation");
  const trait = pickLocalized(result, "trait");
  const strength = pickLocalized(result, "strength");
  const dayTitle = pickLocalized(result, "dayTitle");
  const dayStory = pickLocalized(result, "dayStory");
  const moves = currentLang === "cn" && result.signatureMovesCn
    ? result.signatureMovesCn
    : result.signatureMoves;
  const key = result.key;

  /* theme */
  const theme = TYPE_THEMES[key] || "teal";
  els.resultCard.setAttribute("data-theme", theme);

  /* 4-letter type code in the corner badge */
  if (els.resultTypeCode) els.resultTypeCode.textContent = getTypeCode(key);

  /* flavour */
  els.rcFlavour.textContent = getFlavourText(result);

  /* image — main hero + small thumbnail (same source) */
  renderInlineSvg(els.resultImage, result.image, name);
  if (els.resultThumb) renderInlineSvg(els.resultThumb, result.image, "");

  /* name bar */
  els.resultOccupation.textContent = occupation;
  els.resultName.textContent = name;

  /* badges */
  els.resultTrait.textContent = trait;
  els.resultStrength.textContent = strength;

  /* story */
  els.resultDayTitle.textContent = dayTitle;
  els.resultDayStory.textContent = dayStory;

  /* signature moves */
  renderSignatureMoves(moves || []);

  setSaveButtonLabel();
}

function renderSignatureMoves(moves) {
  els.signatureMoveList.innerHTML = "";
  moves.forEach((text) => {
    const item = document.createElement("li");
    item.textContent = text;
    els.signatureMoveList.appendChild(item);
  });
}

function hydratePreviewAvatars() {
  document.querySelectorAll("[data-avatar]").forEach((container) => {
    renderInlineSvg(container, container.dataset.avatar, "");
  });
}

async function renderInlineSvg(container, path, label) {
  container.setAttribute("aria-label", label);
  container.innerHTML = "";

  if (/\.(png|jpe?g|webp|gif)$/i.test(path)) {
    const img = document.createElement("img");
    img.src = path;
    img.alt = label || "";
    img.loading = "lazy";
    /* Keep size only — let each container's CSS decide object-fit / object-position
       (avatar-preview, rc-image, rc-thumb each have their own framing rules). */
    img.style.cssText = "display:block;width:100%;height:100%;";
    container.appendChild(img);
    return;
  }

  try {
    const svgText = await loadSvgText(path);
    container.innerHTML = svgText;
    const svg = container.querySelector("svg");
    if (svg) {
      svg.removeAttribute("role");
      svg.setAttribute("aria-hidden", label ? "false" : "true");
      if (label) svg.setAttribute("aria-label", label);
    }
  } catch (error) {
    console.error(error);
    container.textContent = label || "";
  }
}

async function loadSvgText(path) {
  if (svgCache.has(path)) return svgCache.get(path);
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Failed to load SVG: ${path}`);
  const text = await response.text();
  svgCache.set(path, text);
  return text;
}

function setSaveButtonLabel(state) {
  const enSpan = els.saveBtn.querySelector("[data-lang-en]");
  const cnSpan = els.saveBtn.querySelector("[data-lang-cn]");
  if (!enSpan || !cnSpan) return;
  const labels = {
    saving:  ["Saving…", "處理中…"],
    shared:  ["Shared", "已分享"],
    saved:   ["Saved", "已保存"],
    error:   ["Save Failed", "保存失敗"],
    unavailable: ["Loading…", "載入中…"]
  };
  const [en, cn] = labels[state] || ["Save Image", "保存圖片分享"];
  enSpan.textContent = en;
  cnSpan.textContent = cn;
}

async function saveResultAsImage() {
  if (!quizState?.finalResult) return;
  const result = quizState.finalResult;
  const isMobile = window.innerWidth <= 480;

  setSaveButtonLabel("saving");
  els.saveBtn.disabled = true;

  try {
    /* ── Mobile: Canvas 2D compositing (no html2canvas) ── */
    if (isMobile) {
      await saveOnMobile(result);
      return;
    }

    /* ── Desktop: html2canvas full card capture ── */
    if (typeof html2canvas === "undefined") {
      setSaveButtonLabel("unavailable");
      setTimeout(() => setSaveButtonLabel(), 1800);
      return;
    }

    const card = els.resultCard;
    const canvas = await Promise.race([
      html2canvas(card, {
        backgroundColor: null,
        scale: Math.min(window.devicePixelRatio || 1, 2),
        useCORS: true,
        allowTaint: true,
        logging: false,
        imageTimeout: 8000,
        onclone: (clonedDoc) => {
          const clonedCard = clonedDoc.getElementById("resultCard");
          if (clonedCard) {
            clonedCard.style.animation = "none";
            clonedCard.style.transform = "none";
            clonedCard.style.opacity = "1";
          }
          clonedDoc.querySelectorAll("[id='starCanvas']").forEach((el) => el.remove());
        }
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 20000))
    ]);

    const filename = `transparent-star-${result.key}.png`;
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png", 0.92));
    if (!blob) throw new Error("toBlob failed");

    const file = new File([blob], filename, { type: "image/png" });

    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: pickLocalized(result, "name"),
          text: currentLang === "cn"
            ? `我是透明星居民：${result.nameCn || result.name}`
            : `My Transparent Star resident: ${result.name}`
        });
        setSaveButtonLabel("shared");
        setTimeout(() => setSaveButtonLabel(), 2000);
        return;
      } catch (err) {
        if (err && err.name === "AbortError") { setSaveButtonLabel(); return; }
      }
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setSaveButtonLabel("saved");
    setTimeout(() => setSaveButtonLabel(), 2000);
  } catch (err) {
    console.error(err);
    setSaveButtonLabel("error");
    setTimeout(() => setSaveButtonLabel(), 2200);
  } finally {
    els.saveBtn.disabled = false;
  }
}

/* ── Mobile: draw full card with Canvas 2D (long screenshot) ── */
async function saveOnMobile(result) {
  const W = 560;  /* 1.33× quality bump from 420 */
  const padX = 20;
  const padBottom = 24;

  /* ── Measure content height ── */
  const ctxM = document.createElement("canvas").getContext("2d");

  /* Character image: 1024×1536 (2:3), scaled to card width */
  const imgH = (1536 / 1024) * W;  /* ≈ 840px */
  const imgTop = W * 0.02;         /* slight shift down for framing */

  /* Name section */
  const nameFont = "900 42px 'Noto Serif TC', serif";
  const occFont = "600 13px 'Space Grotesk', sans-serif";
  ctxM.font = occFont;
  const occH = 20;
  ctxM.font = nameFont;
  const nameH = 50;
  const nameSectionH = occH + nameH + 16;

  /* Story — wrap text */
  const dayTitle = pickLocalized(result, "dayTitle");
  const dayStory = pickLocalized(result, "dayStory");
  ctxM.font = "600 12px 'Space Grotesk', sans-serif";
  const titleH = 24;
  ctxM.font = "15px 'Noto Serif TC', serif";
  const storyLines = wrapText(ctxM, dayStory, W - padX * 2);
  const storyH = titleH + storyLines.length * 24 + 8;

  /* Signature moves */
  const moves = currentLang === "cn" && result.signatureMovesCn
    ? result.signatureMovesCn : result.signatureMoves;
  const movesH = moves && moves.length ? 20 + moves.length * 32 + 24 : 0;

  /* Total height */
  const heroEnd = imgTop + imgH;
  const textStart = heroEnd * 0.55;  /* gradient overlay starts at 55% of hero */
  const nameY = textStart + 20;
  const badgesY = nameY + nameSectionH + 8;
  const storyY = badgesY + 60;
  const movesY = storyY + storyH;
  const H = movesY + movesH + padBottom;

  /* ── Draw ── */
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = Math.ceil(H);
  const ctx = canvas.getContext("2d");

  /* Theme colours */
  const theme = els.resultCard.getAttribute("data-theme") || "teal";
  const colours = {
    teal:   ["#1c524e", "#34827c"],
    coral:  ["#78342c", "#a84e42"],
    gold:   ["#6a5620", "#a08038"],
    violet: ["#3c3468", "#5c5098"],
    slate:  ["#2e3648", "#4a566c"],
    rose:   ["#6a3042", "#9c4862"],
    lime:   ["#2e5220", "#4a8034"],
    sky:    ["#1c4268", "#2a5c98"]
  };
  const [bgDark, bgLight] = colours[theme] || colours.teal;

  /* Full background */
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, bgLight);
  grad.addColorStop(0.45, bgDark);
  grad.addColorStop(0.7, "#0e0f1c");
  grad.addColorStop(1, "#08090f");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  /* Draw character image */
  const imgEl = els.resultImage.querySelector("img");
  if (imgEl && imgEl.complete && imgEl.naturalWidth > 0) {
    const drawW = W;
    const drawH = imgH;
    ctx.drawImage(imgEl, 0, imgTop, drawW, drawH);
  }

  /* Gradient overlay for text legibility */
  const overlay = ctx.createLinearGradient(0, heroEnd * 0.48, 0, heroEnd * 0.62);
  overlay.addColorStop(0, "transparent");
  overlay.addColorStop(1, "#0e0f1c");
  ctx.fillStyle = overlay;
  ctx.fillRect(0, heroEnd * 0.48, W, heroEnd * 0.14);

  /* Solid dark below */
  ctx.fillStyle = "#0e0f1c";
  ctx.fillRect(0, heroEnd * 0.60, W, H - heroEnd * 0.60);

  /* Type code badge (top-right, on hero) */
  const typeCode = getTypeCode(result.key);
  ctx.fillStyle = "rgba(10,10,18,0.8)";
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = 1;
  roundRect(ctx, W - 80, 16, 64, 28, 6);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "rgba(255,250,230,0.92)";
  ctx.font = "bold 15px 'Space Grotesk', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(typeCode, W - 48, 35);

  /* Flavour text (vertical, left side on hero) */
  const traitCN = result.traitCn || result.trait || "";
  const strengthCN = result.strengthCn || result.strength || "";
  ctx.save();
  ctx.fillStyle = "rgba(10,10,18,0.55)";
  ctx.font = "bold 22px 'Noto Serif TC', serif";
  ctx.textAlign = "left";
  const flavourY = imgTop + 80;
  const allChars = [...traitCN, ...strengthCN];
  for (let i = 0; i < allChars.length && (flavourY + i * 28) < heroEnd * 0.58; i++) {
    ctx.fillText(allChars[i], 18, flavourY + i * 28);
  }
  ctx.restore();

  /* ── NAME BAR ── */
  ctx.fillStyle = bgDark;
  ctx.fillRect(0, textStart - 8, W, nameSectionH + badgesY - textStart + 60);

  ctx.fillStyle = "rgba(255,255,255,0.78)";
  ctx.font = occFont;
  ctx.textAlign = "center";
  const occupation = pickLocalized(result, "occupation");
  ctx.fillText(occupation, W / 2, nameY);

  ctx.fillStyle = "#fff";
  ctx.font = nameFont;
  const name = pickLocalized(result, "name");
  ctx.fillText(name, W / 2, nameY + occH + 4);

  /* ── BADGES ── */
  const trait = pickLocalized(result, "trait");
  const strength = pickLocalized(result, "strength");
  const bw = 140, bh = 44, br = 22;
  const bx1 = (W / 2) - bw - 10;
  const bx2 = (W / 2) + 10;

  /* Trait */
  roundRect(ctx, bx1, badgesY, bw, bh, br);
  ctx.fillStyle = "rgba(255,255,255,0.2)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.font = "700 10px 'Space Grotesk', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(currentLang === "cn" ? "特質" : "Trait", bx1 + bw / 2, badgesY + 14);
  ctx.fillStyle = "rgba(10,10,18,0.9)";
  ctx.font = "900 20px 'Noto Serif TC', serif";
  ctx.fillText(trait, bx1 + bw / 2, badgesY + 34);

  /* Strength */
  roundRect(ctx, bx2, badgesY, bw, bh, br);
  ctx.fillStyle = "rgba(255,255,255,0.2)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.font = "700 10px 'Space Grotesk', sans-serif";
  ctx.fillText(currentLang === "cn" ? "優勢" : "Strength", bx2 + bw / 2, badgesY + 14);
  ctx.fillStyle = "rgba(10,10,18,0.9)";
  ctx.font = "900 20px 'Noto Serif TC', serif";
  ctx.fillText(strength, bx2 + bw / 2, badgesY + 34);

  /* ── STORY ── */
  ctx.textAlign = "left";
  ctx.fillStyle = bgLight;
  ctx.font = "700 12px 'Space Grotesk', sans-serif";
  ctx.fillText("★", padX, storyY);
  ctx.fillText(dayTitle, padX + 16, storyY);

  ctx.fillStyle = "rgba(240,234,216,0.72)";
  ctx.font = "15px 'Noto Serif TC', serif";
  let sy = storyY + titleH;
  for (const line of storyLines) {
    ctx.fillText(line, padX, sy);
    sy += 24;
  }

  /* ── SIGNATURE MOVES ── */
  if (moves && moves.length) {
    ctx.fillStyle = bgLight;
    ctx.font = "700 12px 'Space Grotesk', sans-serif";
    ctx.textAlign = "left";
    const movesLabel = currentLang === "cn" ? "拿手好戲" : "Signature Moves";
    ctx.fillText("★", padX, movesY);
    ctx.fillText(movesLabel, padX + 16, movesY);

    ctx.font = "14px 'Space Grotesk', sans-serif";
    ctx.fillStyle = "rgba(240,234,216,0.72)";
    let my = movesY + 24;
    for (let i = 0; i < moves.length; i++) {
      const num = String(i + 1).padStart(2, "0");
      /* Number badge */
      ctx.fillStyle = bgLight;
      ctx.fillText(num, padX, my);
      /* Move text */
      ctx.fillStyle = "rgba(240,234,216,0.72)";
      ctx.fillText(moves[i], padX + 28, my);
      my += 32;
    }
  }

  /* ── FOOTER ── */
  ctx.fillStyle = "rgba(255,255,255,0.2)";
  ctx.font = "600 10px 'Space Grotesk', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("透明星居民測驗 · Transparent Star Quiz", W / 2, H - 10);

  /* ── Export & share ── */
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("toBlob failed");

  const filename = `transparent-star-${result.key}.png`;
  const file = new File([blob], filename, { type: "image/png" });
  const shareText = currentLang === "cn"
    ? `我是透明星居民：${result.nameCn || result.name}`
    : `My Transparent Star resident: ${result.name}`;

  /* Try share with image */
  if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name, text: shareText });
      setSaveButtonLabel("shared");
      setTimeout(() => setSaveButtonLabel(), 2000);
      return;
    } catch (err) {
      if (err && err.name === "AbortError") { setSaveButtonLabel(); return; }
    }
  }

  /* Fallback: text-only share */
  if (navigator.share) {
    try {
      await navigator.share({ title: name, text: shareText });
      setSaveButtonLabel("shared");
      setTimeout(() => setSaveButtonLabel(), 2000);
      return;
    } catch (err) {
      if (err && err.name === "AbortError") { setSaveButtonLabel(); return; }
    }
  }

  /* Last resort: download link */
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  setSaveButtonLabel("saved");
  setTimeout(() => setSaveButtonLabel(), 2000);
}

/* Wrap text to fit within maxWidth, returns array of lines */
function wrapText(ctx, text, maxWidth) {
  if (!text) return [];
  const lines = [];
  /* For CJK text, break at any character; for Latin, break at word boundaries */
  const isCJK = /[\u4e00-\u9fff\u3400-\u4dbf]/.test(text);
  const words = isCJK ? [...text] : text.split(" ");
  let line = "";

  for (const word of words) {
    const test = line ? line + (isCJK ? "" : " ") + word : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/* Helper: rounded rectangle path */
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function showScreen(name) {
  els.startScreen.classList.toggle("hidden", name !== "start");
  els.quizScreen.classList.toggle("hidden", name !== "quiz");
  els.resultScreen.classList.toggle("hidden", name !== "result");
}

function saveQuizSession(state) {
  const sessions = loadQuizSessions();
  sessions.push({
    resultKey: state.finalResult.key,
    resultName: state.finalResult.name,
    answers: state.answers,
    createdAt: Date.now()
  });
  try {
    localStorage.setItem("transparentPlanetQuizSessions", JSON.stringify(sessions.slice(-50)));
  } catch {
    /* ignore quota errors */
  }
}

function loadQuizSessions() {
  try {
    return JSON.parse(localStorage.getItem("transparentPlanetQuizSessions") || "[]");
  } catch {
    return [];
  }
}

function validateQuizData(quiz, results) {
  if (!Array.isArray(quiz.questions) || quiz.questions.length !== 16) {
    throw new Error("Quiz must contain exactly 16 questions.");
  }

  const axisCounts = Object.fromEntries(AXIS_ORDER.map((axis) => [axis, 0]));
  quiz.questions.forEach((question) => {
    if (!axisCounts.hasOwnProperty(question.axis)) {
      throw new Error(`Unknown axis: ${question.axis}`);
    }
    if (!question.left?.label || !question.right?.label) {
      throw new Error(`Question ${question.id} must contain two labels.`);
    }
    axisCounts[question.axis] += 1;
  });

  Object.entries(axisCounts).forEach(([axis, count]) => {
    if (count !== 4) throw new Error(`Axis ${axis} must contain 4 questions.`);
  });

  const expectedKeys = buildAllResultKeys();
  expectedKeys.forEach((key) => {
    if (!results.results[key]) throw new Error(`Missing result: ${key}`);
  });
}

function buildAllResultKeys() {
  const values = {
    visibility: ["visible", "hidden"],
    activity: ["active", "quiet"],
    relation: ["connected", "solo"],
    voice: ["true", "safe"]
  };
  const keys = [];

  values.visibility.forEach((visibility) => {
    values.activity.forEach((activity) => {
      values.relation.forEach((relation) => {
        values.voice.forEach((voice) => {
          keys.push([visibility, activity, relation, voice].join("_"));
        });
      });
    });
  });

  return keys;
}
