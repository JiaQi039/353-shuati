#!/usr/bin/env node
/**
 * 校验 data/imported/books/*.json，补齐 id，并生成教材题库索引。
 * 用法：node scripts/import-books.mjs
 */
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const configPath = join(root, "data", "imported", "books.config.json");
const indexPath = join(root, "data", "imported", "index.json");
const TYPES = new Set(["single", "multiple", "judge", "fill", "short"]);
const warnings = [];
const errors = [];
const allIds = new Set();

function nonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function validate(question, where) {
  if (!nonEmpty(question.stem)) errors.push(`${where} 缺少 stem`);
  if (!TYPES.has(question.type)) errors.push(`${where} type 非法：${question.type}`);
  if (!Array.isArray(question.options)) errors.push(`${where} options 必须是数组`);
  if (!Array.isArray(question.answer)) errors.push(`${where} answer 必须是数组`);
  if (question.type === "single" || question.type === "judge") {
    if ((question.answer?.length || 0) > 1) errors.push(`${where} 单选/判断不能有多个答案`);
    if ((question.answer?.length || 0) === 0) warnings.push(`${where} 单选/判断暂无答案`);
  }
  if (question.type === "multiple" && (question.answer?.length || 0) === 1) {
    errors.push(`${where} 多选题只有 1 个答案`);
  }
  if (question.type === "multiple" && (question.answer?.length || 0) === 0) {
    warnings.push(`${where} 多选题暂无答案`);
  }
  if (["single", "multiple", "judge"].includes(question.type)) {
    const letters = (question.options || []).map((_, index) => String.fromCharCode(65 + index));
    for (const letter of question.answer || []) {
      if (!letters.includes(letter)) errors.push(`${where} 答案 ${letter} 超出选项范围`);
    }
  }
  if (question.type === "fill" || question.type === "short") {
    if ((question.options || []).length) warnings.push(`${where} 主观题 options 非空`);
    if (!nonEmpty(question.referenceAnswer)) warnings.push(`${where} 缺少 referenceAnswer`);
  }
}

const config = JSON.parse(await readFile(configPath, "utf8"));
const books = [];
for (const book of config) {
  const file = join(root, book.file);
  let questions;
  try {
    questions = JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    errors.push(`${book.slug}: 无法读取 ${book.file}：${error.message}`);
    continue;
  }
  if (!Array.isArray(questions) || !questions.length) {
    errors.push(`${book.slug}: 题库必须是非空数组`);
    continue;
  }
  questions.forEach((question, index) => {
    const where = `${book.slug} 第 ${index + 1} 题`;
    if (!question.id) question.id = `lib-${book.slug}-${String(index + 1).padStart(3, "0")}`;
    if (allIds.has(question.id)) errors.push(`${where} id 重复：${question.id}`);
    allIds.add(question.id);
    question.source = question.source || book.source || book.title;
    question.reviewStatus = question.reviewStatus || "draft";
    validate(question, where);
  });
  await writeFile(file, `${JSON.stringify(questions, null, 2)}\n`, "utf8");

  const chapters = [];
  const counts = new Map();
  const types = {};
  for (const question of questions) {
    const chapter = question.chapter || "未分章";
    if (!counts.has(chapter)) {
      counts.set(chapter, 0);
      chapters.push(chapter);
    }
    counts.set(chapter, counts.get(chapter) + 1);
    types[question.type] = (types[question.type] || 0) + 1;
  }
  books.push({
    ...book,
    count: questions.length,
    chapters: chapters.map(name => ({ name, count: counts.get(name) })),
    types
  });
  console.log(`${book.slug}: ${questions.length} 题 · ${chapters.length} 组`);
}

if (errors.length) {
  console.error("教材题库校验失败：");
  errors.forEach(error => console.error(`  ✗ ${error}`));
  process.exit(1);
}

const index = {
  updated: new Date().toISOString().slice(0, 10),
  books
};
await writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`, "utf8");
console.log(`索引已生成：data/imported/index.json（${books.length} 本书）`);
if (warnings.length) {
  console.log("\n提醒：");
  warnings.slice(0, 20).forEach(warning => console.log(`  ! ${warning}`));
  if (warnings.length > 20) console.log(`  … 另有 ${warnings.length - 20} 条`);
}
