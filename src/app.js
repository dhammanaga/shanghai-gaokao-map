const $ = (selector) => document.querySelector(selector);
const state = { culture: 470, art: 250, detailed: false, expanded: new Set(), showAllGeneral: false };
const data = window.ADMISSION_DATA_2025;
if (!data) throw new Error("本地数据未加载，请确认 src/data 文件夹与 index.html 位于同一个项目目录。");
const { general: generalRows, art: artRows, rank: rankRows, ownership: ownershipData } = data;
const ownershipBySchool = new Map(ownershipData.schools.map((item) => [item.school, item]));

function aggregateSchools(rows, censoredValue = 580) {
  const map = new Map();
  for (const row of rows) {
    const numericScore = row.score ?? censoredValue;
    if (!map.has(row.school)) map.set(row.school, { school: row.school, groups: [], max: numericScore, min: numericScore, censored: false });
    const item = map.get(row.school);
    item.groups.push(row);
    item.max = Math.max(item.max, numericScore);
    item.min = Math.min(item.min, numericScore);
    item.censored ||= row.score === null;
  }
  return [...map.values()].sort((a, b) => b.max - a.max || a.school.localeCompare(b.school, "zh-CN"));
}

const generalSchools = aggregateSchools(generalRows);
const artSchools = aggregateSchools(artRows);

function displayRange(item, decimals) {
  const format = (value) => value.toFixed(decimals).replace(/\.00$/, "");
  if (item.censored && item.min === 580 && item.max === 580) return "580+";
  if (item.min === item.max) return format(item.max);
  return `${format(item.min)}–${item.censored ? "580+" : format(item.max)}`;
}

function renderRail(kind, score, smooth = true) {
  const isArt = kind === "art";
  const schools = isArt ? artSchools : generalSchools;
  const list = $(`#${kind}List`);
  const viewport = $(`#${kind}Viewport`);
  const scroller = list;
  const decimals = isArt ? 2 : 0;
  const abovePublishedRange = !isArt && score >= schools[0].max && !state.showAllGeneral;
  const fragment = document.createDocumentFragment();
  let inserted = false;

  for (const item of schools) {
    if (!inserted && item.max <= score) {
      const marker = document.createElement("div");
      marker.className = "my-position";
      marker.id = `${kind}Position`;
      marker.dataset.score = score.toFixed(decimals);
      fragment.append(marker);
      inserted = true;
    }
    const row = document.createElement("div");
    row.className = "score-row";
    const key = `${kind}:${item.school}`;
    const groups = [...item.groups].sort((a, b) => (b.score ?? 580) - (a.score ?? 580));
    const ownership = ownershipBySchool.get(item.school);
    const officialName = ownership?.officialName;
    const schoolNameHint = officialName && officialName !== item.school ? `${officialName} · ` : "";
    const ownershipLabel = ownership?.ownership ?? "待核实";
    const ownershipClass = ownershipLabel === "民办" ? "private" : ownershipLabel === "合作办学" ? "cooperative" : ownershipLabel === "军队院校" ? "military" : "public";
    row.innerHTML = `
      <div class="score-mark">${displayRange(item, decimals)}</div>
      <button class="school-card ${state.expanded.has(key) || state.detailed ? "expanded" : ""}" type="button" data-key="${key}" aria-expanded="${state.expanded.has(key) || state.detailed}">
        <div class="school-summary"><strong>${item.school}</strong><span class="ownership-badge ${ownershipClass}">${ownershipLabel}</span><span class="group-count">${groups.length} 个专业组</span></div>
        <div class="school-meta">${schoolNameHint}${item.censored ? `${item.groups.every((group) => group.score === null) ? "官方仅公布" : "部分专业组官方仅公布"} 580 分及以上` : `2025 投档线 ${displayRange(item, decimals)}`}</div>
        <div class="group-details">${groups.map((group) => `<div class="group-line"><span>${group.groupName.match(/\(([^)]+)\)$/)?.[1] ?? group.groupCode}组 · ${group.groupCode}</span><strong>${group.scoreDisplay}</strong></div>`).join("")}</div>
      </button>`;
    fragment.append(row);
  }
  if (!inserted) {
    const marker = document.createElement("div");
    marker.className = "my-position";
    marker.id = `${kind}Position`;
    marker.dataset.score = score.toFixed(decimals);
    fragment.append(marker);
  }
  list.replaceChildren(fragment);
  viewport.classList.toggle("above-range", abovePublishedRange);
  if (abovePublishedRange) {
    $(`#${kind}Position`).textContent = `我的文化分 ${score} · 下列 580+ 院校的具体投档线未公开，暂按校名排列`;
  }

  list.querySelectorAll(".school-card").forEach((button) => button.addEventListener("click", () => {
    const key = button.dataset.key;
    state.expanded.has(key) ? state.expanded.delete(key) : state.expanded.add(key);
    button.classList.toggle("expanded");
    button.setAttribute("aria-expanded", button.classList.contains("expanded"));
  }));

  $(`.${kind}-guide`).dataset.score = score.toFixed(decimals);
  requestAnimationFrame(() => {
    if (kind === "general" && state.showAllGeneral) return;
    if (abovePublishedRange) {
      scroller.scrollTo({ top: 0, behavior: "auto" });
      return;
    }
    const marker = $(`#${kind}Position`);
    const top = marker.offsetTop - viewport.clientHeight / 2;
    scroller.scrollTo({ top, behavior: smooth && !matchMedia("(prefers-reduced-motion: reduce)").matches ? "smooth" : "auto" });
  });
}

