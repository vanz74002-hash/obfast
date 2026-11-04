// src/engine.js - FIXED VERSION

const GLOBALS = new Set([
  'print','tostring','tonumber','type','typeof','pairs','ipairs','next','select','unpack',
  'rawget','rawset','rawequal','rawlen','setmetatable','getmetatable','pcall','xpcall',
  'error','assert','require','loadstring','dofile','loadfile','collectgarbage',
  'coroutine','string','table','math','bit32','os','io','debug','game','workspace',
  'script','Instance','Vector3','Vector2','CFrame','Color3','UDim','UDim2','Enum',
  'task','tick','wait','spawn','delay','time','warn','self','super','load','_G',
  'true','false','nil'
]);

const KEYWORDS = new Set([
  'and','break','do','else','elseif','end','false','for','function','if','in','local',
  'nil','not','or','repeat','return','then','true','until','while','continue','type',
  'export','typeof'
]);

function genName() {
  return '_0x' + Math.random().toString(16).slice(2, 10).toUpperCase();
}

// ============================================
// LAYER 1: TOKENIZER (FIXED)
// ============================================
function tokenize(src) {
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
        tokens.push({t: 'comment', v: src.slice(i, end)});
        i = end;
        continue;
      }
    }
    
    // Line comment
    if (c === '-' && n === '-') {
      let end = src.indexOf('\n', i);
      tokens.push({t: 'comment', v: src.slice(i, end === -1 ? l : end)});
      i = end === -1 ? l : end;
      continue;
    }
    
    // Block string [=[ ]=]
    if (c === '[' && (n === '[' || n === '=')) {
      let eq = 0;
      while (src[i + 1 + eq] === '=') eq++;
      if (src[i + 1 + eq] === '[') {
        let end = src.indexOf(']' + '='.repeat(eq) + ']', i + 2 + eq);
        end = end === -1 ? l : end + 3 + eq;
        tokens.push({t: 'string', v: src.slice(i, end), r: null, long: true});
        i = end;
        continue;
      }
    }
    
    // Normal string
    if (c === '"' || c === "'") {
      let j = i + 1, raw = '', hasEscape = false;
      while (j < l && src[j] !== c) {
        if (src[j] === '\\') {
          hasEscape = true;
          let esc = src[j+1];
          if (esc === 'n' || esc === 't' || esc === 'r' || esc === '\\' || esc === c) {
            j += 2;
          } else if (esc === 'x' && j + 3 < l && /^[0-9a-fA-F]{2}$/.test(src.slice(j+2, j+4))) {
            j += 4;
          } else {
            j += 2;
          }
        } else {
          if (src.charCodeAt(j) > 255) hasEscape = true;
          j++;
        }
      }
      j++;
      tokens.push({t: 'string', v: src.slice(i, j), r: hasEscape ? null : src.slice(i+1, j-1), skip: hasEscape});
      i = j;
      continue;
    }
    
    // Number
    if (/\d/.test(c) || (c === '.' && /\d/.test(n))) {
      let j = i;
      if (c === '0' && (n === 'x' || n === 'X')) {
        j += 2;
        while (j < l && /[0-9a-fA-F]/.test(src[j])) j++;
      } else {
        while (j < l && /[\d.]/.test(src[j])) j++;
        if (j < l && (src[j] === 'e' || src[j] === 'E')) {
          j++;
          if (j < l && (src[j] === '+' || src[j] === '-')) j++;
          while (j < l && /\d/.test(src[j])) j++;
        }
      }
      tokens.push({t: 'number', v: src.slice(i, j)});
      i = j;
      continue;
    }
    
    // Identifier / Keyword
    if (/[a-zA-Z_]/.test(c)) {
      let j = i;
      while (j < l && /[a-zA-Z0-9_]/.test(src[j])) j++;
      const w = src.slice(i, j);
      tokens.push({t: KEYWORDS.has(w) ? 'kw' : 'id', v: w});
      i = j;
      continue;
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
      let j = i;
      while (j < l && /\s/.test(src[j])) j++;
      tokens.push({t: 'ws', v: src.slice(i, j)});
      i = j;
      continue;
    }
    
    tokens.push({t: 'unk', v: c}); i++;
  }
  
  return tokens;
}

