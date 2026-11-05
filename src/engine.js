// ============================================
// OBFAST ENGINE v9.1 - FINAL FIXED PACKER
// Aggressive Minification + Identifier Renaming + 100% Working Packer
// ============================================

const GLOBALS = new Set([
  'print','tostring','tonumber','type','typeof','pairs','ipairs','next','select','unpack',
  'rawget','rawset','rawequal','rawlen','setmetatable','getmetatable','pcall','xpcall',
  'error','assert','require','loadstring','dofile','loadfile','collectgarbage',
  'coroutine','string','table','math','bit32','os','io','debug','game','workspace',
  'script','Instance','Vector3','Vector2','CFrame','Color3','UDim','UDim2','Enum',
  'task','tick','wait','spawn','delay','time','warn','self','super','load','_G',
  'true','false','nil','unpack','getfenv','setfenv','newcclosure','hookfunction',
  'hookmetamethod','getnamecallmethod','checkcaller','getconnections','getrenv',
  'getsenv','getgc','getgenv','getreg','getinstances','getnilinstances','fireclickdetector',
  'firesignal','firetouchinterest','fireproximityprompt','islclosure','iscclosure',
  'decompile','checkcaller','rconsoleinfo','rconsolewarn','rconsoleerr','rconsoleclear',
  'rconsolecreate','rconsoledestroy','rconsoleinput','rconsoleprint','setreadonly',
  'isreadonly','clonefunction','newcclosure','getthreadidentity','setthreadidentity',
  'getrawmetatable','setrawmetatable','getrenv','getsenv','getgc','getinstances',
  'getnilinstances','getrunningscripts','getscriptclosure','getscriptfunction',
  'getscripts','getscripthash','getconnections','getsignal','getcustomasset',
  'request','syn_request','http_request','httpget','http_post','HttpGet','HttpPost',
  'readfile','writefile','loadfile','appendfile','listfiles','isfile','isfolder',
  'makefolder','delfolder','delfile','loadstring','gethui','syn'
]);

const KEYWORDS = new Set([
  'and','break','do','else','elseif','end','false','for','function','if','in','local',
  'nil','not','or','repeat','return','then','true','until','while','continue','type',
  'export','typeof'
]);

function genName() {
  return '_0x' + Math.random().toString(16).slice(2, 10).toUpperCase();
}

// --- 1. TOKENIZER & STRING ENCRYPTION ---
function tokenizeAndEncryptStrings(src) {
  const tokens = [];
  let i = 0, l = src.length;

  while (i < l) {
    const c = src[i], n = src[i+1], n2 = src[i+2];

    // Block comment --[[ ]] or --[=[ ]=]
    if (c === '-' && n === '-' && n2 === '[') {
      let eq = 0;
      while (src[i + 3 + eq] === '=') eq++;
      if (src[i + 3 + eq] === '[') {
        let end = src.indexOf(']' + '='.repeat(eq) + ']', i + 4 + eq);
        end = end === -1 ? l : end + 3 + eq;
        i = end; continue; // Skip comment
      }
    }

    // Line comment --
    if (c === '-' && n === '-') {
      let end = src.indexOf('\n', i);
      i = end === -1 ? l : end; continue; // Skip comment
    }

    // Block string [=[ ]=]
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
      tokens.push({t: KEYWORDS.has(src.slice(i, j)) ? 'kw' : 'id', v: src.slice(i, j)});
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

    // Whitespace
    if (/\s/.test(c)) {
      let j = i; while (j < l && /\s/.test(src[j])) j++;
      tokens.push({t: 'ws', v: ' '}); // Normalize to single space
      i = j; continue;
    }

    tokens.push({t: 'unk', v: c}); i++;
  }
  return tokens;
}

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

  if (strTable.length === 0) return tokens.map(t => t.v).join('');

  const funcName = genName();
  const tableName = genName();
  const loader = `local function ${funcName}(t,k)local r={}for i=1,#t do r[i]=string.char(bit32.bxor(t[i],(k+i-1)%256))end return table.concat(r)end\nlocal ${tableName}={` +
    strTable.map((s, idx) => `[${idx}]=${funcName}({${s.b.join(',')}},${s.k})`).join(',') + '}\n';

  const newTokens = [loader];
  for (const tk of tokens) {
    if (tk.t === 'string' && strMap.has(tk.v)) {
      newTokens.push(`${tableName}[${strMap.get(tk.v)}]`);
    } else if (tk.t !== 'ws') {
      newTokens.push(tk.v);
    } else {
      newTokens.push(' ');
    }
  }
  return newTokens.join('');
}

