// ============================================
// OBFAST ENGINE v8.0 - SAFE MODE (NO MINIFICATION)
// Fix: Preserve original whitespace
// ============================================

function genName() {
  return '_0x' + Math.random().toString(16).slice(2, 10).toUpperCase();
}

// ============================================
// LAYER 1: TOKENIZER (PRESERVE WHITESPACE)
// ============================================
function tokenize(src) {
  const tokens = [];
  let i = 0, l = src.length;

  while (i < l) {
    const c = src[i], n = src[i+1], n2 = src[i+2];

    // Block comment
    if (c === '-' && n === '-' && n2 === '[') {
      let eq = 0;
      while (src[i + 3 + eq] === '=') eq++;
      if (src[i + 3 + eq] === '[') {
        let end = src.indexOf(']' + '='.repeat(eq) + ']', i + 4 + eq);
        end = end === -1 ? l : end + 3 + eq;
        tokens.push({t: 'comment', v: src.slice(i, end)});
        i = end; continue;
      }
    }

    // Line comment
    if (c === '-' && n === '-') {
      let end = src.indexOf('\n', i);
      tokens.push({t: 'comment', v: src.slice(i, end === -1 ? l : end)});
      i = end === -1 ? l : end; continue;
    }

    // Block string
    if (c === '[' && (n === '[' || n === '=')) {
      let eq = 0;
      while (src[i + 1 + eq] === '=') eq++;
      if (src[i + 1 + eq] === '[') {
        let end = src.indexOf(']' + '='.repeat(eq) + ']', i + 2 + eq);
        end = end === -1 ? l : end + 3 + eq;
        tokens.push({t: 'string', v: src.slice(i, end), r: null, long: true});
        i = end; continue;
      }
    }

    // Normal string
    if (c === '"' || c === "'") {
      let j = i + 1, raw = '', hasEscape = false;
      while (j < l && src[j] !== c) {
        if (src[j] === '\\') {
          hasEscape = true;
          let esc = src[j+1];
          if (esc === 'n' || esc === 't' || esc === 'r' || esc === '\\' || esc === c) { j += 2; }
          else if (esc === 'x' && j + 3 < l && /^[0-9a-fA-F]{2}$/.test(src.slice(j+2, j+4))) { j += 4; }
          else { j += 2; }
        } else {
          if (src.charCodeAt(j) > 255) hasEscape = true;
          j++;
        }
      }
      j++;
      tokens.push({t: 'string', v: src.slice(i, j), r: hasEscape ? null : src.slice(i+1, j-1), skip: hasEscape});
      i = j; continue;
    }

    // Number
    if (/\d/.test(c) || (c === '.' && /\d/.test(n))) {
      let j = i;
      if (c === '0' && (n === 'x' || n === 'X')) {
        j += 2; while (j < l && /[0-9a-fA-F]/.test(src[j])) j++;
      } else {
        while (j < l && /[\d.]/.test(src[j])) j++;
        if (j < l && (src[j] === 'e' || src[j] === 'E')) {
          j++; if (j < l && (src[j] === '+' || src[j] === '-')) j++;
          while (j < l && /\d/.test(src[j])) j++;
        }
      }
      tokens.push({t: 'number', v: src.slice(i, j)});
      i = j; continue;
    }

    // Identifier / Keyword
    if (/[a-zA-Z_]/.test(c)) {
      let j = i;
      while (j < l && /[a-zA-Z0-9_]/.test(src[j])) j++;
      tokens.push({t: 'id', v: src.slice(i, j)});
      i = j; continue;
    }

    // Operators
    if (c === '.' && n === '.' && n2 === '.') { tokens.push({t: 'op', v: '...'}); i += 3; continue; }
    if (c === '.' && n === '.') { tokens.push({t: 'op', v: '..'}); i += 2; continue; }
    if (c === ':' && n === ':') { tokens.push({t: 'op', v: '::'}); i += 2; continue; }
    if ((c === '=' && n === '=') || (c === '~' && n === '=') || (c === '<' && n === '=') || (c === '>' && n === '=')) {
      tokens.push({t: 'op', v: c + n}); i += 2; continue;
    }
    if ('+-*/%^#=<>(){}[];:,.~'.includes(c)) {
      tokens.push({t: 'op', v: c}); i++; continue;
    }

    // Whitespace (PRESERVE!)
    if (/\s/.test(c)) {
      let j = i;
      while (j < l && /\s/.test(src[j])) j++;
      tokens.push({t: 'ws', v: src.slice(i, j)});
      i = j; continue;
    }

    tokens.push({t: 'unk', v: c}); i++;
  }
  return tokens;
}

// ============================================
// LAYER 2: STRING ENCRYPTION
// ============================================
function encryptStrings(tokens) {
  const strTable = [];
  const strMap = new Map();

  for (const tk of tokens) {
    if (tk.t === 'string' && !tk.skip && tk.r && tk.r.length > 0) {
      if (!strMap.has(tk.v)) {
        const key = Math.floor(Math.random() * 254) + 1;
        const bytes = [];
        for (let i = 0; i < tk.r.length; i++) {
          bytes.push(tk.r.charCodeAt(i) ^ ((key + i) % 256));
        }
        strTable.push({k: key, b: bytes});
        strMap.set(tk.v, strTable.length - 1);
      }
    }
  }

  if (strTable.length === 0) return tokens;

  const funcName = genName();
  const tableName = genName();
  const loader = `local function ${funcName}(t,k)local r={}for i=1,#t do r[i]=string.char(bit32.bxor(t[i],(k+i-1)%256))end return table.concat(r)end\nlocal ${tableName}={` +
    strTable.map((s, idx) => `[${idx}]=${funcName}({${s.b.join(',')}},${s.k})`).join(',') + '}\n';

  const newTokens = [{t: 'code', v: loader}, {t: 'ws', v: '\n'}];
  for (const tk of tokens) {
    if (tk.t === 'string' && strMap.has(tk.v)) {
      newTokens.push({t: 'expr', v: `${tableName}[${strMap.get(tk.v)}]`});
    } else {
      newTokens.push(tk);
    }
  }
  return newTokens;
}

// ============================================
// LAYER 3: NUMBER OBFUSCATION
// ============================================
function obfuscateNumbers(tokens) {
  return tokens.map(tk => {
    if (tk.t !== 'number') return tk;
    const num = parseFloat(tk.v);
    if (isNaN(num) || !Number.isInteger(num) || num < 0 || num > 65535) return tk;

    const high = Math.floor(num / 256);
    const low = num % 256;
    const noise = Math.floor(Math.random() * 254) + 1;
    return {t: 'expr', v: `bit32.bor(bit32.lshift(bit32.bxor(${high ^ noise},${noise}),8),${low})`};
  });
}

// ============================================
// LAYER 4: GENERATOR (PRESERVE WHITESPACE)
// ============================================
function generate(tokens) {
  return tokens.map(t => t.v).join('');
}

// ============================================
// MAIN EXPORT
// ============================================
export function obfuscate(source) {
  try {
    if (!source || typeof source !== 'string' || source.trim().length === 0) {
      throw new Error("Input kosong!");
    }

    let tokens = tokenize(source);
    tokens = encryptStrings(tokens);
    tokens = obfuscateNumbers(tokens);
    let result = generate(tokens);

    return result;
  } catch (e) {
    throw new Error("Obfuscation Error: " + e.message);
  }
}