// ============================================
// LAYER 2: PARSER (FIXED - SIMPLE & ROBUST)
// ============================================
function parse(tokens) {
  let idx = 0;
  
  function peek() { return tokens[idx]; }
  function advance() { return tokens[idx++]; }
  function skipWs() { while (idx < tokens.length && (tokens[idx].t === 'ws' || tokens[idx].t === 'comment')) idx++; }
  
  function parseExpression() {
    skipWs();
    const tk = peek();
    if (!tk) return null;
    
    // Number literal
    if (tk.t === 'number') {
      advance();
      return {type: 'NumberLiteral', value: tk.v};
    }
    
    // String literal
    if (tk.t === 'string') {
      advance();
      return {type: 'StringLiteral', value: tk.v, raw: tk.r};
    }
    
    // Identifier
    if (tk.t === 'id') {
      advance();
      return {type: 'Identifier', name: tk.v};
    }
    
    // Parenthesized expression
    if (tk.t === 'op' && tk.v === '(') {
      advance();
      skipWs();
      const expr = parseExpression();
      skipWs();
      if (peek() && peek().t === 'op' && peek().v === ')') advance();
      return expr;
    }
    
    // Function call
    if (tk.t === 'id') {
      advance();
      skipWs();
      if (peek() && peek().t === 'op' && peek().v === '(') {
        advance();
        skipWs();
        const args = [];
        while (peek() && !(peek().t === 'op' && peek().v === ')')) {
          args.push(parseExpression());
          skipWs();
          if (peek() && peek().t === 'op' && peek().v === ',') {
            advance();
            skipWs();
          }
        }
        if (peek() && peek().t === 'op' && peek().v === ')') advance();
        return {type: 'CallExpression', callee: {type: 'Identifier', name: tk.v}, arguments: args};
      }
      return {type: 'Identifier', name: tk.v};
    }
    
    // Fallback: skip unknown token
    advance();
    return {type: 'Unknown', value: tk.v};
  }
  
  function parseStatement() {
    skipWs();
    const tk = peek();
    if (!tk) return null;
    
    // Local statement: local x = 10
    if (tk.t === 'kw' && tk.v === 'local') {
      advance();
      skipWs();
      
      const names = [];
      while (peek() && peek().t === 'id') {
        names.push(advance().v);
        skipWs();
        if (peek() && peek().t === 'op' && peek().v === ',') {
          advance();
          skipWs();
        } else {
          break;
        }
      }
      
      let init = [];
      if (peek() && peek().t === 'op' && peek().v === '=') {
        advance();
        skipWs();
        init.push(parseExpression());
        skipWs();
        while (peek() && peek().t === 'op' && peek().v === ',') {
          advance();
          skipWs();
          init.push(parseExpression());
          skipWs();
        }
      }
      
      return {type: 'LocalStatement', names, init};
    }
    
    // Return statement
    if (tk.t === 'kw' && tk.v === 'return') {
      advance();
      skipWs();
      const values = [];
      if (peek() && peek().t !== 'kw') {
        values.push(parseExpression());
      }
      return {type: 'ReturnStatement', values};
    }
    
    // Expression statement (function call, assignment, etc.)
    const expr = parseExpression();
    skipWs();
    
    // Check for assignment
    if (peek() && peek().t === 'op' && peek().v === '=') {
      advance();
      skipWs();
      const values = [parseExpression()];
      return {type: 'AssignmentStatement', targets: [expr], values};
    }
    
    return {type: 'ExpressionStatement', expression: expr};
  }
  
  function parseBlock() {
    const stmts = [];
    while (idx < tokens.length) {
      skipWs();
      if (!peek()) break;
      const stmt = parseStatement();
      if (stmt) stmts.push(stmt);
    }
    return {type: 'Block', body: stmts};
  }
  
  skipWs();
  const body = parseBlock();
  
  // VALIDASI: Pastikan body adalah Block dengan array statements
  if (!body || body.type !== 'Block' || !Array.isArray(body.body)) {
    throw new Error('Parser gagal: body bukan Block atau tidak memiliki array statements');
  }
  
  return {type: 'Program', body};
}

