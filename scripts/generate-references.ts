/**
 * Generate plain-markdown skill references from the ZenStack docs submodule.
 *
 * Input : docs/docs/**\/*.{md,mdx}   (only this tree — not versioned_docs, blog, etc.)
 * Output: references/**\/*.md         (same structure, .mdx -> .md)
 *
 * Transforms applied:
 *  - Strips Docusaurus/MDX scaffolding (imports/exports, {/* comments *\/}).
 *  - Keeps a slim frontmatter (only `title` and `description`).
 *  - Converts Docusaurus admonitions (:::info/tip/warning/danger/...) to callouts.
 *  - Converts known MDX components (PackageInstall/Exec/Dlx/Uninstall, AvailableSince,
 *    PreviewFeature, ExperimentalFeature, ZModelVsPSL, ZenStackVsPrisma, Tabs/TabItem).
 *  - Inlines imported markdown partials (with `{props.*}` / `{children}` substitution).
 *  - Special-cases <StackBlitzGithub>: inlines code from docs/code-repos as fenced blocks.
 *      Files inlined come from the `openFile` attribute; when absent, defaults to
 *      `zenstack/schema.zmodel` and `main.ts` (only if present in the repo).
 *
 * Run: npx tsx scripts/generate-references.ts   (or: npm run generate:references)
 */
