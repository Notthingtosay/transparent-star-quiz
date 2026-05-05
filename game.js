const QUIZ_URL = "./透明星_quiz.json";
const RESULTS_URL = "./透明星_results.json";

const AXIS_ORDER = ["visibility", "activity", "relation", "voice"];
const TIE_BREAKERS = {
  visibility: "visible",
  activity: "active",
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
    "qrCode",
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

  /* QR code */
  generateQrCode();

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

function generateQrCode() {
  if (typeof qrcode === "undefined") return;
  const url = window.location.origin + window.location.pathname;
  try {
    const qr = qrcode(0, "M");
    qr.addData(url);
    qr.make();
    els.qrCode.innerHTML = qr.createImgTag(3);
  } catch {
    /* QR generation failed — hide the section */
    const section = els.qrCode.closest(".rc-qr-section");
    if (section) section.style.display = "none";
  }
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

    /* Direct download */
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

/* ── Mobile: draw share card with Canvas 2D ── */
async function saveOnMobile(result) {
  const W = 420;
  const H = 740;
  const scale = 2;
  const canvas = document.createElement("canvas");
  canvas.width = W * scale;
  canvas.height = H * scale;
  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);

  /* Theme colour from the card's data-theme attribute */
  const theme = els.resultCard.getAttribute("data-theme") || "teal";
  const colours = {
    teal:   ["#1a4a47", "#2d6e6a"],
    coral:  ["#6b2e26", "#96423a"],
    gold:   ["#5c4a1e", "#8a7030"],
    violet: ["#332d5c", "#50448a"],
    slate:  ["#2a3040", "#445060"],
    rose:   ["#5c2a3a", "#8a4058"],
    lime:   ["#2a4a1e", "#447030"],
    sky:    ["#1a3a5c", "#2a508a"]
  };
  const [bgDark, bgLight] = colours[theme] || colours.teal;

  /* Gradient background */
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, bgLight);
  grad.addColorStop(0.55, bgDark);
  grad.addColorStop(1, "#0e0f1c");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  /* Draw character image from the DOM */
  const imgEl = els.resultImage.querySelector("img");
  if (imgEl && imgEl.complete && imgEl.naturalWidth > 0) {
    const imgW = imgEl.naturalWidth;
    const imgH = imgEl.naturalHeight;
    const drawW = W;
    const drawH = (imgH / imgW) * W;
    const drawY = -20;
    ctx.drawImage(imgEl, 0, drawY, drawW, drawH);
  }

  /* Dark overlay — starts at 38% to leave more hero visible */
  const overlayStart = H * 0.38;
  const overlay = ctx.createLinearGradient(0, overlayStart, 0, H);
  overlay.addColorStop(0, "transparent");
  overlay.addColorStop(0.45, "rgba(14,15,28,0.65)");
  overlay.addColorStop(1, "rgba(14,15,28,0.95)");
  ctx.fillStyle = overlay;
  ctx.fillRect(0, overlayStart, W, H - overlayStart);

  /* Type code badge (top-right) */
  const typeCode = getTypeCode(result.key);
  ctx.fillStyle = "rgba(10,10,18,0.8)";
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = 1;
  roundRect(ctx, W - 70, 14, 58, 26, 6);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "rgba(255,250,230,0.9)";
  ctx.font = "bold 14px 'Space Grotesk', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(typeCode, W - 41, 32);

  /* Flavour text (vertical, left side) */
  const traitCN = result.traitCn || result.trait || "";
  const strengthCN = result.strengthCn || result.strength || "";
  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.font = "bold 20px 'Noto Serif TC', serif";
  ctx.textAlign = "left";
  const flavourY = 110;
  for (let i = 0; i < traitCN.length; i++) {
    ctx.fillText(traitCN[i], 16, flavourY + i * 26);
  }
  for (let i = 0; i < strengthCN.length; i++) {
    ctx.fillText(strengthCN[i], 16, flavourY + (traitCN.length + i) * 26);
  }
  ctx.restore();

  /* ── Text zone: generous vertical rhythm ── */

  /* Occupation (small, light, above name) */
  const occupation = pickLocalized(result, "occupation");
  const name = pickLocalized(result, "name");
  ctx.fillStyle = "rgba(255,255,255,0.65)";
  ctx.font = "600 13px 'Space Grotesk', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(occupation, W / 2, H - 280);

  /* Name (bold, headline) */
  ctx.fillStyle = "#fff";
  ctx.font = "900 40px 'Noto Serif TC', serif";
  ctx.fillText(name, W / 2, H - 220);

  /* Trait + Strength badges (side-by-side, centered) */
  const trait = pickLocalized(result, "trait");
  const strength = pickLocalized(result, "strength");
  const badgeY = H - 140;

  /* Left badge — Trait */
  roundRect(ctx, 60, badgeY - 22, 120, 40, 20);
  ctx.fillStyle = "rgba(255,255,255,0.16)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.28)";
  ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.font = "700 9px 'Space Grotesk', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(currentLang === "cn" ? "特質" : "Trait", 120, badgeY - 8);
  ctx.fillStyle = "#fff";
  ctx.font = "900 17px 'Noto Serif TC', serif";
  ctx.fillText(trait, 120, badgeY + 10);

  /* Right badge — Strength */
  roundRect(ctx, W - 180, badgeY - 22, 120, 40, 20);
  ctx.fillStyle = "rgba(255,255,255,0.16)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.28)";
  ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.font = "700 9px 'Space Grotesk', sans-serif";
  ctx.fillText(currentLang === "cn" ? "優勢" : "Strength", W - 120, badgeY - 8);
  ctx.fillStyle = "#fff";
  ctx.font = "900 17px 'Noto Serif TC', serif";
  ctx.fillText(strength, W - 120, badgeY + 10);

  /* ── QR code (centered, no label) ── */
  await drawQrOnCanvas(ctx, W, H);

  /* Footer */
  ctx.fillStyle = "rgba(255,255,255,0.22)";
  ctx.font = "600 10px 'Space Grotesk', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("透明星居民測驗 · Transparent Star Quiz", W / 2, H - 10);

  /* Export & share */
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png", 0.9));
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

/* Helper: draw QR code on Canvas 2D (for mobile share card) */
async function drawQrOnCanvas(ctx, W, H) {
  if (typeof qrcode === "undefined") return;
  const url = window.location.origin + window.location.pathname;
  try {
    const qr = qrcode(0, "M");
    qr.addData(url);
    qr.make();
    const qrDataUrl = qr.createDataURL(4);
    const qrImg = await loadImage(qrDataUrl);

    const qrSize = 56;
    const qrX = (W - qrSize) / 2;
    const qrY = H - qrSize - 30;

    /* White background with rounded corners */
    ctx.fillStyle = "#fff";
    roundRect(ctx, qrX - 4, qrY - 4, qrSize + 8, qrSize + 8, 8);
    ctx.fill();

    /* QR code image */
    ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);
  } catch {
    /* QR draw failed — gracefully skip */
  }
}

/* Helper: load image from URL */
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
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
