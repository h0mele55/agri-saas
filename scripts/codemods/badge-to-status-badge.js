#!/usr/bin/env node
/**
 * PR-2 codemod — migrate legacy `<span className="badge badge-{variant}">`
 * sites to the canonical `<StatusBadge variant>` primitive, and refactor
 * mapping consts that hold `'badge-X'` strings to hold the variant name
 * directly (`'X'`, with `danger` → `error` per the StatusBadge variant
 * naming).
 *
 *   node scripts/codemods/badge-to-status-badge.js          # apply
 *   node scripts/codemods/badge-to-status-badge.js --dry    # report only
 *
 * Class → variant mapping:
 *   badge-success  → success
 *   badge-warning  → warning
 *   badge-danger   → error    (legacy CSS used 'danger', StatusBadge uses 'error')
 *   badge-error    → error
 *   badge-info     → info
 *   badge-neutral  → neutral
 *
 * Sizes:
 *   badge-xs       → size="sm"
 *   text-[10px]    → size="sm" (when present alongside badge classes)
 *   text-xs        → no size prop (default md is text-xs)
 *
 * What this codemod handles:
 *   1) Refactor mapping consts of shape
 *      `const X_BADGE: Record<string, string> = { K: 'badge-V', ... };`
 *      to map to variant strings (`{ K: 'V_mapped', ... }`) and rename
 *      the type to `StatusBadgeVariantName | string`.
 *   2) Static spans: `<span className="badge badge-V [extras]">CHILDREN</span>`
 *      → `<StatusBadge variant="V_mapped" [size?]>CHILDREN</StatusBadge>`
 *   3) Conditional ternary spans:
 *      `<span className={`badge ${COND ? 'badge-V1' : 'badge-V2'}`}>CHILDREN</span>`
 *      → `<StatusBadge variant={COND ? 'V1_mapped' : 'V2_mapped'}>CHILDREN</StatusBadge>`
 *   4) Mapping-indirected spans:
 *      `<span className={`badge ${MAP[k] || 'badge-default'}`}>CHILDREN</span>`
 *      → `<StatusBadge variant={MAP[k] || 'default_mapped'}>CHILDREN</StatusBadge>`
 *   5) Adds `import { StatusBadge } from '@/components/ui/status-badge';`
 *      to any file that gained a `<StatusBadge>` reference and didn't
 *      already import it.
 *
 * What this codemod does NOT handle (manual sweep required):
 *   - Multi-line `<span>` elements split across lines
 *   - Complex className composition with concat / cn() helpers
 *   - Spans with Tailwind utilities mixed in beyond the size hints above
 *     (the extras are preserved via a `className` prop on the StatusBadge)
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../..");
const TARGETS = ["src/app", "src/components"];
const EXCLUDE_DIR_NAMES = new Set([
  "node_modules",
  "__tests__",
  "__mocks__",
]);
const EXCLUDE_FILE_PATTERNS = [
  /\.test\.tsx?$/,
  /\.spec\.tsx?$/,
  /\.stories\.tsx?$/,
  /globals\.css$/,
];

// Files where `badge` appears as a property name (e.g. `config.badge`,
// `row.badge`, `rs.badge`) holding a className string rather than a
// StatusBadge variant. These need manual review — the codemod can't tell
// whether the property holds a class string ("badge-success") or a
// already-variant string ("success"), and substituting blindly would
// produce broken `<StatusBadge variant="badge-success">` calls.
const SKIP_PROPERTY_BADGE_FILES = new Set([
  // Files where `${...badge...}` is a property accessor (config.badge,
  // row.badge, rs.badge), not a CSS-class interpolation.
  "src/components/ui/ExpiryCalendar.tsx",                                    // PR-1 exempt: raw-color gradient stays
  "src/app/t/[tenantSlug]/(app)/controls/ControlDetailSheet.tsx",             // row.badge holds className
  "src/app/t/[tenantSlug]/(app)/evidence/EvidenceClient.tsx",                 // rs.badge holds className
  "src/components/ui/EvidenceGallery.tsx",                                   // similar pattern
  // Files that already define a local `StatusBadge` symbol — adding the
  // import would clash; these need hand-migration.
  "src/app/t/[tenantSlug]/(app)/admin/sso/page.tsx",                          // local StatusBadge wrapper
  "src/app/org/[orgSlug]/(app)/controls/ControlsTable.tsx",                   // local StatusBadge
  "src/app/t/[tenantSlug]/(app)/reports/soa/SoAClient.tsx",                   // local StatusBadge
]);

const DRY = process.argv.includes("--dry");

const CLASS_TO_VARIANT = {
  "badge-success": "success",
  "badge-warning": "warning",
  "badge-danger": "error",
  "badge-error": "error",
  "badge-info": "info",
  "badge-neutral": "neutral",
};

function variantFor(badgeClass) {
  return CLASS_TO_VARIANT[badgeClass] || null;
}

// ── Stage 1: refactor mapping consts ─────────────────────────────────
//
// const X_BADGE: Record<string, string> = { K: 'badge-V', K2: 'badge-V2' };
// const X_BADGE: Record<string, string> = {
//   K: 'badge-V', K2: 'badge-V2',
// };
//
// Transform: replace each `'badge-V'` literal in the object body with
// the variant name. Type stays `Record<string, string>` for now (the
// concrete variant union would need a typed StatusBadgeVariant import).

function transformBadgeConsts(content) {
  let count = 0;
  // Match `const X_BADGE: Record<string, string> = { ... };` blocks
  // (single or multi-line, non-greedy on the object body up to the
  // first `}`). Retype to `Record<string, StatusBadgeVariant>` so the
  // mapped values match the component's variant prop without each call
  // site needing an explicit cast.
  const re =
    /const\s+(\w+_BADGE)\s*:\s*Record<\s*string\s*,\s*string\s*>\s*=\s*\{([^}]*)\}/g;
  content = content.replace(re, (_m, name, body) => {
    const newBody = body.replace(
      /'badge-(success|warning|danger|error|info|neutral)'/g,
      (_match, v) => {
        count++;
        const mapped = v === "danger" ? "error" : v;
        return `'${mapped}'`;
      },
    );
    return `const ${name}: Record<string, StatusBadgeVariant> = {${newBody}}`;
  });
  return { content, count };
}

// ── Stage 2: simple static spans ─────────────────────────────────────
//
// <span className="badge badge-V">CHILDREN</span>
// <span className="badge badge-xs badge-V">CHILDREN</span>
// <span className="badge badge-V text-xs">CHILDREN</span>
// <span className="badge badge-V text-[10px]">CHILDREN</span>
// + optional id="..." / data-testid / etc. attributes
//
// We only match spans with `<span` on a single line and `</span>` on
// the same content block (no nested children with </span>). This covers
// the vast majority; nested cases get caught by the manual sweep.

function transformStaticSpans(content) {
  let count = 0;
  // Single-line span with static className. Capture optional attrs and
  // content. Note: this regex requires the span element to be on a
  // single source line (multi-line spans handled in stage 3 manual sweep).
  const re =
    /<span\s+([^>]*?)className="([^"]*?\bbadge\b[^"]*?)"([^>]*?)>([\s\S]*?)<\/span>/g;
  content = content.replace(re, (match, beforeAttrs, className, afterAttrs, children) => {
    // Must contain at least one `badge-V` token
    const variantMatch = className.match(/\bbadge-(success|warning|danger|error|info|neutral)\b/);
    if (!variantMatch) return match;
    const variantClass = `badge-${variantMatch[1]}`;
    const variant = variantFor(variantClass);
    if (!variant) return match;
    // Determine size
    const isSm = /\bbadge-xs\b/.test(className) || /\btext-\[10px\]\b/.test(className);
    // Strip the badge-related classes; preserve everything else
    // ORDER MATTERS — `\bbadge\b` matches inside `badge-info`
    // (because `-` is a word boundary), so longer patterns must
    // be stripped FIRST.
    const remainingClasses = className
      .replace(/\bbadge-(success|warning|danger|error|info|neutral)\b/g, "")
      .replace(/\bbadge-xs\b/g, "")
      .replace(/\bbadge\b/g, "")
      .replace(/\btext-xs\b/g, "")
      .replace(/\btext-\[10px\]\b/g, "")
      .split(/\s+/)
      .filter((c) => c.length > 0)
      .join(" ");
    count++;
    const sizeProp = isSm ? ' size="sm"' : "";
    const classNameProp = remainingClasses
      ? ` className="${remainingClasses}"`
      : "";
    const otherAttrs = (beforeAttrs.trim() + " " + afterAttrs.trim()).trim();
    const otherAttrsStr = otherAttrs ? ` ${otherAttrs}` : "";
    return `<StatusBadge variant="${variant}"${sizeProp}${classNameProp}${otherAttrsStr}>${children}</StatusBadge>`;
  });
  return { content, count };
}

// ── Stage 3: conditional / template literal spans ────────────────────
//
// <span className={`badge ${COND ? 'badge-V1' : 'badge-V2'}`}>X</span>
// <span className={`badge ${COND ? 'badge-V1' : 'badge-V2'} text-xs`}>X</span>
// <span className={`badge ${MAP[key] || 'badge-default'} text-xs`}>X</span>
// <span className={`badge badge-xs ${COND ? 'badge-V1' : 'badge-V2'}`}>X</span>
//
// Strategy: match the template-literal class string, extract the dynamic
// expression, rewrite the badge-X literals inside it to variant names,
// and emit the StatusBadge with `variant={<expr>}`.

function transformTemplateSpans(content) {
  let count = 0;
  // Match <span className={`...`}>...</span> on a single line where the
  // template contains the literal `badge` and some badge-V token.
  const re =
    /<span\s+className=\{`([^`]*?\bbadge\b[^`]*?)`\}([^>]*?)>([\s\S]*?)<\/span>/g;
  content = content.replace(re, (match, classExpr, afterAttrs, children) => {
    // The outer regex requires a literal `badge` token, but the match
    // could be inside an interpolation like `${config.badge}` — where
    // `badge` is a property accessor, not a CSS class. Walk the
    // expression, splitting into static and dynamic segments, to make
    // a safe transformation.
    //
    // Strategy:
    //   1. Split classExpr into segments: static text vs `${...}`.
    //   2. Look for the literal `badge` class token in STATIC segments
    //      only. If absent, return match (don't transform — the
    //      `badge` matched by the outer regex was inside an interpolation).
    //   3. Within static segments, also look for badge-V literals.
    //   4. The variant expression is the FIRST `${...}` interpolation,
    //      with `'badge-V'` string literals inside it remapped to
    //      `'V_mapped'`.
    // Split into segments: static text and ${...} interpolations.
    // Each segment is { kind: "static" | "interp", text: "..." }.
    const segments = [];
    let pos = 0;
    while (pos < classExpr.length) {
      const interpStart = classExpr.indexOf("${", pos);
      if (interpStart === -1) {
        segments.push({ kind: "static", text: classExpr.slice(pos) });
        break;
      }
      if (interpStart > pos) {
        segments.push({ kind: "static", text: classExpr.slice(pos, interpStart) });
      }
      const interpEnd = classExpr.indexOf("}", interpStart);
      if (interpEnd === -1) {
        // Malformed — skip transformation
        return match;
      }
      segments.push({
        kind: "interp",
        text: classExpr.slice(interpStart + 2, interpEnd),
      });
      pos = interpEnd + 1;
    }
    // Verify the literal `badge` class token actually appears in a
    // STATIC segment (not just inside ${config.badge}-style accessor).
    const staticHasBadge = segments
      .filter((s) => s.kind === "static")
      .some((s) => /\bbadge\b/.test(s.text));
    if (!staticHasBadge) return match;

    // Determine size="sm" from static parts only.
    const staticText = segments
      .filter((s) => s.kind === "static")
      .map((s) => s.text)
      .join(" ");
    const isSm = /\bbadge-xs\b/.test(staticText) || /\btext-\[10px\]\b/.test(staticText);

    // Strip badge / size tokens from STATIC segments only.
    // ORDER MATTERS — see comment in transformStaticSpans.
    const cleanedStatic = segments
      .filter((s) => s.kind === "static")
      .map((s) =>
        s.text
          .replace(/\bbadge-(success|warning|danger|error|info|neutral)\b/g, "")
          .replace(/\bbadge-xs\b/g, "")
          .replace(/\bbadge\b/g, "")
          .replace(/\btext-xs\b/g, "")
          .replace(/\btext-\[10px\]\b/g, ""),
      )
      .join(" ")
      .split(/\s+/)
      .filter((c) => c.length > 0)
      .join(" ");
    const remainingStatic = cleanedStatic;

    // Find the FIRST interpolation to use as the variant expression.
    const firstInterp = segments.find((s) => s.kind === "interp");
    if (!firstInterp) {
      // All-static (no dynamic variant). Look for a literal `badge-V`
      // in the static text and transform.
      const literalMatch = staticText.match(/\bbadge-(success|warning|danger|error|info|neutral)\b/);
      if (!literalMatch) return match;
      const v = literalMatch[1];
      const mapped = v === "danger" ? "error" : v;
      count++;
      const sizeProp = isSm ? ' size="sm"' : "";
      const classNameProp = remainingStatic
        ? ` className="${remainingStatic}"`
        : "";
      const otherAttrs = afterAttrs.trim();
      const otherAttrsStr = otherAttrs ? ` ${otherAttrs}` : "";
      return `<StatusBadge variant="${mapped}"${sizeProp}${classNameProp}${otherAttrsStr}>${children}</StatusBadge>`;
    }

    // Remap `'badge-V'` literals inside the interpolation to `'V'`.
    const variantInner = firstInterp.text
      .replace(/'badge-(success|warning|danger|error|info|neutral)'/g, (_m, v) =>
        `'${v === "danger" ? "error" : v}'`,
      )
      .trim();
    count++;
    const sizeProp = isSm ? ' size="sm"' : "";
    const classNameProp = remainingStatic
      ? ` className="${remainingStatic}"`
      : "";
    const otherAttrs = afterAttrs.trim();
    const otherAttrsStr = otherAttrs ? ` ${otherAttrs}` : "";
    return `<StatusBadge variant={${variantInner}}${sizeProp}${classNameProp}${otherAttrsStr}>${children}</StatusBadge>`;
  });
  return { content, count };
}

// ── Stage 4: ensure StatusBadge import ───────────────────────────────

function ensureStatusBadgeImport(content) {
  const needsComponent = /<StatusBadge\b/.test(content);
  const needsType = /\bStatusBadgeVariant\b/.test(content);
  if (!needsComponent && !needsType) return { content, added: false };
  // If the file already imports something from status-badge, augment
  // that import rather than adding a duplicate line.
  const existingImportRe =
    /import\s+(?:type\s+)?(?:\{([^}]*)\}|(\w+))\s+from\s+['"]@\/components\/ui\/status-badge['"]\s*;?/;
  const existingMatch = content.match(existingImportRe);
  if (existingMatch) {
    const existingNames = (existingMatch[1] || existingMatch[2] || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const required = [];
    if (needsComponent && !existingNames.includes("StatusBadge"))
      required.push("StatusBadge");
    if (needsType && !existingNames.includes("StatusBadgeVariant"))
      required.push("type StatusBadgeVariant");
    if (required.length === 0) return { content, added: false };
    const merged = [
      ...existingNames.filter((n) => n !== "type StatusBadgeVariant"),
      ...required,
    ].join(", ");
    return {
      content: content.replace(
        existingImportRe,
        `import { ${merged} } from '@/components/ui/status-badge';`,
      ),
      added: true,
    };
  }
  const parts = [];
  if (needsComponent) parts.push("StatusBadge");
  if (needsType) parts.push("type StatusBadgeVariant");
  const importLine = `import { ${parts.join(", ")} } from '@/components/ui/status-badge';\n`;
  // Find the position right after the LAST top-of-file import statement.
  // Multi-line imports (`import { a,\n b\n} from '...';`) have to be
  // walked line-by-line because a simple regex over a single line
  // misses them and inserts inside the import body. Strategy: scan
  // lines from the top; track when we're inside a multi-line import
  // (open `{` without close); the insertion point is the line AFTER
  // the last import-line we saw at depth 0 still in the import block.
  const lines = content.split("\n");
  let lastImportEnd = -1;
  let depth = 0;
  let inImportBlock = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (depth === 0) {
      if (trimmed.startsWith("import ") || trimmed.startsWith("import{")) {
        inImportBlock = true;
      } else if (trimmed.startsWith("'use ") || trimmed.startsWith('"use ')) {
        // directive — keep scanning
      } else if (trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*") || trimmed === "") {
        // comment / blank — keep scanning
      } else if (inImportBlock) {
        // First non-import line after the import block — insertion point
        break;
      }
    }
    if (inImportBlock) {
      // Track open / close braces to know when a multi-line import ends.
      for (const ch of line) {
        if (ch === "{") depth++;
        else if (ch === "}") depth--;
      }
      // A line that ends with `;` at depth 0 and contained `from ` closes
      // an import statement.
      if (depth === 0 && /;\s*$/.test(trimmed)) {
        lastImportEnd = i;
      }
    }
  }
  if (lastImportEnd >= 0) {
    lines.splice(lastImportEnd + 1, 0, importLine.trimEnd());
    return { content: lines.join("\n"), added: true };
  }
  // No imports found — prepend (after a leading `'use client'` directive
  // if present).
  if (lines[0] && /^['"]use\s+\w+['"]\s*;?\s*$/.test(lines[0].trim())) {
    lines.splice(1, 0, importLine.trimEnd());
  } else {
    lines.unshift(importLine.trimEnd());
  }
  return { content: lines.join("\n"), added: true };
}

function isExcluded(absPath) {
  const rel = path.relative(ROOT, absPath);
  const segments = rel.split(path.sep);
  if (segments.some((s) => EXCLUDE_DIR_NAMES.has(s))) return true;
  if (EXCLUDE_FILE_PATTERNS.some((rx) => rx.test(rel))) return true;
  if (SKIP_PROPERTY_BADGE_FILES.has(rel)) return true;
  return false;
}

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (isExcluded(full)) continue;
    if (entry.isDirectory()) walk(full, files);
    else if (/\.(tsx|ts)$/.test(entry.name)) files.push(full);
  }
  return files;
}

function main() {
  const files = TARGETS.flatMap((t) => walk(path.join(ROOT, t)));
  let totalFiles = 0;
  let totalReplacements = 0;
  let importsAdded = 0;
  for (const file of files) {
    const before = fs.readFileSync(file, "utf8");
    let working = before;
    let changed = 0;

    const c1 = transformBadgeConsts(working);
    working = c1.content;
    changed += c1.count;

    const c2 = transformStaticSpans(working);
    working = c2.content;
    changed += c2.count;

    const c3 = transformTemplateSpans(working);
    working = c3.content;
    changed += c3.count;

    if (changed > 0) {
      const c4 = ensureStatusBadgeImport(working);
      working = c4.content;
      if (c4.added) importsAdded++;
    }

    if (changed > 0 && working !== before) {
      totalFiles++;
      totalReplacements += changed;
      if (!DRY) fs.writeFileSync(file, working);
      const rel = path.relative(ROOT, file);
      console.log(`${changed.toString().padStart(4)}  ${rel}`);
    }
  }
  console.log(
    `\n${DRY ? "[dry-run]" : "[applied]"} ${totalReplacements} replacement(s) across ${totalFiles} file(s); ${importsAdded} import(s) added.`,
  );
}

main();
