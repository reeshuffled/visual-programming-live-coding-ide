import esprima from "esprima";

export function addInfiniteLoopProtection(code, timeout = 2000) {
  let loopId = 1;
  let patches = [];
  const varPrefix = "_wmloopvar";
  const varStr = "var %d = Date.now();\n";
  const checkStr = `\nif (Date.now() - %d > ${timeout}) { window.stopRunning(); throw new Error("Infinite loop detected. Please make changes and press Run when you are ready to try again."); break;}\n`;

  esprima.parseScript(code, { tolerant: true, range: true }, (node) => {
    switch (node.type) {
      case "DoWhileStatement":
      case "ForStatement":
      case "ForInStatement":
      case "ForOfStatement":
      case "WhileStatement": {
        let start = 1 + node.body.range[0];
        let end = node.body.range[1];
        let prolog = checkStr.replace("%d", varPrefix + loopId);
        let epilog = "";
        if (node.body.type !== "BlockStatement") {
          prolog = "{" + prolog;
          epilog = "}";
          --start;
        }
        patches.push({ pos: start, str: prolog });
        patches.push({ pos: end, str: epilog });
        patches.push({ pos: node.range[0], str: varStr.replace("%d", varPrefix + loopId) });
        ++loopId;
        break;
      }
      default:
        break;
    }
  });

  patches
    .sort((a, b) => b.pos - a.pos)
    .forEach((p) => {
      code = code.slice(0, p.pos) + p.str + code.slice(p.pos);
    });

  return code;
}

export function friendlyError(raw) {
  const m = String(raw?.message ?? raw);
  const dup = m.match(/Identifier ['"]?(\w+)['"]? has already been declared/);
  if (dup) return `'${dup[1]}' is declared twice — remove the duplicate const/let/var line.`;

  const notFn = m.match(/['"]([\w.]+)['"] is not a function|(\S+) is not a function/);
  if (notFn) {
    const name = notFn[1] ?? notFn[2];
    return `${name} is not a function — check the spelling.`;
  }

  const notDef = m.match(/(\w+) is not defined/);
  if (notDef) return `'${notDef[1]}' is not defined — did you forget to create it?`;

  const prop = m.match(
    /Cannot read propert(?:y|ies) of (undefined|null)(?: \(reading ['"](\w+)['"]\))?/,
  );
  if (prop)
    return prop[2]
      ? `Tried to use .${prop[2]} on something that doesn't exist yet.`
      : `Tried to use a property on something that doesn't exist yet.`;

  if (m.includes("Unexpected token") || m.includes("Unexpected end of"))
    return `Syntax error — check for missing or extra brackets, quotes, or commas.`;

  if (m.includes("Unexpected identifier"))
    return `Syntax error — unexpected word. Check for missing punctuation on the line above.`;

  if (m.includes("Infinite loop detected")) return m;

  return m.replace(/^(TypeError|SyntaxError|ReferenceError|RangeError|EvalError): /, "");
}

// Returns 1-based script line from an error's stack trace, or null if unparseable.
export function extractScriptLine(error) {
  const stack = error?.stack ?? '';
  // Chrome/Edge/Safari: <anonymous>:LINE:COL
  const m = stack.match(/<anonymous>:(\d+):\d+/);
  if (m) return parseInt(m[1], 10);
  // Eval-wrapped: eval at NAME (file:L:C):OUTER_LINE:OUTER_COL — want OUTER_LINE
  const mEval = stack.match(/\):(\d+):\d+/);
  if (mEval) return parseInt(mEval[1], 10);
  // Firefox: @debugger eval code:LINE:COL
  const m2 = stack.match(/@[^:]*:(\d+):\d+/);
  if (m2) return parseInt(m2[1], 10);
  return typeof error?.lineNumber === 'number' ? error.lineNumber : null;
}