function toggleGeneralList() {
  state.showAllGeneral = !state.showAllGeneral;
  $(".rails").classList.toggle("general-expanded", state.showAllGeneral);
  const button = $("#generalExpand");
  button.setAttribute("aria-expanded", String(state.showAllGeneral));
  button.textContent = state.showAllGeneral ? "收起全部名单" : `展开全部 ${generalSchools.length} 所`;
  $("#generalFootnote").textContent = state.showAllGeneral
    ? `共 ${generalSchools.length} 所学校、${generalRows.length} 个专业组；按学校最高投档线从高到低排列，点击学校查看各专业组。`
    : "在分数尺内上下滚动，可浏览全部学校。";
  renderRail("general", state.culture, false);
}

function rankFor(score) {
  let previous = { cumulative: 0, scoreDisplay: `高于 ${rankRows[0].scoreMin.toFixed(4)}` };
  for (const band of rankRows) {
    if (score >= band.scoreMin && score <= band.scoreMax) return band;
    if (score > band.scoreMax) return previous;
    previous = band;
  }
  return rankRows.at(-1);
}

function updateRank(combined) {
  const band = rankFor(combined);
  $("#rankValue").textContent = `约前 ${band.cumulative.toLocaleString("zh-CN")} 名`;
  $("#rankBand").textContent = band.cumulative === 0 ? band.scoreDisplay : `投档成绩 ${band.scoreDisplay}`;
}

function requirement(value, max, decimals, impossible, unit = "分") {
  if (value > max) return `<span>${impossible}</span><strong>无法达到</strong><small>反推结果为 ${value.toFixed(decimals)}${unit}，超过满分 ${max}${unit}</small>`;
  const bounded = Math.max(0, value);
  return `<span>${impossible.replace("当前", "按当前")}</span><strong>约需 ${bounded.toFixed(decimals)}${unit}</strong><small>按 2025 投档线等值反推，不含未来波动</small>`;
}

function updateTarget() {
  const selected = artRows.find((row) => row.groupCode === $("#targetSchool").value) ?? artRows[0];
  $("#targetCutoff").textContent = selected.score.toFixed(2);
  const cultureNeed = Math.ceil((selected.score - state.art * 1.1) / 0.5);
  const artNeed = Math.ceil(((selected.score - state.culture * 0.5) / 1.1) * 10) / 10;
  $("#cultureRequirement").innerHTML = requirement(cultureNeed, 660, 0, `当前专业 ${state.art.toFixed(1)} 分下的文化要求`);
  $("#artRequirement").innerHTML = requirement(artNeed, 300, 1, `当前文化 ${state.culture} 分下的专业要求`);
}