import {
    readFileSync,
    writeFileSync,
    mkdirSync,
    readdirSync,
    statSync,
    existsSync,
    rmSync,
} from 'node:fs';
import { join, dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DOCS_SUBMODULE = join(REPO_ROOT, 'docs');
const INPUT_DIR = join(DOCS_SUBMODULE, 'docs');
const CODE_REPOS = join(DOCS_SUBMODULE, 'code-repos');
const OUTPUT_DIR = join(REPO_ROOT, 'references');

const warnings: string[] = [];
const warn = (msg: string) => warnings.push(msg);

// ---------------------------------------------------------------------------
// Generic helpers
// ---------------------------------------------------------------------------

const PH_OPEN = '';
const PH_CLOSE = '';

/** A bag of protected (verbatim) fragments referenced by placeholder tokens. */
class Protector {
    private store: string[] = [];
    protect(text: string): string {
        const idx = this.store.push(text) - 1;
        return `${PH_OPEN}${idx}${PH_CLOSE}`;
    }
    restore(text: string): string {
        return text.replace(new RegExp(`${PH_OPEN}(\\d+)${PH_CLOSE}`, 'g'), (_, n) => this.store[Number(n)]);
    }
}

const langForFile = (file: string): string => {
    if (file.endsWith('.tsx')) return 'tsx';
    if (file.endsWith('.ts')) return 'typescript';
    if (file.endsWith('.zmodel')) return 'zmodel';
    if (file.endsWith('.prisma')) return 'prisma';
    if (file.endsWith('.json')) return 'json';
    if (file.endsWith('.js') || file.endsWith('.mjs')) return 'javascript';
    if (file.endsWith('.css')) return 'css';
    if (file.endsWith('.sh')) return 'bash';
    return '';
};

// ---------------------------------------------------------------------------
// JSX tag scanning (quote/brace aware)
// ---------------------------------------------------------------------------

interface Attr {
    kind: 'string' | 'expr' | 'bool';
    value: string;
}
type Attrs = Record<string, Attr>;

interface ScannedTag {
    name: string;
    attrs: Attrs;
    selfClose: boolean;
    end: number; // index just past the closing '>'
}

/** Scan a tag starting at text[start] === '<'. Returns null if not a tag. */
function scanTag(text: string, start: number): ScannedTag | null {
    if (text[start] !== '<') return null;
    const nameMatch = /^<([A-Za-z][\w]*)/.exec(text.slice(start));
    if (!nameMatch) return null;
    const name = nameMatch[1];
    let i = start + nameMatch[0].length;
    let quote: string | null = null;
    let brace = 0;
    for (; i < text.length; i++) {
        const c = text[i];
        if (quote) {
            if (c === quote) quote = null;
            continue;
        }
        if (c === '"' || c === "'") {
            quote = c;
            continue;
        }
        if (c === '{') {
            brace++;
            continue;
        }
        if (c === '}') {
            brace--;
            continue;
        }
        if (c === '>' && brace === 0) {
            const inner = text.slice(start + 1 + name.length, i);
            const selfClose = inner.trimEnd().endsWith('/');
            const attrsRaw = selfClose ? inner.trimEnd().slice(0, -1) : inner;
            return { name, attrs: parseAttrs(attrsRaw), selfClose, end: i + 1 };
        }
    }
    return null;
}

/** Parse the attribute section of a tag (quote/brace aware). */
function parseAttrs(raw: string): Attrs {
    const attrs: Attrs = {};
    let i = 0;
    const n = raw.length;
    const isWs = (c: string) => c === ' ' || c === '\t' || c === '\n' || c === '\r';
    while (i < n) {
        while (i < n && isWs(raw[i])) i++;
        if (i >= n) break;
        const nameStart = i;
        while (i < n && /[\w-]/.test(raw[i])) i++;
        const name = raw.slice(nameStart, i);
        if (!name) {
            i++;
            continue;
        }
        while (i < n && isWs(raw[i])) i++;
        if (raw[i] !== '=') {
            attrs[name] = { kind: 'bool', value: 'true' };
            continue;
        }
        i++; // skip '='
        while (i < n && isWs(raw[i])) i++;
        const c = raw[i];
        if (c === '"' || c === "'") {
            const q = c;
            i++;
            const vStart = i;
            while (i < n && raw[i] !== q) i++;
            attrs[name] = { kind: 'string', value: raw.slice(vStart, i) };
            i++; // closing quote
        } else if (c === '{') {
            let depth = 0;
            const vStart = i + 1;
            for (; i < n; i++) {
                if (raw[i] === '{') depth++;
                else if (raw[i] === '}') {
                    depth--;
                    if (depth === 0) break;
                }
            }
            attrs[name] = { kind: 'expr', value: raw.slice(vStart, i) };
            i++; // closing brace
        } else {
            const vStart = i;
            while (i < n && !isWs(raw[i])) i++;
            attrs[name] = { kind: 'expr', value: raw.slice(vStart, i) };
        }
    }
    return attrs;
}

/** Find the matching closing tag for a paired component, honoring nesting. */
function findClose(text: string, name: string, from: number): { contentEnd: number; end: number } | null {
    let depth = 1;
    let i = from;
    while (i < text.length) {
        const lt = text.indexOf('<', i);
        if (lt < 0) return null;
        if (text.startsWith(`</${name}`, lt)) {
            const gt = text.indexOf('>', lt);
            if (gt < 0) return null;
            depth--;
            if (depth === 0) return { contentEnd: lt, end: gt + 1 };
            i = gt + 1;
            continue;
        }
        if (text.startsWith(`<${name}`, lt) && /[\s/>]/.test(text[lt + 1 + name.length] ?? '')) {
            const t = scanTag(text, lt);
            if (t) {
                if (!t.selfClose) depth++;
                i = t.end;
                continue;
            }
        }
        i = lt + 1;
    }
    return null;
}

type Renderer = (attrs: Attrs, children: string) => string;

/** Replace every occurrence of a component (self-closing and/or paired). */
function replaceComponent(text: string, name: string, render: Renderer): string {
    let out = '';
    let i = 0;
    while (i < text.length) {
        const lt = text.indexOf(`<${name}`, i);
        if (lt < 0) {
            out += text.slice(i);
            break;
        }
        // ensure it's a real tag boundary (next char ends the name)
        const after = text[lt + 1 + name.length];
        if (after !== undefined && /[\w-]/.test(after)) {
            out += text.slice(i, lt + 1);
            i = lt + 1;
            continue;
        }
        const tag = scanTag(text, lt);
        if (!tag) {
            out += text.slice(i, lt + 1);
            i = lt + 1;
            continue;
        }
        out += text.slice(i, lt);
        if (tag.selfClose) {
            out += render(tag.attrs, '');
            i = tag.end;
        } else {
            const close = findClose(text, name, tag.end);
            if (!close) {
                // unbalanced — drop the open tag, keep going
                i = tag.end;
                continue;
            }
            const children = text.slice(tag.end, close.contentEnd);
            out += render(tag.attrs, children);
            i = close.end;
        }
    }
    return out;
}

// ---------------------------------------------------------------------------
// Attribute value helpers
// ---------------------------------------------------------------------------

const unquote = (s: string): string => {
    const t = s.trim();
    if ((t.startsWith("'") && t.endsWith("'")) || (t.startsWith('"') && t.endsWith('"'))) {
        return t.slice(1, -1);
    }
    return t;
};

const attrStr = (attrs: Attrs, name: string): string | undefined => {
    const a = attrs[name];
    if (!a) return undefined;
    return a.kind === 'string' ? a.value : unquote(a.value);
};

const attrList = (attrs: Attrs, name: string): string[] => {
    const a = attrs[name];
    if (!a) return [];
    if (a.kind === 'string') {
        return a.value
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
    }
    const v = a.value.trim();
    if (v.startsWith('[')) {
        return [...v.matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1]);
    }
    return unquote(v)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
};

