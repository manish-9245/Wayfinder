/* Zero-dependency syntax highlighter for docs code fences.
   Single-pass alternation per language; patterns use (?:...) only so match
   groups stay positional. Unknown languages return escaped plain text. */

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

type Rule = { re: string; cls: string };

const STR = `"(?:[^"\\\\\\n]|\\\\.)*"|'(?:[^'\\\\\\n]|\\\\.)*'`;
const COMMENT_LINE = (ch: string) => `${ch}[^\\n]*`;

function paint(code: string, rules: Rule[]): string {
  const src = rules.map((p) => `(${p.re})`).join("|");
  const re = new RegExp(src, "gm");
  let out = "", last = 0, m: RegExpExecArray | null;
  while ((m = re.exec(code))) {
    if (m.index > last) out += esc(code.slice(last, m.index));
    let cls = "";
    for (let i = 0; i < rules.length; i++) {
      if (m[i + 1] !== undefined) { cls = rules[i].cls; break; }
    }
    out += `<span class="${cls}">${esc(m[0])}</span>`;
    last = m.index + m[0].length;
    if (m[0].length === 0) re.lastIndex++;
  }
  return out + esc(code.slice(last));
}

const TS_KW = "\\b(?:const|let|var|function|return|import|from|export|default|async|await|new|typeof|if|else|for|while|of|in|try|catch|finally|throw|switch|case|break|continue|interface|type|extends|implements|enum|null|undefined|true|false|this|class)\\b";
const PY_KW = "\\b(?:def|return|import|from|as|for|while|in|if|elif|else|with|None|True|False|class|lambda|pass|raise|try|except|finally|assert|yield|async|await|not|and|or|is)\\b";

const RULES: Record<string, Rule[]> = {
  ts: [
    { re: `\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/`, cls: "tok-com" },
    { re: `${STR}|\`(?:[^\`\\\\]|\\\\.)*\``, cls: "tok-str" },
    { re: TS_KW, cls: "tok-kw" },
    { re: "\\b\\d[\\d_]*(?:\\.\\d+)?\\b", cls: "tok-num" },
    { re: "\\b[a-zA-Z_$][\\w$]*(?=\\s*\\()", cls: "tok-fn" },
  ],
  js: [],
  python: [
    { re: COMMENT_LINE("#"), cls: "tok-com" },
    { re: `${STR}|\"\"\"[\\s\\S]*?\"\"\"`, cls: "tok-str" },
    { re: PY_KW, cls: "tok-kw" },
    { re: "@[a-zA-Z_][\\w.]*", cls: "tok-fn" },
    { re: "\\b\\d[\\d_]*(?:\\.\\d+)?\\b", cls: "tok-num" },
  ],
  bash: [
    { re: COMMENT_LINE("#"), cls: "tok-com" },
    { re: STR, cls: "tok-str" },
    { re: "\\$\\{[^}]+\\}|\\$[a-zA-Z_][\\w]*", cls: "tok-var" },
    { re: "(?:^|\\s)(?:-\\w+|--[\\w-]+)", cls: "tok-flag" },
    { re: "\\b(?:curl|export|if|then|else|fi|for|while|do|done|echo|cd|pip|python3|docker|npm|git)\\b", cls: "tok-kw" },
  ],
  sh: [],
  yaml: [
    { re: COMMENT_LINE("#"), cls: "tok-com" },
    { re: STR, cls: "tok-str" },
    { re: "^[\\s-]*(?:[\\w./-]+)(?=\\s*:)", cls: "tok-key" },
    { re: "\\b(?:true|false|null|yes|no|on|off)\\b|\\b\\d[\\d_]*(?:\\.\\d+)?\\b", cls: "tok-num" },
  ],
  yml: [],
  json: [
    { re: `"(?:[^"\\\\\\n]|\\\\.)*"(?=\\s*:)`, cls: "tok-key" },
    { re: STR, cls: "tok-str" },
    { re: "\\b(?:true|false|null)\\b|-?\\b\\d[\\d_]*(?:\\.\\d+)?(?:[eE][+-]?\\d+)?\\b", cls: "tok-num" },
  ],
  http: [
    { re: "^(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\\b", cls: "tok-kw" },
    { re: COMMENT_LINE("#"), cls: "tok-com" },
    { re: STR, cls: "tok-str" },
  ],
};
RULES.js = RULES.ts;
RULES.sh = RULES.bash;
RULES.yml = RULES.yaml;

export function highlightCode(lang: string, code: string): string {
  const rules = RULES[lang.toLowerCase()];
  if (!rules) return esc(code);
  return paint(code, rules);
}

export function langLabel(lang: string): string {
  const l = lang.toLowerCase();
  const names: Record<string, string> = {
    ts: "TypeScript", js: "JavaScript", python: "Python", bash: "Bash", sh: "Shell",
    yaml: "YAML", yml: "YAML", json: "JSON", http: "HTTP",
  };
  return names[l] ?? (lang ? lang.toUpperCase() : "Code");
}