function updateAll(smooth = true) {
  const combined = state.culture * 0.5 + state.art * 1.1;
  $("#cultureRange").value = state.culture;
  $("#cultureNumber").value = state.culture;
  $("#artRange").value = state.art;
  $("#artNumber").value = state.art;
  $("#combinedScore").textContent = combined.toFixed(2);
  $("#formulaText").textContent = `${state.culture} × 0.5 + ${state.art.toFixed(1).replace(".0", "")} × 1.1`;
  renderRail("general", state.culture, smooth);
  renderRail("art", combined, smooth);
  updateRank(combined);
  updateTarget();
}

function bindScore(rangeSelector, numberSelector, key, min, max) {
  const apply = (raw) => {
    const number = Number(raw);
    if (!Number.isFinite(number)) return;
    state[key] = Math.min(max, Math.max(min, number));
    updateAll();
  };
  $(rangeSelector).addEventListener("input", (event) => apply(event.target.value));
  $(numberSelector).addEventListener("change", (event) => apply(event.target.value));
}

const targetSelect = $("#targetSchool");
[...artRows].sort((a, b) => b.score - a.score).forEach((row) => {
  const option = document.createElement("option");
  option.value = row.groupCode;
  option.textContent = `${row.groupName} · ${row.scoreDisplay}`;
  option.selected = row.groupCode === "B13A1";
  targetSelect.append(option);
});
targetSelect.addEventListener("change", updateTarget);

bindScore("#cultureRange", "#cultureNumber", "culture", 302, 660);
bindScore("#artRange", "#artNumber", "art", 180, 300);
$("#generalExpand").textContent = `展开全部 ${generalSchools.length} 所`;
$("#generalExpand").addEventListener("click", toggleGeneralList);

$("#detailToggle").addEventListener("click", (event) => {
  state.detailed = !state.detailed;
  event.currentTarget.setAttribute("aria-pressed", String(state.detailed));
  event.currentTarget.textContent = state.detailed ? "切换至简洁模式" : "切换至详细模式";
  updateAll(false);
});

document.querySelectorAll(".mobile-tabs button").forEach((button) => button.addEventListener("click", () => {
  document.querySelectorAll(".mobile-tabs button").forEach((item) => item.classList.toggle("active", item === button));
  $(".rails").dataset.active = button.dataset.tab;
}));

updateAll(false);

// Expose the same two primary journeys to browsers that support WebMCP.
if (document.modelContext?.registerTool) {
  const register = (tool) => Promise.resolve(document.modelContext.registerTool(tool)).catch(() => {});
  register({
    name: "set_exam_scores",
    title: "设置考试成绩",
    description: "设置上海高考文化成绩和美术统考成绩，并返回综合分与2025参考位次。",
    inputSchema: {
      type: "object",
      properties: {
        culture: { type: "number", minimum: 302, maximum: 660 },
        art: { type: "number", minimum: 180, maximum: 300 },
      },
      required: ["culture", "art"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, untrustedContentHint: false },
    execute(input) {
      const culture = Number(input?.culture);
      const art = Number(input?.art);
      if (!Number.isFinite(culture) || culture < 302 || culture > 660 || !Number.isFinite(art) || art < 180 || art > 300) {
        throw new Error("文化分须在302–660之间，专业分须在180–300之间");
      }
      state.culture = culture;
      state.art = art;
      updateAll();
      const combined = culture * 0.5 + art * 1.1;
      return { culture, art, combined: Number(combined.toFixed(2)), approximateRank: rankFor(combined).cumulative };
    },
  });
  register({
    name: "select_art_target",
    title: "选择目标院校",
    description: "按院校专业组代码选择艺术类目标，并返回投档线及当前成绩下的反推要求。",
    inputSchema: {
      type: "object",
      properties: { groupCode: { type: "string" } },
      required: ["groupCode"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, untrustedContentHint: false },
    execute(input) {
      const target = artRows.find((row) => row.groupCode === input?.groupCode);
      if (!target) throw new Error("未找到该院校专业组代码");
      targetSelect.value = target.groupCode;
      updateTarget();
      return {
        groupCode: target.groupCode,
        groupName: target.groupName,
        cutoff: target.score,
        cultureNeeded: Math.ceil((target.score - state.art * 1.1) / 0.5),
        artNeeded: Math.ceil(((target.score - state.culture * 0.5) / 1.1) * 10) / 10,
      };
    },
  });
}