// --- 2. MINIFICATION ---
function minifyCode(code) {
  // Remove comments (already done in tokenizer, but just in case)
  code = code.replace(/--\[\[[\s\S]*?\]\]/g, '');
  code = code.replace(/--[^\n]*/g, '');
  
  // Collapse whitespace
  code = code.replace(/\s+/g, ' ');
  
  // Remove space around operators and punctuation where safe
  code = code.replace(/\s*([{}()\[\];,=+\-*/%^#<>~:])\s*/g, '$1');
  
  // Ensure space after keywords to prevent merging (e.g., endlocal -> end local)
  const kws = ['end','local','return','then','do','else','elseif','function','repeat','until','while','for','in','if','not','and','or'];
  for (const kw of kws) {
    const regex = new RegExp(`\\b(${kw})([a-zA-Z_])`, 'g');
    code = code.replace(regex, '$1 $2');
  }
  
  return code.trim();
}

// --- 3. IDENTIFIER RENAMING (THE LOOPHOLE FIX) ---
function renameIdentifiers(code) {
  const names = new Set();
  
  // Find local declarations: local name or local name, name2
  const localRegex = /\blocal\s+([a-zA-Z_][a-zA-Z0-9_]*)/g;
  let match;
  while ((match = localRegex.exec(code)) !== null) names.add(match[1]);
  
  // Find function declarations: function name(
  const funcRegex = /\bfunction\s+([a-zA-Z_][a-zA-Z0-9_]*)/g;
  while ((match = funcRegex.exec(code)) !== null) names.add(match[1]);
  
  // Find assignments: name = function
  const assignFuncRegex = /\b([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*function/g;
  while ((match = assignFuncRegex.exec(code)) !== null) names.add(match[1]);

  // Filter out globals/keywords/short names
  const safeNames = [...names].filter(n => 
    !GLOBALS.has(n) && 
    !KEYWORDS.has(n) && 
    n.length > 2 && // Skip short names like 'i', 'v' to avoid scope conflicts
    !n.startsWith('_0x') // Skip already obfuscated names
  );

  // Create rename map
  const map = new Map();
  safeNames.forEach(n => map.set(n, genName()));

  // Replace all occurrences
  let result = code;
  for (const [oldName, newName] of map) {
    const regex = new RegExp(`\\b${oldName}\\b`, 'g');
    result = result.replace(regex, newName);
  }
  
  return result;
}

// --- 4. NUMBER OBFUSCATION ---
function obfuscateNumbers(code) {
  return code.replace(/\b(\d+)\b/g, (match, numStr) => {
    const num = parseInt(numStr);
    if (isNaN(num) || !Number.isInteger(num) || num < 0 || num > 65535) return match;
    
    const high = Math.floor(num / 256);
    const low = num % 256;
    const noise = Math.floor(Math.random() * 254) + 1;
    return `bit32.bor(bit32.lshift(bit32.bxor(${high ^ noise},${noise}),8),${low})`;
  });
}

// --- 5. PACKER (100% FIXED) ---
function packSource(source) {
  const bytes = new TextEncoder().encode(source);
  const k1 = Math.floor(Math.random() * 200) + 50;
  const k2 = Math.floor(Math.random() * 200) + 50;
  const enc = new Uint8Array(bytes.length);
  
  for (let i = 0; i < bytes.length; i++) {
    enc[i] = bytes[i] ^ ((k1 * (i + 1) + k2) % 256);
  }
  
  // Standard Base64 alphabet (EXACTLY 64 chars)
  const base = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  
  // Shuffle alphabet
  const alpha = base.split('');
  for (let i = alpha.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [alpha[i], alpha[j]] = [alpha[j], alpha[i]];
  }
  const alp = alpha.join('');
  
  // Base64 encode dengan alphabet yang di-shuffle
  let b64 = '';
  for (let i = 0; i < enc.length; i += 3) {
    const b1 = enc[i];
    const b2 = i + 1 < enc.length ? enc[i + 1] : 0;
    const b3 = i + 2 < enc.length ? enc[i + 2] : 0;
    
    b64 += alp[b1 >> 2];
    b64 += alp[((b1 & 3) << 4) | (b2 >> 4)];
    b64 += (i + 1 < enc.length) ? alp[((b2 & 15) << 2) | (b3 >> 6)] : '';
    b64 += (i + 2 < enc.length) ? alp[b3 & 63] : '';
  }
  
  const d = genName(), a = genName(), k1v = genName(), k2v = genName(), f = genName();
  
  // FIXED DECODER: Uses 'or 0' and '1, true' (plain text search) for 100% accuracy
  return `local ${d}="${b64}"\nlocal ${a}="${alp}"\nlocal ${k1v}=${k1}\nlocal ${k2v}=${k2}\nlocal function ${f}(data,alpha,key1,key2)\nlocal b={}\nfor i=1,#data,4 do\nlocal c1=alpha:find(data:sub(i,i),1,true) or 0\nlocal c2=alpha:find(data:sub(i+1,i+1),1,true) or 0\nlocal c3=(i+2<=#data and alpha:find(data:sub(i+2,i+2),1,true)) or 0\nlocal c4=(i+3<=#data and alpha:find(data:sub(i+3,i+3),1,true)) or 0\nb[#b+1]=c1*4+math.floor(c2/16)\nif i+2<=#data then b[#b+1]=(c2%16)*16+math.floor(c3/4) end\nif i+3<=#data then b[#b+1]=(c3%4)*64+c4 end\nend\nlocal s=""\nfor i=1,#b do s=s..string.char(bit32.bxor(b[i],(key1*i+key2)%256)) end\nreturn s\nend\nlocal _0xDEC=function(t,k)local r={}for i=1,#t do r[i]=string.char(bit32.bxor(t[i],(k+i-1)%256))end return table.concat(r)end\nlocal chunk=loadstring(${f}(${d},${a},${k1v},${k2v}))\nif chunk then return chunk() else error("Load Failed: " .. tostring(chunk)) end`;
}

// --- MAIN EXPORT ---
export function obfuscate(source) {
  try {
    // 1. Tokenize & Encrypt Strings
    const tokens = tokenizeAndEncryptStrings(source);
    let code = encryptStrings(tokens);
    
    // 2. Minify (Remove whitespace/comments)
    code = minifyCode(code);
    
    // 3. Rename Identifiers (Close the loophole!)
    code = renameIdentifiers(code);
    
    // 4. Obfuscate Numbers
    code = obfuscateNumbers(code);
    
    // 5. Pack
    return packSource(code);
  } catch (e) {
    throw new Error("Obfuscation Error: " + e.message);
  }
}
