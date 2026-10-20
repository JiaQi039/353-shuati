#!/usr/bin/env node
/**
 * 扫描 data/questions/*.json，校验题目格式，生成 data/manifest.json。
 * 用法：node scripts/build-index.mjs
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const questionsDir = join(root, "data", "questions");

const SUBJECTS = [
  {
    id: "epidemiology",
    name: "流行病学",
    short: "流病",
    color: "#245c4c",
    description: "疾病分布、研究设计、偏倚与因果推断"
  },
  {
    id: "statistics",
    name: "卫生统计学",
    short: "卫统",
    color: "#3a6b8a",
    description: "统计描述、假设检验、回归与研究设计"
  },
  {
    id: "social",
    name: "社会医学",
    short: "社医",
    color: "#8a5f7a",
    description: "医学模式、健康社会决定因素、卫生服务与政策"
  },
  {
    id: "environmental",
    name: "环境卫生学",
    short: "环卫",
    color: "#5c7a4a",
    description: "空气、水、土壤、物理因素与风险评估"
  },
  {
    id: "occupational",
    name: "职业卫生与职业医学",
    short: "职卫",
    color: "#8a5a3c",
    description: "粉尘、职业中毒、物理因素与健康监护"
  },
  {
    id: "nutrition",
    name: "营养与食品卫生学",
    short: "营养",
    color: "#a06a2c",
    description: "营养素、膳食指南、食源性疾病与食品安全"
  },
  {
    id: "toxicology",
    name: "毒理学",
    short: "毒理",
    color: "#6b5a7a",
    description: "毒物动力学、毒性评价与安全限值"
  }
];

const TYPES = new Set(["single", "multiple", "judge", "fill", "short"]);
const errors = [];
const warnings = [];
const allIds = new Set();
const allStems = new Map();

function fail(file, message) {
  errors.push(`${file}: ${message}`);
}

function nonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function validateQuestion(file, question, index, subjectId) {
  const where = `第 ${index + 1} 题`;
  if (!question || typeof question !== "object" || Array.isArray(question)) {
    fail(file, `${where} 不是对象`);
    return;
  }
  if (!nonEmpty(question.id)) fail(file, `${where} 缺少 id`);
  if (question.id && !/^[a-z]+-\d{3}$/.test(question.id)) {
    fail(file, `${where} id 格式应为 科目缩写-三位数字，如 epi-001`);
  }
  if (question.id && allIds.has(question.id)) fail(file, `${where} id 重复：${question.id}`);
  if (question.id) allIds.add(question.id);
  if (question.subject !== subjectId) {
    fail(file, `${where} subject 应为 ${subjectId}，实际为 ${question.subject}`);
  }
  if (!nonEmpty(question.chapter)) fail(file, `${where} 缺少 chapter`);
  if (!nonEmpty(question.stem)) fail(file, `${where} 缺少题干`);
  if (!nonEmpty(question.tag)) warn(file, `${where} 缺少考点标签`);
  if (!nonEmpty(question.explain)) warn(file, `${where} 缺少解析`);
  if (!TYPES.has(question.type)) {
    fail(file, `${where} type 必须是 single / multiple / judge / fill / short`);
  }
  if (question.type === "fill" || question.type === "short") {
    if (Array.isArray(question.options) && question.options.length) {
      warn(file, `${where} 填空/简答题建议 options 为空数组`);
    }
    if (Array.isArray(question.answer) && question.answer.length) {
      warn(file, `${where} 填空/简答题建议 answer 为空数组，参考答案放 referenceAnswer`);
    }
    if (!nonEmpty(question.referenceAnswer)) {
      warn(file, `${where} 缺少 referenceAnswer`);
    }
    if (!nonEmpty(question.stem)) fail(file, `${where} 缺少题干`);
    return;
  }
  if (!Array.isArray(question.options) || question.options.length < 2) {
    fail(file, `${where} options 至少需要 2 个选项`);
    return;
  }
  if (question.options.some(option => !nonEmpty(option))) {
    fail(file, `${where} 存在空选项`);
  }
  if (question.type === "judge") {
    if (question.options.length !== 2 || question.options[0] !== "正确" || question.options[1] !== "错误") {
      fail(file, `${where} 判断题选项应为 ["正确","错误"]`);
    }
  }
  const letters = question.options.map((_, i) => String.fromCharCode(65 + i));
  if (!Array.isArray(question.answer) || question.answer.length === 0) {
    fail(file, `${where} answer 必须是非空数组`);
    return;
  }
  const unique = new Set(question.answer);
  if (unique.size !== question.answer.length) fail(file, `${where} answer 存在重复项`);
  for (const letter of question.answer) {
    if (!letters.includes(letter)) fail(file, `${where} 答案 ${letter} 超出选项范围（${letters.join("/")}）`);
  }
  if (question.type === "single" || question.type === "judge") {
    if (question.answer.length !== 1) fail(file, `${where} 单选/判断题只能有 1 个答案`);
  }
  if (question.type === "multiple" && question.answer.length < 2) {
    fail(file, `${where} 多选题至少需要 2 个答案`);
  }
  if (nonEmpty(question.stem)) {
    const key = question.stem.replace(/\s+/g, "");
    if (allStems.has(key)) warn(file, `${where} 题干与 ${allStems.get(key)} 重复`);
    else allStems.set(key, question.id || where);
  }
}

function warn(file, message) {
  warnings.push(`${file}: ${message}`);
}

async function main() {
  const files = (await readdir(questionsDir)).filter(file => file.endsWith(".json")).sort();
  if (!files.length) {
    console.error("data/questions 下没有题库文件");
    process.exit(1);
  }

  const subjects = [];
  for (const meta of SUBJECTS) {
    const fileName = `${meta.id}.json`;
    if (!files.includes(fileName)) {
      // 允许某些院校不考毒理学等科目，缺失时跳过而不报错
      warnings.push(`${fileName} 不存在，已跳过该科目`);
      continue;
    }
    const raw = await readFile(join(questionsDir, fileName), "utf8");
    let questions;
    try {
      questions = JSON.parse(raw);
    } catch (error) {
      errors.push(`${fileName}: JSON 解析失败 —— ${error.message}`);
      continue;
    }
    if (!Array.isArray(questions)) {
      errors.push(`${fileName}: 文件顶层必须是数组`);
      continue;
    }
    questions.forEach((question, index) => validateQuestion(fileName, question, index, meta.id));

    const chapterOrder = [];
    const chapterCount = new Map();
    for (const question of questions) {
      if (!nonEmpty(question.chapter)) continue;
      if (!chapterCount.has(question.chapter)) {
        chapterCount.set(question.chapter, 0);
        chapterOrder.push(question.chapter);
      }
      chapterCount.set(question.chapter, chapterCount.get(question.chapter) + 1);
    }
    subjects.push({
      ...meta,
      file: `data/questions/${fileName}`,
      count: questions.length,
      chapters: chapterOrder.map(name => ({ name, count: chapterCount.get(name) }))
    });
  }

  const orphan = files.filter(file => !SUBJECTS.some(meta => `${meta.id}.json` === file));
  if (orphan.length) warnings.push(`未在索引中登记的题库文件：${orphan.join("、")}`);

  if (errors.length) {
    console.error("题库校验未通过：");
    errors.forEach(message => console.error(`  ✗ ${message}`));
    if (warnings.length) {
      console.error("\n警告：");
      warnings.forEach(message => console.error(`  ! ${message}`));
    }
    process.exit(1);
  }

  const total = subjects.reduce((sum, subject) => sum + subject.count, 0);
  const payload = {
    title: "353 卫生综合刷题室",
    updated: new Date().toISOString().slice(0, 10),
    total,
    subjects
  };
  await writeFile(join(root, "data", "manifest.json"), `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  console.log("题库索引已生成：data/manifest.json");
  for (const subject of subjects) {
    console.log(`  ${subject.name.padEnd(12, " ")} ${String(subject.count).padStart(4)} 题 · ${subject.chapters.length} 章`);
  }
  console.log(`  合计 ${total} 题`);
  if (warnings.length) {
    console.log("\n警告：");
    warnings.forEach(message => console.log(`  ! ${message}`));
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