// ============================================
// LAYER 3: TRANSFORMER (SCOPE-AWARE RENAMING)
// ============================================
function transform(ast) {
  const renameMap = new Map();
  const scopeStack = [{vars: new Set(), parent: null}];
  
  function currentScope() { return scopeStack[scopeStack.length - 1]; }
  
  function declareVar(name) {
    if (GLOBALS.has(name)) return name;
    if (!renameMap.has(name)) {
      renameMap.set(name, genName());
    }
    currentScope().vars.add(name);
    return renameMap.get(name);
  }
  
  function resolveVar(name) {
    if (GLOBALS.has(name)) return name;
    if (renameMap.has(name)) return renameMap.get(name);
    for (let i = scopeStack.length - 1; i >= 0; i--) {
      if (scopeStack[i].vars.has(name)) {
        if (!renameMap.has(name)) {
          renameMap.set(name, genName());
        }
        return renameMap.get(name);
      }
    }
    return name;
  }
  
  function visit(node) {
    if (!node) return;
    
    if (node.type === 'Program' || node.type === 'Block') {
      if (Array.isArray(node.body)) {
        // Pre-scan local declarations
        for (const stmt of node.body) {
          if (stmt && stmt.type === 'LocalStatement' && Array.isArray(stmt.names)) {
            for (const name of stmt.names) declareVar(name);
          }
        }
        // Visit children
        node.body.forEach(visit);
      }
      return;
    }
    
    if (node.type === 'LocalStatement') {
      if (Array.isArray(node.names)) {
        for (let i = 0; i < node.names.length; i++) {
          const oldName = node.names[i];
          if (!GLOBALS.has(oldName)) {
            const newName = declareVar(oldName);
            node.names[i] = newName;
            renameMap.set(oldName, newName);
          }
        }
      }
      if (Array.isArray(node.init)) {
        node.init.forEach(visit);
      }
      return;
    }
    
    if (node.type === 'Identifier') {
      if (!GLOBALS.has(node.name)) {
        node.name = resolveVar(node.name);
      }
      return;
    }
    
    // Recurse other nodes
    for (const key in node) {
      if (key === 'type') continue;
      const child = node[key];
      if (Array.isArray(child)) {
        child.forEach(visit);
      } else if (child && typeof child === 'object' && child.type) {
        visit(child);
      }
    }
  }
  
  visit(ast);
  return ast;
}

// ============================================
// LAYER 4: CODE GENERATOR
// ============================================
function generate(ast) {
  function gen(node) {
    if (!node) return '';
    
    switch (node.type) {
      case 'Program':
        return Array.isArray(node.body) ? gen(node.body) : '';
      
      case 'Block':
        return Array.isArray(node.body) ? node.body.map(gen).join('\n') : '';
      
      case 'LocalStatement':
        const names = Array.isArray(node.names) ? node.names.join(', ') : '';
        const init = Array.isArray(node.init) && node.init.length ? ' = ' + node.init.map(gen).join(', ') : '';
        return 'local ' + names + init;
      
      case 'NumberLiteral':
        return node.value;
      
      case 'StringLiteral':
        return node.value;
      
      case 'Identifier':
        return node.name;
      
      case 'CallExpression':
        return gen(node.callee) + '(' + (Array.isArray(node.arguments) ? node.arguments.map(gen).join(', ') : '') + ')';
      
      case 'AssignmentStatement':
        return (Array.isArray(node.targets) ? node.targets.map(gen).join(', ') : '') + ' = ' + (Array.isArray(node.values) ? node.values.map(gen).join(', ') : '');
      
      case 'ExpressionStatement':
        return gen(node.expression);
      
      case 'ReturnStatement':
        return 'return ' + (Array.isArray(node.values) ? node.values.map(gen).join(', ') : '');
      
      default:
        return '';
    }
  }
  
  return gen(ast);
}