// ---------------------------------------------------------------------------
// Component renderers
// ---------------------------------------------------------------------------

const codeBlock = (lang: string, body: string, title?: string): string => {
    const head = title ? `**\`${title}\`**\n\n` : '';
    return `${head}\`\`\`${lang}\n${body.replace(/\n+$/, '')}\n\`\`\`\n`;
};

function renderStackBlitz(attrs: Attrs, protector: Protector): string {
    const repoPath = attrStr(attrs, 'repoPath');
    if (!repoPath) return '';
    let files = attrList(attrs, 'openFile');
    if (files.length === 0) {
        files = ['zenstack/schema.zmodel', 'main.ts'].filter((f) =>
            existsSync(join(CODE_REPOS, repoPath, f))
        );
    }
    const blocks: string[] = [];
    for (const file of files) {
        const full = join(CODE_REPOS, repoPath, file);
        if (!existsSync(full)) {
            warn(`StackBlitz: missing ${repoPath}/${file}`);
            blocks.push(`> _(code file \`${file}\` not found in code-repos/${repoPath})_\n`);
            continue;
        }
        const body = readFileSync(full, 'utf8');
        blocks.push(codeBlock(langForFile(file), body, file));
    }
    return protector.protect('\n' + blocks.join('\n') + '\n');
}

const renderPackageInstall: Renderer = (attrs) => {
    const deps = attrList(attrs, 'dependencies');
    const dev = attrList(attrs, 'devDependencies');
    const lines: string[] = [];
    if (deps.length) lines.push(`npm install ${deps.join(' ')}`);
    if (dev.length) lines.push(`npm install --save-dev ${dev.join(' ')}`);
    return codeBlock('bash', lines.join('\n'));
};

const renderPackageUninstall: Renderer = (attrs) => {
    const deps = attrList(attrs, 'dependencies');
    return codeBlock('bash', `npm uninstall ${deps.join(' ')}`);
};

const renderPackageExec: Renderer = (attrs) => codeBlock('bash', `npx ${attrStr(attrs, 'command') ?? ''}`);

const renderPackageDlx: Renderer = (attrs) => {
    const pkg = attrStr(attrs, 'package') ?? '';
    const args = attrStr(attrs, 'args') ?? '';
    return codeBlock('bash', `npx ${pkg}${args ? ` ${args}` : ''}`.trim());
};

const renderAvailableSince: Renderer = (attrs) => {
    const v = attrStr(attrs, 'version') ?? '';
    return `> **Available since ${v}**\n`;
};

const callout = (title: string, body: string): string => `> **${title}**\n\n${body.trim()}\n`;

const renderPreviewFeature: Renderer = (attrs, children) =>
    callout(
        'Preview Feature',
        `${attrStr(attrs, 'name') ?? 'This feature'} is in preview and may be subject to breaking changes in future releases.\n${children}`
    );

const renderExperimentalFeature: Renderer = (attrs, children) =>
    callout(
        'Experimental Feature',
        `${attrStr(attrs, 'name') ?? 'This feature'} is experimental and should be used with caution.\n${children}`
    );

