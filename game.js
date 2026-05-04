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
  renderResult(quizState.finalResult);
  showScreen("result");
  /* re-trigger enter animation */
  els.resultCard.style.animation = "none";
  els.resultCard.offsetHeight;
  els.resultCard.style.animation = "";
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
  if (typeof html2canvas === "undefined") {
    setSaveButtonLabel("unavailable");
    setTimeout(() => setSaveButtonLabel(), 1800);
    return;
  }

  setSaveButtonLabel("saving");
  els.saveBtn.disabled = true;

  try {
    const card = els.resultCard;
    const canvas = await html2canvas(card, {
      backgroundColor: null,
      /* keep scale modest — toBlob is single-threaded and slow on huge canvases */
      scale: Math.min(window.devicePixelRatio || 1, 2),
      useCORS: true,
      allowTaint: true,
      logging: false,
      imageTimeout: 8000,
      /* Strip CSS animations on the cloned DOM so html2canvas doesn't capture
         the keyframe's "from" state (opacity:0, translateY) as the final frame. */
      onclone: (clonedDoc) => {
        const clonedCard = clonedDoc.getElementById("resultCard");
        if (clonedCard) {
          clonedCard.style.animation = "none";
          clonedCard.style.transform = "none";
          clonedCard.style.opacity = "1";
        }
        clonedDoc.querySelectorAll("[id='starCanvas']").forEach((el) => el.remove());
      }
    });

    const result = quizState.finalResult;
    const filename = `transparent-star-${result.key}.png`;

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png", 0.95));
    if (!blob) throw new Error("toBlob failed");

    const file = new File([blob], filename, { type: "image/png" });

    /* Try the native Web Share API first (mobile / PWA) */
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
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
        if (err && err.name === "AbortError") {
          setSaveButtonLabel();
          return;
        }
        /* fall through to download */
      }
    }

    /* Desktop / fallback: trigger a download */
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