// ============================================
// LAYER 5: STRING ENCRYPTION
// ============================================
function encryptStrings(source) {
  return source.replace(/(["'])(?:(?!\1|\\).|\\.)*\1/g, match => {
    if (match.length < 4) return match;
    const quote = match[0];
    const raw = match.slice(1, -1);
    if (raw.includes('\\')) return match;
    
    const key = Math.floor(Math.random() * 254) + 1;
    const bytes = [];
    for (let i = 0; i < raw.length; i++) {
      bytes.push(raw.charCodeAt(i) ^ ((key + i) % 256));
    }
    return `_0xDEC({${bytes.join(',')}},${key})`;
  });
}

// ============================================
// LAYER 6: NUMBER OBFUSCATION
// ============================================
function obfuscateNumbers(source) {
  return source.replace(/\b(\d+)\b/g, (match, numStr) => {
    const num = parseInt(numStr);
    if (num < 0 || num > 65535) return match;
    
    const high = Math.floor(num / 256);
    const low = num % 256;
    const noise = Math.floor(Math.random() * 254) + 1;
    return `bit32.bor(bit32.lshift(bit32.bxor(${high ^ noise},${noise}),8),${low})`;
  });
}

// ============================================
// LAYER 7: PACKER
// ============================================
function pack(source) {
  const bytes = new TextEncoder().encode(source);
  const k1 = Math.floor(Math.random() * 200) + 50;
  const k2 = Math.floor(Math.random() * 200) + 50;
  const enc = new Uint8Array(bytes.length);
  
  for (let i = 0; i < bytes.length; i++) {
    enc[i] = bytes[i] ^ ((k1 * (i + 1) + k2) % 256);
  }
  
  const base = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const alpha = base.split('');
  for (let i = alpha.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [alpha[i], alpha[j]] = [alpha[j], alpha[i]];
  }
  const alp = alpha.join('');
  
  let b64 = '';
  for (let i = 0; i < enc.length; i += 3) {
    const b1 = enc[i], b2 = i+1 < enc.length ? enc[i+1] : 0, b3 = i+2 < enc.length ? enc[i+2] : 0;
    b64 += alp[b1 >> 2] + alp[((b1 & 3) << 4) | (b2 >> 4)] + 
           (i+1 < enc.length ? alp[((b2 & 15) << 2) | (b3 >> 6)] : '') + 
           (i+2 < enc.length ? alp[b3 & 63] : '');
  }
  
  const d = genName(), a = genName(), k1v = genName(), k2v = genName(), f = genName();
  
  return `local ${d}="${b64}"\nlocal ${a}="${alp}"\nlocal ${k1v}=${k1}\nlocal ${k2v}=${k2}\nlocal function ${f}(data,alpha,key1,key2)\nlocal b={}\nfor i=1,#data,4 do\nlocal c1=alpha:find(data:sub(i,i),1,1) or 1\nlocal c2=alpha:find(data:sub(i+1,i+1),1,1) or 1\nlocal c3=i+2<=#data and (alpha:find(data:sub(i+2,i+2),1,1) or 1)\nlocal c4=i+3<=#data and (alpha:find(data:sub(i+3,i+3),1,1) or 1)\nc1,c2,c3,c4=c1-1,c2-1,c3-1,c4-1\nb[#b+1]=c1*4+math.floor(c2/16)\nif i+2<=#data then b[#b+1]=(c2%16)*16+math.floor(c3/4) end\nif i+3<=#data then b[#b+1]=(c3%4)*64+c4 end\nend\nlocal s=""\nfor i=1,#b do s=s..string.char(bit32.bxor(b[i],(key1*i+key2)%256)) end\nreturn s\nend\nlocal _0xDEC=function(t,k)local r={}for i=1,#t do r[i]=string.char(bit32.bxor(t[i],(k+i-1)%256))end return table.concat(r)end\nlocal chunk=loadstring(${f}(${d},${a},${k1v},${k2v}))\nif chunk then return chunk() else error("Load Failed") end`;
}

// ============================================
// MAIN EXPORT
// ============================================
export function obfuscate(source) {
  try {
    // Step 1: Tokenize
    const tokens = tokenize(source);
    console.log('Tokens:', tokens);
    
    // Step 2: Parse to AST
    const ast = parse(tokens);
    console.log('AST:', JSON.stringify(ast, null, 2));
    
    // Step 3: Validate AST
    if (!ast || !ast.body || !Array.isArray(ast.body.body)) {
      throw new Error('AST tidak valid: ' + JSON.stringify(ast));
    }
    
    // Step 4: Transform (rename variables)
    const transformed = transform(ast);
    
    // Step 5: Generate code
    let result = generate(transformed);
    console.log('Generated:', result);
    
    // Step 6: Post-obfuscation
    result = encryptStrings(result);
    result = obfuscateNumbers(result);
    
    // Step 7: Pack
    result = pack(result);
    
    return result;
  } catch (e) {
    console.error('Obfuscation error:', e);
    throw new Error('Obfuscation Error: ' + e.message);
  }
}