const renderZModelVsPSL: Renderer = (_attrs, children) => callout('🔋 ZModel vs Prisma Schema', children);
const renderZenStackVsPrisma: Renderer = (_attrs, children) => callout('🔋 ZenStack vs Prisma', children);

const renderTabItem: Renderer = (attrs, children) => {
    const label = attrStr(attrs, 'label') ?? attrStr(attrs, 'value') ?? '';
    return `\n**${label}**\n\n${children.trim()}\n`;
};

// ---------------------------------------------------------------------------
// Admonitions  (:::type [title] ... :::)
// ---------------------------------------------------------------------------

const ADMONITION_TITLES: Record<string, string> = {
    info: 'Info',
    tip: 'Tip',
    note: 'Note',
    warning: 'Warning',
    danger: 'Danger',
    caution: 'Caution',
};

function convertAdmonitions(text: string): string {
    return text.replace(
        /^([ \t]*):::(\w+)([^\n]*)\n([\s\S]*?)\n[ \t]*:::[ \t]*$/gm,
        (_m, indent: string, type: string, rest: string, body: string) => {
            const title = rest.trim() || ADMONITION_TITLES[type] || type;
            // dedent body by the marker's indentation, then re-apply it so a
            // callout nested in a list item stays within that item
            const inner = body
                .split('\n')
                .map((l) => (l.startsWith(indent) ? l.slice(indent.length) : l))
                .join('\n');
            return callout(title, inner)
                .split('\n')
                .map((l) => (l ? indent + l : l))
                .join('\n');
        }
    );
}

// ---------------------------------------------------------------------------
// Frontmatter
// ---------------------------------------------------------------------------

function splitFrontmatter(text: string): { fm: string | null; body: string } {
    if (!text.startsWith('---\n')) return { fm: null, body: text };
    const end = text.indexOf('\n---', 4);
    if (end < 0) return { fm: null, body: text };
    const fm = text.slice(4, end);
    let body = text.slice(end + 4);
    if (body.startsWith('\n')) body = body.slice(1);
    return { fm, body };
}

function slimFrontmatter(fm: string): string {
    const kept = fm
        .split('\n')
        .filter((l) => /^(title|description):/.test(l));
    return kept.length ? `---\n${kept.join('\n')}\n---\n\n` : '';
}

// ---------------------------------------------------------------------------
// Import handling (partials)
// ---------------------------------------------------------------------------

interface PartialImport {
    path: string; // absolute path to the partial file
}

