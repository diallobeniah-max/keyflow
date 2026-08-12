#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const rendererRoot = path.join(root, "src");
const tokenFiles = new Set([
  path.normalize(path.join("src", "design", "tokens.css")),
]);
const approvedThemeFiles = new Set(tokenFiles);
const extensions = new Set([".css", ".tsx", ".ts", ".jsx", ".js"]);
const ignoredDirectories = new Set(["node_modules", "dist", "build", "dist-electron", ".git"]);
const issues = [];

const approvedSpacing = new Set(["0", "4", "8", "12", "16", "20", "24", "32", "40", "48", "64"]);
const approvedRadii = new Set(["6", "8", "12", "16", "20", "999"]);
const approvedFontSizes = new Set(["12", "13", "14", "16", "19", "26", "32"]);
const approvedHex = new Set([
  "#0b0f17", "#0e131d", "#121925", "#17202e", "#1b2636", "#1e2e48",
  "#202b3b", "#2b384b", "#3a4a61", "#f5f7fa", "#b2bdcc", "#778397", "#566174",
  "#4f7cff", "#6a91ff", "#3f68df", "#34c78a", "#e7a63a", "#e65b65",
  "#f4f7fb", "#ffffff", "#f8fafd", "#eef3f9", "#e7eeff", "#e5eaf1",
  "#d7dee8", "#c2cbd8", "#18202c", "#4f5c6d", "#7b8797", "#a0a8b3",
  "#416fe8", "#315fd6", "#294fb8",
]);

function relative(file) {
  return path.relative(root, file).split(path.sep).join("/");
}

function add(file, line, kind, message, excerpt) {
  issues.push({ file: relative(file), line, kind, message, excerpt: excerpt?.trim() });
}

function walk(directory) {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (ignoredDirectories.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(absolute);
    else if (extensions.has(path.extname(entry.name).toLowerCase())) inspect(absolute);
  }
}

function lineNumber(content, offset) {
  return content.slice(0, offset).split("\n").length;
}

function inspect(file) {
  const rel = relative(file);
  if (!rel.startsWith("src/")) return;
  const normalized = path.normalize(rel);
  const content = fs.readFileSync(file, "utf8");
  const lines = content.split(/\r?\n/);
  const isTokenFile = tokenFiles.has(normalized);
  const isThemeFile = approvedThemeFiles.has(normalized);
  const isSvgGeometry = /<svg[\s\S]*?>[\s\S]*?<\/svg>/.test(content) && !content.includes("style");

  if (!isTokenFile && !isSvgGeometry && !rel.includes("src/lib/constants.ts") && !rel.includes("src/components/ui.tsx")) {
    const hexPattern = /#[0-9a-fA-F]{3,8}\b/g;
    for (const match of content.matchAll(hexPattern)) {
      const value = match[0].toLowerCase();
      if (!approvedHex.has(value)) {
        add(file, lineNumber(content, match.index), "colour", `Hard-coded hex colour ${match[0]} is outside the approved token/theme files.`, lines[lineNumber(content, match.index) - 1]);
      }
    }
    const colourFunction = /\b(?:rgb|rgba|hsl|hsla)\s*\(/g;
    for (const match of content.matchAll(colourFunction)) {
      add(file, lineNumber(content, match.index), "colour", `${match[0].trim()} colour function should come from a token/theme file.`, lines[lineNumber(content, match.index) - 1]);
    }
  }

  if (file.endsWith(".css") && !isTokenFile) {
    const declarations = [
      { name: "font-size", values: /font-size\s*:\s*([0-9.]+)px/g, allowed: approvedFontSizes, label: "font-size" },
      { name: "border-radius", values: /border-radius\s*:\s*([0-9.]+)px/g, allowed: approvedRadii, label: "border-radius" },
    ];
    for (const declaration of declarations) {
      for (const match of content.matchAll(declaration.values)) {
        if (!declaration.allowed.has(match[1])) {
          add(file, lineNumber(content, match.index), declaration.name, `${declaration.label} ${match[1]}px is not in the approved scale.`, lines[lineNumber(content, match.index) - 1]);
        }
      }
    }

    const spacingPattern = /(?:^|[;{\s])(?:gap|padding(?:-(?:top|right|bottom|left))?|margin(?:-(?:top|right|bottom|left))?)\s*:\s*([^;{}]+)/g;
    for (const match of content.matchAll(spacingPattern)) {
      const values = match[1].match(/(?<![a-zA-Z-])([0-9.]+)px\b/g) ?? [];
      for (const value of values) {
        const number = value.replace("px", "");
        if (!approvedSpacing.has(number)) {
          add(file, lineNumber(content, match.index), "spacing", `${match[0].trim()} includes undocumented ${value} spacing.`, lines[lineNumber(content, match.index) - 1]);
        }
      }
    }
  }

  if (!isTokenFile && /<select\b/.test(content)) {
    add(file, 1, "select", "Raw <select> found outside the shared AppSelect implementation.", "<select>");
  }
  if (file.endsWith(".tsx") && /style=\{\{/.test(content) && !rel.includes("components/ui/AppSelect.tsx") && !rel.includes("components/ui.tsx")) {
    const count = (content.match(/style=\{\{/g) ?? []).length;
    if (count > 3) add(file, 1, "inline-style", `${count} permanent inline style objects found; prefer token-backed component CSS.`, "style={{");
  }
}

walk(rendererRoot);

console.log("KeyFlow design-system check");
console.log(`Scanned renderer files under ${relative(rendererRoot)}.`);
if (issues.length === 0) {
  console.log("PASS: no likely design-system violations found.");
  process.exitCode = 0;
} else {
  const counts = issues.reduce((result, issue) => {
    result[issue.kind] = (result[issue.kind] ?? 0) + 1;
    return result;
  }, {});
  console.log(`Found ${issues.length} likely violation(s): ${Object.entries(counts).map(([key, value]) => `${key}=${value}`).join(", ")}`);
  for (const issue of issues) {
    console.log(`- ${issue.file}:${issue.line} [${issue.kind}] ${issue.message}`);
    if (issue.excerpt) console.log(`  ${issue.excerpt}`);
  }
  console.log("No files were rewritten.");
  process.exitCode = 1;
}
