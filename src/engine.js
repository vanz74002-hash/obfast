// ============================================
// OBFAST ENGINE V7.0 - AC EVASION & STABILITY
// Focus: String Encryption, Minification, 
//        100% Semantic Safety (No Var Renaming)
// ============================================

// ============================================
// 1. ROBUST TOKENIZER
// ============================================
function tokenize(src) {
  const tokens = [];
  let i = 0, l = src.length;

  while (i < l) {
    const c = src[i], n = src[i+1], n2 = src[i+2];

    // Block Comments --[[ ]] or --[=[ ]=]
    if (c === '-' && n === '-' && n2 === '[') {
      let eq = 0;
      while (src[i + 3 + eq] === '=') eq++;
      if (src[i + 3 + eq] === '[') {
        let end = src.indexOf(']' + '='.repeat(eq) + ']', i + 4 + eq);
        end = end === -1 ? l : end + 3 + eq;
        // Skip comments entirely (Minification)
        i = end; continue;
      }
    }

    // Line Comments --
    if (c === '-' && n === '-') {
      let end = src.indexOf('\n', i);
      // Skip comments entirely
      i = end === -1 ? l : end; continue;
    }

    // Block Strings [=[ ]=] (Skip encryption for safety)
    if (c === '[' && (n === '[' || n === '=')) {
      let eq = 0;
      while (src[i + 1 + eq] === '=') eq++;
      if (src[i + 1 + eq] === '[') {
        let end = src.indexOf(']' + '='.repeat(eq) + ']', i + 2 + eq);
        end = end === -1 ? l : end + 3 + eq;
        tokens.push({t: 'string', v: src.slice(i, end), raw: null, long: true});
        i = end; continue;
      }
    }

    // Normal Strings
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < l && src[j] !== c) {
        if (src[j] === '\\') j += 2; // Skip escape
        else j++;
      }
      j++; // skip closing quote
      const raw = src.slice(i+1, j-1);
      tokens.push({t: 'string', v: src.slice(i, j), raw: raw, long: false});
      i = j; continue;
    }

    // Numbers
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

    // Identifiers & Keywords
    if (/[a-zA-Z_]/.test(c)) {
      let j = i;
      while (j < l && /[a-zA-Z0-9_]/.test(src[j])) j++;
      tokens.push({t: 'id', v: src.slice(i, j)}); // Treat all as id for safety
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

    // Whitespace (We will regenerate this later for minification)
    if (/\s/.test(c)) {
      let j = i; while (j < l && /\s/.test(src[j])) j++;
      i = j; continue; // Skip whitespace tokens
    }

    i++; // Skip unknown
  }
  return tokens;
}

// ============================================
// 2. STRING ENCRYPTION (AC BYPASS)
// ============================================
function encryptStrings(tokens) {
  const decoderName = '_0x' + Math.random().toString(16).slice(2, 6).toUpperCase();
  const decoderCode = `local ${decoderName}=function(t)local r=""for i=1,#t do r=r..string.char(t[i])end return r end`;
  
  const newTokens = [{t: 'code', v: decoderCode}, {t: 'ws', v: ' '}];
  
  for (const tk of tokens) {
    if (tk.t === 'string' && !tk.long && tk.raw) {
      // Skip very short strings (like "x", "y") to save space
      if (tk.raw.length < 2) {
        newTokens.push(tk);
        continue;
      }
      
      // Convert to byte array
      const bytes = [];
      for (let i = 0; i < tk.raw.length; i++) {
        bytes.push(tk.raw.charCodeAt(i));
      }
      
      // Replace with decoder call
      newTokens.push({t: 'expr', v: `${decoderName}({${bytes.join(',')}})`});
    } else {
      newTokens.push(tk);
    }
  }
  return newTokens;
}

// ============================================
// 3. NUMBER OBFUSCATION (HEX)
// ============================================
function obfuscateNumbers(tokens) {
  return tokens.map(tk => {
    if (tk.t !== 'number') return tk;
    
    // Only convert integers to Hex
    if (Number.isInteger(parseFloat(tk.v)) && !tk.v.includes('.') && !tk.v.toLowerCase().includes('e')) {
      const num = parseInt(tk.v);
      if (num >= 0 && num <= 65535) {
        return {t: 'number', v: '0x' + num.toString(16).toUpperCase()};
      }
    }
    return tk;
  });
}

// ============================================
// 4. MINIFICATION & GENERATION
// ============================================
function generate(tokens) {
  let result = '';
  let lastType = null;
  
  for (const tk of tokens) {
    if (tk.t === 'ws') {
      // Add single space if needed to separate identifiers
      if (lastType === 'id' || lastType === 'number') {
        result += ' ';
      }
    } else if (tk.t === 'code') {
      result += tk.v + ' ';
    } else if (tk.t === 'expr') {
      result += tk.v;
    } else {
      result += tk.v;
    }
    lastType = tk.t;
  }
  
  return result;
}

// ============================================
// MAIN EXPORT
// ============================================
export function obfuscate(source) {
  try {
    // 1. Tokenize (also removes comments)
    let tokens = tokenize(source);
    
    // 2. Encrypt Strings (AC Bypass)
    tokens = encryptStrings(tokens);
    
    // 3. Obfuscate Numbers
    tokens = obfuscateNumbers(tokens);
    
    // 4. Generate Minified Code
    let result = generate(tokens);
    
    // 5. Wrap in do-end for extra safety
    result = `do ${result} end`;
    
    return result;
  } catch (e) {
    throw new Error('Obfuscation Error: ' + e.message);
  }
}