function collectPartialImports(text: string, fileDir: string): Record<string, PartialImport> {
    const map: Record<string, PartialImport> = {};
    for (const m of text.matchAll(/^import\s+(\w+)\s+from\s+['"](.+?)['"];?\s*$/gm)) {
        const [, local, src] = m;
        if (src.endsWith('.md') || src.endsWith('.mdx')) {
            map[local] = { path: resolve(fileDir, src) };
        }
    }
    return map;
}

/** Substitute {props.x}, {'literal'}, {"literal"}, and {children} in a partial. */
function substituteProps(text: string, attrs: Attrs, children: string): string {
    let out = text.replace(/\{props\.(\w+)\}/g, (_m, name) => attrStr(attrs, name) ?? '');
    out = out.replace(/\{children\}/g, children);
    out = out.replace(/\{(['"])([\s\S]*?)\1\}/g, (_m, _q, lit) => lit);
    return out;
}

// ---------------------------------------------------------------------------
// Core conversion
// ---------------------------------------------------------------------------

function convert(rawBody: string, fileDir: string): string {
    const protector = new Protector();
    let text = rawBody;

    // 1. protect fenced code blocks then inline code FIRST, so later cleanups
    //    (import/export stripping, comment removal, component scanning) never
    //    touch anything inside code.
    text = text.replace(/(^|\n)(```|~~~)[^\n]*\n[\s\S]*?\n\2[ \t]*(?=\n|$)/g, (m) => '\n' + protector.protect(m.replace(/^\n/, '')));
    text = text.replace(/`[^`\n]*`/g, (m) => protector.protect(m));

    // 2. partial imports map, then strip all (MDX) import/export lines
    const partials = collectPartialImports(text, fileDir);
    text = text.replace(/^import\s+.*$/gm, '');
    text = text.replace(/^export\s+.*$/gm, '');

    // 3. MDX comments
    text = text.replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

    // 4. StackBlitz (special: inlines code, protect output)
    text = replaceComponent(text, 'StackBlitzGithub', (attrs) => renderStackBlitz(attrs, protector));

    // 5. package-manager components (protect their code output)
    text = replaceComponent(text, 'PackageInstall', (a) => protector.protect(renderPackageInstall(a)));
    text = replaceComponent(text, 'PackageUninstall', (a) => protector.protect(renderPackageUninstall(a)));
    text = replaceComponent(text, 'PackageExec', (a) => protector.protect(renderPackageExec(a)));
    text = replaceComponent(text, 'PackageDlx', (a) => protector.protect(renderPackageDlx(a)));

    // 6. simple components
    text = replaceComponent(text, 'AvailableSince', renderAvailableSince);
    text = replaceComponent(text, 'PreviewFeature', renderPreviewFeature);
    text = replaceComponent(text, 'ExperimentalFeature', renderExperimentalFeature);
    text = replaceComponent(text, 'ZModelVsPSL', renderZModelVsPSL);
    text = replaceComponent(text, 'ZenStackVsPrisma', renderZenStackVsPrisma);

    // 7. imported markdown partials (inline, recursively converted)
    for (const [local, info] of Object.entries(partials)) {
        text = replaceComponent(text, local, (attrs, children) => {
            if (!existsSync(info.path)) {
                warn(`Partial not found: ${info.path}`);
                return '';
            }
            const partialRaw = readFileSync(info.path, 'utf8');
            const { body } = splitFrontmatter(partialRaw);
            const substituted = substituteProps(body, attrs, children);
            const converted = convert(substituted, dirname(info.path));
            return protector.protect('\n' + converted.trim() + '\n');
        });
    }

    // 8. tabs
    text = replaceComponent(text, 'TabItem', renderTabItem);
    text = text.replace(/<Tabs\b[^>]*>/g, '').replace(/<\/Tabs>/g, '');

    // 9. admonitions
    text = convertAdmonitions(text);

    // 10. restore protected fragments
    text = protector.restore(text);

    // 11. collapse excess blank lines
    text = text.replace(/\n{3,}/g, '\n\n').replace(/[ \t]+$/gm, '');
    return text.trim() + '\n';
}

// ---------------------------------------------------------------------------
// File walking
// ---------------------------------------------------------------------------

function walk(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
            if (entry === '_components') continue; // component sources, never emitted
            out.push(...walk(full));
        } else if (/\.mdx?$/.test(entry)) {
            out.push(full);
        }
    }
    return out;
}

function main() {
    if (!existsSync(INPUT_DIR)) {
        console.error(`Input not found: ${INPUT_DIR}\nDid you init the docs submodule? (git submodule update --init)`);
        process.exit(1);
    }
    if (existsSync(OUTPUT_DIR)) rmSync(OUTPUT_DIR, { recursive: true, force: true });

    const files = walk(INPUT_DIR).sort();
    let written = 0;
    let skipped = 0;
    for (const file of files) {
        const base = file.split('/').pop()!;
        if (base.startsWith('_')) {
            skipped++; // partial — inlined elsewhere, not emitted standalone
            continue;
        }
        const raw = readFileSync(file, 'utf8');
        const { fm, body } = splitFrontmatter(raw);
        const converted = convert(body, dirname(file));
        const slim = fm ? slimFrontmatter(fm) : '';
        const rel = relative(INPUT_DIR, file).replace(/\.mdx$/, '.md');
        const dest = join(OUTPUT_DIR, rel);
        mkdirSync(dirname(dest), { recursive: true });
        writeFileSync(dest, slim + converted);
        written++;
    }

    console.log(`Generated ${written} reference file(s) into ${relative(REPO_ROOT, OUTPUT_DIR)}/ (${skipped} partial(s) inlined).`);
    if (warnings.length) {
        console.log(`\n${warnings.length} warning(s):`);
        for (const w of [...new Set(warnings)]) console.log(`  - ${w}`);
    }
}

main();
