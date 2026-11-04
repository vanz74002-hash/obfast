// ============================================
// OBFAST ENGINE v3.0 - FULL AST OBFUSCATOR
// Layers: AST Parse → Scope Rename → String Encrypt → 
//         Number Obf → Dead Code → Proxy → Pack
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
  'makefolder','delfolder','delfile','loadstring'
]);

const KEYWORDS = new Set([
  'and','break','do','else','elseif','end','false','for','function','if','in','local',
  'nil','not','or','repeat','return','then','true','until','while','continue','type',
  'export','typeof'
]);

// ============================================
// SECTION 1: TOKENIZER
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
        const endStr = ']' + '='.repeat(eq) + ']';
        let endIdx = src.indexOf(endStr, i + 4 + eq);
        endIdx = endIdx === -1 ? l : endIdx + endStr.length;
        tokens.push({t: 'comment', v: src.slice(i, endIdx)});
        i = endIdx; continue;
      }
    }
    
    // Line comment
    if (c === '-' && n === '-') {
      let end = src.indexOf('\n', i);
      tokens.push({t: 'comment', v: src.slice(i, end === -1 ? l : end)});
      i = end === -1 ? l : end; continue;
    }
    
    // Block string [=[ ]=]
    if (c === '[' && (n === '[' || n === '=')) {
      let eq = 0;
      while (src[i + 1 + eq] === '=') eq++;
      if (src[i + 1 + eq] === '[') {
        const endStr = ']' + '='.repeat(eq) + ']';
        let endIdx = src.indexOf(endStr, i + 2 + eq);
        endIdx = endIdx === -1 ? l : endIdx + endStr.length;
        tokens.push({t: 'string', v: src.slice(i, endIdx), raw: src.slice(i + 2 + eq, endIdx - 2 - eq), long: true});
        i = endIdx; continue;
      }
    }
    
    // Normal string
    if (c === '"' || c === "'") {
      const q = c; let j = i + 1, raw = '', hasEscape = false;
      while (j < l && src[j] !== q) {
        if (src[j] === '\\') {
          hasEscape = true;
          const esc = src[j+1];
          if (esc === 'n') { raw += '\n'; j += 2; }
          else if (esc === 't') { raw += '\t'; j += 2; }
          else if (esc === 'r') { raw += '\r'; j += 2; }
          else if (esc === '\\') { raw += '\\'; j += 2; }
          else if (esc === q) { raw += q; j += 2; }
          else if (esc === 'x' && j + 3 < l && /^[0-9a-fA-F]{2}$/.test(src.slice(j+2, j+4))) {
            raw += String.fromCharCode(parseInt(src.slice(j+2, j+4), 16)); j += 4;
          } else if (esc >= '0' && esc <= '9') {
            let numStr = esc, k = j + 2;
            while (k < l && src[k] >= '0' && src[k] <= '9' && numStr.length < 3) { numStr += src[k]; k++; }
            const code = parseInt(numStr, 10);
            if (code <= 255) { raw += String.fromCharCode(code); } else { hasEscape = true; raw += src.slice(j, k); }
            j = k;
          } else { raw += esc; j += 2; }
        } else {
          if (src.charCodeAt(j) > 255) hasEscape = true;
          raw += src[j]; j++;
        }
      }
      j++;
      tokens.push({t: 'string', v: src.slice(i, j), raw, skip: hasEscape || raw.length === 0});
      i = j; continue;
    }
    
    // Number
    if (/\d/.test(c) || (c === '.' && /\d/.test(n))) {
      let j = i;
      if (c === '0' && (n === 'x' || n === 'X')) {
        j += 2; while (j < l && /[0-9a-fA-F]/.test(src[j])) j++;
      } else if (c === '0' && (n === 'b' || n === 'B')) {
        j += 2; while (j < l && /[01]/.test(src[j])) j++;
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
      const w = src.slice(i, j);
      tokens.push({t: KEYWORDS.has(w) ? 'kw' : 'id', v: w});
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
      tokens.push({t: 'ws', v: src.slice(i, j)}); i = j; continue;
    }
    
    tokens.push({t: 'unk', v: c}); i++;
  }
  return tokens;
}

// ============================================
// SECTION 2: AST PARSER (Recursive Descent)
// ============================================
function parse(tokens) {
  let idx = 0;
  const peek = (offset = 0) => tokens[idx + offset];
  const eat = (type, value) => {
    const tk = tokens[idx];
    if (tk && tk.t === type && (!value || tk.v === value)) { idx++; return tk; }
    return null;
  };
  const expect = (type, value) => {
    const tk = eat(type, value);
    if (!tk) throw new Error(`Expected ${type} '${value || ''}', got '${tokens[idx]?.v || 'EOF'}' at token ${idx}`);
    return tk;
  };
  const skip = () => { while (tokens[idx] && (tokens[idx].t === 'ws' || tokens[idx].t === 'comment')) idx++; };

  function parseBlock(stopTokens = new Set()) {
    const stmts = [];
    skip();
    while (idx < tokens.length) {
      const tk = peek();
      if (!tk) break;
      if (tk.t === 'kw' && stopTokens.has(tk.v)) break;
      if (tk.t === 'kw' && tk.v === 'return') {
        stmts.push(parseReturn());
        break;
      }
      const stmt = parseStatement();
      if (stmt) stmts.push(stmt);
      skip();
    }
    return {type: 'Block', body: stmts};
  }

  function parseStatement() {
    skip();
    const tk = peek();
    if (!tk) return null;

    // Semicolon
    if (tk.t === 'op' && tk.v === ';') { idx++; return null; }

    // Local statement
    if (tk.t === 'kw' && tk.v === 'local') {
      idx++; skip();
      // local function name()
      if (peek() && peek().t === 'kw' && peek().v === 'function') {
        idx++; skip();
        const name = expect('id').v; skip();
        const params = parseParamList(); skip();
        const body = parseBlock(new Set(['end'])); skip();
        expect('kw', 'end');
        return {type: 'LocalFunction', name, params, body};
      }
      // local name [, name] [= expr [, expr]]
      const names = [];
      while (peek() && peek().t === 'id') {
        names.push(expect('id').v); skip();
        if (eat('op', ',')) skip(); else break;
      }
      let init = null;
      if (eat('op', '=')) {
        skip();
        init = parseExpressionList();
      }
      return {type: 'LocalStatement', names, init};
    }

    // Function declaration (global)
    if (tk.t === 'kw' && tk.v === 'function') {
      idx++; skip();
      const name = expect('id').v; skip();
      let method = null, isMethod = false;
      while (eat('op', '.')) { skip(); method = method ? method + '.' + expect('id').v : expect('id').v; skip(); }
      if (eat('op', ':')) { isMethod = true; skip(); method = (method ? method + ':' : '') + expect('id').v; skip(); }
      const params = parseParamList(); skip();
      const body = parseBlock(new Set(['end'])); skip();
      expect('kw', 'end');
      return {type: 'FunctionDeclaration', name, method, isMethod, params, body};
    }

    // If statement
    if (tk.t === 'kw' && tk.v === 'if') {
      idx++; skip();
      const clauses = [];
      clauses.push({cond: parseExpression(), body: parseBlock(new Set(['elseif', 'else', 'end']))});
      skip();
      while (peek() && peek().t === 'kw' && peek().v === 'elseif') {
        idx++; skip();
        clauses.push({cond: parseExpression(), body: parseBlock(new Set(['elseif', 'else', 'end']))});
        skip();
      }
      let elseBody = null;
      if (eat('kw', 'else')) { skip(); elseBody = parseBlock(new Set(['end'])); skip(); }
      expect('kw', 'end');
      return {type: 'IfStatement', clauses, elseBody};
    }

    // While statement
    if (tk.t === 'kw' && tk.v === 'while') {
      idx++; skip();
      const cond = parseExpression(); skip();
      expect('kw', 'do'); skip();
      const body = parseBlock(new Set(['end'])); skip();
      expect('kw', 'end');
      return {type: 'WhileStatement', cond, body};
    }

    // Repeat statement
    if (tk.t === 'kw' && tk.v === 'repeat') {
      idx++; skip();
      const body = parseBlock(new Set(['until'])); skip();
      expect('kw', 'until'); skip();
      const cond = parseExpression();
      return {type: 'RepeatStatement', body, cond};
    }

    // Do statement
    if (tk.t === 'kw' && tk.v === 'do') {
      idx++; skip();
      const body = parseBlock(new Set(['end'])); skip();
      expect('kw', 'end');
      return {type: 'DoStatement', body};
    }

    // For statement
    if (tk.t === 'kw' && tk.v === 'for') {
      idx++; skip();
      const varName = expect('id').v; skip();
      if (eat('op', '=')) {
        skip();
        const start = parseExpression(); skip(); expect('op', ','); skip();
        const end = parseExpression(); skip();
        let step = null;
        if (eat('op', ',')) { skip(); step = parseExpression(); skip(); }
        expect('kw', 'do'); skip();
        const body = parseBlock(new Set(['end'])); skip();
        expect('kw', 'end');
        return {type: 'NumericFor', varName, start, end, step, body};
      } else {
        const names = [varName];
        while (eat('op', ',')) { skip(); names.push(expect('id').v); skip(); }
        expect('kw', 'in'); skip();
        const iters = parseExpressionList(); skip();
        expect('kw', 'do'); skip();
        const body = parseBlock(new Set(['end'])); skip();
        expect('kw', 'end');
        return {type: 'GenericFor', names, iters, body};
      }
    }

    // Break
    if (tk.t === 'kw' && tk.v === 'break') { idx++; return {type: 'BreakStatement'}; }

    // Continue (Luau)
    if (tk.t === 'kw' && tk.v === 'continue') { idx++; return {type: 'ContinueStatement'}; }

    // Expression statement (assignment or call)
    const expr = parsePrefixExpression();
    skip();
    
    // Assignment
    if (eat('op', '=')) {
      skip();
      const targets = [expr];
      const values = parseExpressionList();
      return {type: 'AssignmentStatement', targets, values};
    }
    
    // Compound assignment (Luau: +=, -=, etc.)
    const compoundOps = {'+=': '+', '-=': '-', '*=': '*', '/=': '/', '%=': '%', '^=': '^', '..=': '..'};
    if (peek() && peek().t === 'op' && compoundOps[peek().v]) {
      const op = compoundOps[peek().v]; idx++; skip();
      const value = parseExpression();
      return {type: 'AssignmentStatement', targets: [expr], values: [{type: 'BinaryExpression', operator: op, left: expr, right: value}]};
    }
    
    // Call statement (if expr is a call)
    if (expr.type === 'CallExpression' || expr.type === 'MethodCallExpression') {
      return {type: 'CallStatement', expression: expr};
    }
    
    throw new Error(`Unexpected token '${tk.v}' at position ${idx}. Expected statement.`);
  }

  function parseReturn() {
    expect('kw', 'return'); skip();
    const values = [];
    if (peek() && peek().t !== 'kw') {
      values.push(...parseExpressionList());
    }
    return {type: 'ReturnStatement', values};
  }

  function parseParamList() {
    expect('op', '('); skip();
    const params = [];
    if (peek() && peek().t === 'id') {
      params.push(expect('id').v); skip();
      while (eat('op', ',')) { skip(); params.push(expect('id').v); skip(); }
    }
    if (eat('op', '...')) { params.push('...'); skip(); }
    expect('op', ')');
    return params;
  }

  function parseExpressionList() {
    const list = [parseExpression()]; skip();
    while (eat('op', ',')) { skip(); list.push(parseExpression()); skip(); }
    return list;
  }

  // Expression parsing with precedence climbing
  function parseExpression() { return parseOr(); }
  
  function parseOr() {
    let left = parseAnd(); skip();
    while (peek() && peek().t === 'kw' && peek().v === 'or') {
      idx++; skip();
      left = {type: 'BinaryExpression', operator: 'or', left, right: parseAnd()}; skip();
    }
    return left;
  }
  
  function parseAnd() {
    let left = parseComparison(); skip();
    while (peek() && peek().t === 'kw' && peek().v === 'and') {
      idx++; skip();
      left = {type: 'BinaryExpression', operator: 'and', left, right: parseComparison()}; skip();
    }
    return left;
  }
  
  function parseComparison() {
    let left = parseConcat(); skip();
    const ops = ['<', '>', '<=', '>=', '~=', '=='];
    while (peek() && peek().t === 'op' && ops.includes(peek().v)) {
      const op = peek().v; idx++; skip();
      left = {type: 'BinaryExpression', operator: op, left, right: parseConcat()}; skip();
    }
    return left;
  }
  
  function parseConcat() {
    let left = parseAdd(); skip();
    while (peek() && peek().t === 'op' && peek().v === '..') {
      idx++; skip();
      left = {type: 'BinaryExpression', operator: '..', left, right: parseAdd()}; skip();
    }
    return left;
  }
  
  function parseAdd() {
    let left = parseMul(); skip();
    while (peek() && peek().t === 'op' && (peek().v === '+' || peek().v === '-')) {
      const op = peek().v; idx++; skip();
      left = {type: 'BinaryExpression', operator: op, left, right: parseMul()}; skip();
    }
    return left;
  }
  
  function parseMul() {
    let left = parseUnary(); skip();
    while (peek() && peek().t === 'op' && (peek().v === '*' || peek().v === '/' || peek().v === '%' || peek().v === '^')) {
      const op = peek().v; idx++; skip();
      left = {type: 'BinaryExpression', operator: op, left, right: parseUnary()}; skip();
    }
    return left;
  }
  
  function parseUnary() {
    skip();
    if (peek() && peek().t === 'kw' && peek().v === 'not') { idx++; skip(); return {type: 'UnaryExpression', operator: 'not', argument: parseUnary()}; }
    if (peek() && peek().t === 'op' && peek().v === '#') { idx++; skip(); return {type: 'UnaryExpression', operator: '#', argument: parseUnary()}; }
    if (peek() && peek().t === 'op' && peek().v === '-') { idx++; skip(); return {type: 'UnaryExpression', operator: '-', argument: parseUnary()}; }
    return parsePrimary();
  }

  function parsePrimary() {
    skip();
    const tk = peek();
    if (!tk) throw new Error('Unexpected end of input');

    // Literals
    if (tk.t === 'number') { idx++; return {type: 'NumberLiteral', value: tk.v}; }
    if (tk.t === 'string') { idx++; return {type: 'StringLiteral', value: tk.v, raw: tk.raw, long: tk.long}; }
    if (tk.t === 'kw' && tk.v === 'nil') { idx++; return {type: 'NilLiteral'}; }
    if (tk.t === 'kw' && tk.v === 'true') { idx++; return {type: 'BooleanLiteral', value: true}; }
    if (tk.t === 'kw' && tk.v === 'false') { idx++; return {type: 'BooleanLiteral', value: false}; }
    if (tk.t === 'op' && tk.v === '...') { idx++; return {type: 'VarargLiteral'}; }

    // Function expression
    if (tk.t === 'kw' && tk.v === 'function') {
      idx++; skip();
      const params = parseParamList(); skip();
      const body = parseBlock(new Set(['end'])); skip();
      expect('kw', 'end');
      return {type: 'FunctionExpression', params, body};
    }

    // Table constructor
    if (tk.t === 'op' && tk.v === '{') {
      return parseTableConstructor();
    }

    // Parenthesized expression
    if (tk.t === 'op' && tk.v === '(') {
      idx++; skip();
      const expr = parseExpression(); skip();
      expect('op', ')');
      return expr;
    }

    // Prefix expression (identifier, call, member, index)
    if (tk.t === 'id' || tk.t === 'op') {
      return parsePrefixExpression();
    }

    throw new Error(`Unexpected token '${tk.v}' at position ${idx}`);
  }

  function parseTableConstructor() {
    expect('op', '{'); skip();
    const fields = [];
    while (peek() && !(peek().t === 'op' && peek().v === '}')) {
      skip();
      if (!peek() || (peek().t === 'op' && peek().v === '}')) break;
      
      // [expr] = expr
      if (peek().t === 'op' && peek().v === '[') {
        idx++; skip();
        const key = parseExpression(); skip();
        expect('op', ']'); skip();
        expect('op', '='); skip();
        const value = parseExpression();
        fields.push({type: 'TableKey', key, value});
      }
      // name = expr
      else if (peek().t === 'id' && peek(1) && peek(1).t === 'op' && peek(1).v === '=') {
        const key = expect('id').v; skip();
        expect('op', '='); skip();
        const value = parseExpression();
        fields.push({type: 'TableKeyString', key, value});
      }
      // expr (array value)
      else {
        const value = parseExpression();
        fields.push({type: 'TableValue', value});
      }
      skip();
      if (peek() && peek().t === 'op' && (peek().v === ',' || peek().v === ';')) { idx++; skip(); }
    }
    expect('op', '}');
    return {type: 'TableConstructorExpression', fields};
  }

  function parsePrefixExpression() {
    skip();
    let expr;
    const tk = peek();
    
    if (tk && tk.t === 'id') {
      expr = {type: 'Identifier', name: tk.v}; idx++;
    } else if (tk && tk.t === 'op' && tk.v === '(') {
      expr = parsePrimary();
    } else {
      throw new Error(`Expected identifier or '(', got '${tk?.v || 'EOF'}'`);
    }
    
    skip();
    // Apply suffixes
    while (true) {
      const next = peek();
      if (!next) break;
      
      if (next.t === 'op' && next.v === '.') {
        idx++; skip();
        const field = expect('id').v; skip();
        expr = {type: 'MemberExpression', base: expr, field};
      } else if (next.t === 'op' && next.v === ':') {
        idx++; skip();
        const method = expect('id').v; skip();
        const args = parseArguments(); skip();
        expr = {type: 'MethodCallExpression', base: expr, method, arguments: args};
      } else if (next.t === 'op' && next.v === '[') {
        idx++; skip();
        const index = parseExpression(); skip();
        expect('op', ']'); skip();
        expr = {type: 'IndexExpression', base: expr, index};
      } else if (next.t === 'op' && (next.v === '(' || next.v === '{') || (next.t === 'string')) {
        const args = parseArguments(); skip();
        expr = {type: 'CallExpression', base: expr, arguments: args};
      } else {
        break;
      }
    }
    
    return expr;
  }

  function parseArguments() {
    const tk = peek();
    if (tk.t === 'op' && tk.v === '(') {
      idx++; skip();
      const args = [];
      if (peek() && !(peek().t === 'op' && peek().v === ')')) {
        args.push(...parseExpressionList());
      }
      skip();
      expect('op', ')');
      return args;
    } else if (tk.t === 'op' && tk.v === '{') {
      return [parseTableConstructor()];
    } else if (tk.t === 'string') {
      idx++;
      return [{type: 'StringLiteral', value: tk.v, raw: tk.raw, long: tk.long}];
    }
    throw new Error(`Expected arguments, got '${tk.v}'`);
  }

  skip();
  const body = parseBlock();
  return {type: 'Program', body};
}

// ============================================
// SECTION 3: AST TRANSFORMER
// ============================================
function transform(ast, options = {}) {
  const {renameVariables = true, injectDeadCode = true, proxyFunctions = true} = options;
  
  let nameCounter = 0;
  const genName = () => {
    nameCounter++;
    return '_0x' + nameCounter.toString(16).toUpperCase().padStart(8, '0');
  };
  
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
    // Check scopes
    for (let i = scopeStack.length - 1; i >= 0; i--) {
      if (scopeStack[i].vars.has(name)) {
        if (!renameMap.has(name)) {
          renameMap.set(name, genName());
        }
        return renameMap.get(name);
      }
    }
    return name; // Global
  }
  
  function enterScope() { scopeStack.push({vars: new Set(), parent: scopeStack[scopeStack.length - 1]}); }
  function exitScope() { scopeStack.pop(); }

  function transformNode(node) {
    if (!node) return null;
    
    switch (node.type) {
      case 'Program':
        node.body = node.body.map(transformNode);
        return node;
      
      case 'Block':
        enterScope();
        // Pre-scan for local declarations
        for (const stmt of node.body) {
          if (stmt.type === 'LocalStatement') {
            for (const name of stmt.names) declareVar(name);
          } else if (stmt.type === 'LocalFunction') {
            declareVar(stmt.name);
          } else if (stmt.type === 'FunctionDeclaration' && !stmt.name.includes('.')) {
            // Global function, don't rename
          }
        }
        node.body = node.body.map(transformNode);
        exitScope();
        return node;
      
      case 'LocalStatement':
        for (let i = 0; i < node.names.length; i++) {
          const oldName = node.names[i];
          if (!GLOBALS.has(oldName)) {
            const newName = declareVar(oldName);
            node.names[i] = newName;
            renameMap.set(oldName, newName);
          }
        }
        if (node.init) node.init = node.init.map(transformNode);
        return node;
      
      case 'LocalFunction':
        if (!GLOBALS.has(node.name)) {
          const newName = declareVar(node.name);
          node.name = newName;
          renameMap.set(node.name, newName);
        }
        enterScope();
        for (const p of node.params) { if (p !== '...') declareVar(p); }
        node.body = transformNode(node.body);
        exitScope();
        return node;
      
      case 'FunctionDeclaration':
        // Don't rename global functions
        enterScope();
        for (const p of node.params) { if (p !== '...') declareVar(p); }
        node.body = transformNode(node.body);
        exitScope();
        return node;
      
      case 'FunctionExpression':
        enterScope();
        for (const p of node.params) { if (p !== '...') declareVar(p); }
        node.body = transformNode(node.body);
        exitScope();
        return node;
      
      case 'Identifier':
        if (renameVariables && !GLOBALS.has(node.name)) {
          node.name = resolveVar(node.name);
        }
        return node;
      
      case 'MemberExpression':
        node.base = transformNode(node.base);
        // Don't rename field
        return node;
      
      case 'IndexExpression':
        node.base = transformNode(node.base);
        node.index = transformNode(node.index);
        return node;
      
      case 'CallExpression':
        node.base = transformNode(node.base);
        node.arguments = node.arguments.map(transformNode);
        return node;
      
      case 'MethodCallExpression':
        node.base = transformNode(node.base);
        // Don't rename method
        node.arguments = node.arguments.map(transformNode);
        return node;
      
      case 'BinaryExpression':
        node.left = transformNode(node.left);
        node.right = transformNode(node.right);
        return node;
      
      case 'UnaryExpression':
        node.argument = transformNode(node.argument);
        return node;
      
      case 'TableConstructorExpression':
        node.fields = node.fields.map(f => {
          if (f.type === 'TableKey') {
            f.key = transformNode(f.key);
            f.value = transformNode(f.value);
          } else if (f.type === 'TableKeyString') {
            // Don't rename key string
            f.value = transformNode(f.value);
          } else if (f.type === 'TableValue') {
            f.value = transformNode(f.value);
          }
          return f;
        });
        return node;
      
      case 'IfStatement':
        node.clauses = node.clauses.map(c => ({cond: transformNode(c.cond), body: transformNode(c.body)}));
        if (node.elseBody) node.elseBody = transformNode(node.elseBody);
        return node;
      
      case 'WhileStatement':
      case 'RepeatStatement':
        node.cond = transformNode(node.cond);
        node.body = transformNode(node.body);
        return node;
      
      case 'NumericFor':
        enterScope();
        declareVar(node.varName);
        node.varName = resolveVar(node.varName);
        node.start = transformNode(node.start);
        node.end = transformNode(node.end);
        if (node.step) node.step = transformNode(node.step);
        node.body = transformNode(node.body);
        exitScope();
        return node;
      
      case 'GenericFor':
        enterScope();
        for (const n of node.names) declareVar(n);
        node.names = node.names.map(n => resolveVar(n));
        node.iters = node.iters.map(transformNode);
        node.body = transformNode(node.body);
        exitScope();
        return node;
      
      case 'DoStatement':
        node.body = transformNode(node.body);
        return node;
      
      case 'AssignmentStatement':
        node.targets = node.targets.map(transformNode);
        node.values = node.values.map(transformNode);
        return node;
      
      case 'CallStatement':
        node.expression = transformNode(node.expression);
        return node;
      
      case 'ReturnStatement':
        node.values = node.values.map(transformNode);
        return node;
      
      default:
        return node;
    }
  }

  let result = transformNode(ast);
  
  // Inject dead code at safe positions (after blocks)
  if (injectDeadCode && result.body && result.body.body) {
    const deadSnippets = [
      {type: 'LocalStatement', names: ['_0xdead_' + Math.random().toString(16).slice(2, 6)], init: [{type: 'NumberLiteral', value: String(Math.floor(Math.random() * 1000))}]},
      {type: 'LocalStatement', names: ['_0xdead_' + Math.random().toString(16).slice(2, 6)], init: [{type: 'StringLiteral', value: '"' + Math.random().toString(16).slice(2, 10) + '"', raw: Math.random().toString(16).slice(2, 10)}]},
    ];
    // Insert at beginning
    for (let i = deadSnippets.length - 1; i >= 0; i--) {
      result.body.body.unshift(deadSnippets[i]);
    }
  }
  
  // Add proxy functions
  if (proxyFunctions) {
    const proxies = [
      {type: 'LocalStatement', names: ['_0xprint'], init: [{type: 'Identifier', name: 'print'}]},
      {type: 'LocalStatement', names: ['_0xtostring'], init: [{type: 'Identifier', name: 'tostring'}]},
      {type: 'LocalStatement', names: ['_0xtype'], init: [{type: 'Identifier', name: 'type'}]},
    ];
    for (let i = proxies.length - 1; i >= 0; i--) {
      result.body.body.unshift(proxies[i]);
    }
  }
  
  return result;
}

// ============================================
// SECTION 4: CODE GENERATOR
// ============================================
function generate(ast) {
  function gen(node) {
    if (!node) return '';
    switch (node.type) {
      case 'Program': return node.body ? gen(node.body) : '';
      case 'Block': return node.body.map(gen).join('\n');
      
      case 'LocalStatement':
        return 'local ' + node.names.join(', ') + (node.init && node.init.length ? ' = ' + node.init.map(gen).join(', ') : '');
      
      case 'LocalFunction':
        return `local function ${node.name}(${node.params.join(', ')})\n${gen(node.body)}\nend`;
      
      case 'FunctionDeclaration':
        const funcName = node.method ? (node.name + (node.isMethod ? ':' : '.') + node.method) : node.name;
        return `function ${funcName}(${node.params.join(', ')})\n${gen(node.body)}\nend`;
      
      case 'FunctionExpression':
        return `function(${node.params.join(', ')})\n${gen(node.body)}\nend`;
      
      case 'IfStatement':
        let s = `if ${gen(node.clauses[0].cond)} then\n${gen(node.clauses[0].body)}`;
        for (let i = 1; i < node.clauses.length; i++) {
          s += `\nelseif ${gen(node.clauses[i].cond)} then\n${gen(node.clauses[i].body)}`;
        }
        if (node.elseBody) s += `\nelse\n${gen(node.elseBody)}`;
        return s + '\nend';
      
      case 'WhileStatement': return `while ${gen(node.cond)} do\n${gen(node.body)}\nend`;
      case 'RepeatStatement': return `repeat\n${gen(node.body)}\nuntil ${gen(node.cond)}`;
      case 'DoStatement': return `do\n${gen(node.body)}\nend`;
      
      case 'NumericFor':
        return `for ${node.varName} = ${gen(node.start)}, ${gen(node.end)}${node.step ? ', ' + gen(node.step) : ''} do\n${gen(node.body)}\nend`;
      
      case 'GenericFor':
        return `for ${node.names.join(', ')} in ${node.iters.map(gen).join(', ')} do\n${gen(node.body)}\nend`;
      
      case 'ReturnStatement': return 'return ' + node.values.map(gen).join(', ');
      case 'BreakStatement': return 'break';
      case 'ContinueStatement': return 'continue';
      
      case 'AssignmentStatement':
        return node.targets.map(gen).join(', ') + ' = ' + node.values.map(gen).join(', ');
      
      case 'CallStatement': return gen(node.expression);
      
      case 'BinaryExpression': return `${gen(node.left)} ${node.operator} ${gen(node.right)}`;
      case 'UnaryExpression': return `${node.operator}${gen(node.argument)}`;
      
      case 'CallExpression': return `${gen(node.base)}(${node.arguments.map(gen).join(', ')})`;
      case 'MethodCallExpression': return `${gen(node.base)}:${node.method}(${node.arguments.map(gen).join(', ')})`;
      case 'MemberExpression': return `${gen(node.base)}.${node.field}`;
      case 'IndexExpression': return `${gen(node.base)}[${gen(node.index)}]`;
      
      case 'Identifier': return node.name;
      case 'NumberLiteral': return node.value;
      case 'StringLiteral': return node.value;
      case 'BooleanLiteral': return node.value ? 'true' : 'false';
      case 'NilLiteral': return 'nil';
      case 'VarargLiteral': return '...';
      
      case 'TableConstructorExpression':
        const fields = node.fields.map(f => {
          if (f.type === 'TableKey') return `[${gen(f.key)}] = ${gen(f.value)}`;
          if (f.type === 'TableKeyString') return `${f.key} = ${gen(f.value)}`;
          return gen(f.value);
        });
        return '{' + fields.join(', ') + '}';
      
      default: return '';
    }
  }
  return gen(ast);
}

// ============================================
// SECTION 5: POST-AST OBFUSCATION
// ============================================
function obfuscateStrings(source) {
  // Replace string literals with XOR-encoded byte arrays
  return source.replace(/(["'])(?:(?!\1|\\).|\\.)*\1/g, match => {
    if (match.length < 4) return match; // Skip tiny strings
    const quote = match[0];
    const raw = match.slice(1, -1);
    if (raw.includes('\\')) return match; // Skip escaped strings
    
    const key = Math.floor(Math.random() * 254) + 1;
    const bytes = [];
    for (let i = 0; i < raw.length; i++) {
      bytes.push(raw.charCodeAt(i) ^ ((key + i) % 256));
    }
    return `_0xSTR({${bytes.join(',')}},${key})`;
  });
}

function obfuscateNumbers(source) {
  return source.replace(/\b(\d+)\b/g, (match, numStr) => {
    const num = parseInt(numStr);
    if (num < 0 || num > 65535) return match;
    const high = Math.floor(num / 256), low = num % 256;
    const noise = Math.floor(Math.random() * 254) + 1;
    return `bit32.bor(bit32.lshift(bit32.bxor(${high ^ noise},${noise}),8),${low})`;
  });
}

// ============================================
// SECTION 6: PACKER
// ============================================
function pack(source) {
  const bytes = new TextEncoder().encode(source);
  const k1 = Math.floor(Math.random() * 200) + 50;
  const k2 = Math.floor(Math.random() * 200) + 50;
  const enc = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) enc[i] = bytes[i] ^ ((k1 * (i + 1) + k2) % 256);
  
  const base = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const alpha = base.split('');
  for (let i = alpha.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [alpha[i], alpha[j]] = [alpha[j], alpha[i]];
  }
  const alp = alpha.join('');
  
  let b64 = '';
  for (let i = 0; i < enc.length; i += 3) {
    const b1 = enc[i], b2 = i + 1 < enc.length ? enc[i + 1] : 0, b3 = i + 2 < enc.length ? enc[i + 2] : 0;
    b64 += alp[b1 >> 2] + alp[((b1 & 3) << 4) | (b2 >> 4)] + 
           (i + 1 < enc.length ? alp[((b2 & 15) << 2) | (b3 >> 6)] : '') + 
           (i + 2 < enc.length ? alp[b3 & 63] : '');
  }
  
  const d = '_0xD_' + Math.random().toString(16).slice(2, 6).toUpperCase();
  const a = '_0xA_' + Math.random().toString(16).slice(2, 6).toUpperCase();
  const k1v = '_0xK1_' + Math.random().toString(16).slice(2, 6).toUpperCase();
  const k2v = '_0xK2_' + Math.random().toString(16).slice(2, 6).toUpperCase();
  const f = '_0xF_' + Math.random().toString(16).slice(2, 6).toUpperCase();
  
  return `local ${d}="${b64}"\nlocal ${a}="${alp}"\nlocal ${k1v}=${k1}\nlocal ${k2v}=${k2}\nlocal function ${f}(data,alpha,key1,key2)\nlocal b={}\nfor i=1,#data,4 do\nlocal c1=alpha:find(data:sub(i,i),1,1) or 1\nlocal c2=alpha:find(data:sub(i+1,i+1),1,1) or 1\nlocal c3=i+2<=#data and (alpha:find(data:sub(i+2,i+2),1,1) or 1)\nlocal c4=i+3<=#data and (alpha:find(data:sub(i+3,i+3),1,1) or 1)\nc1,c2,c3,c4=c1-1,c2-1,c3-1,c4-1\nb[#b+1]=c1*4+math.floor(c2/16)\nif i+2<=#data then b[#b+1]=(c2%16)*16+math.floor(c3/4) end\nif i+3<=#data then b[#b+1]=(c3%4)*64+c4 end\nend\nlocal s=""\nfor i=1,#b do s=s..string.char(bit32.bxor(b[i],(key1*i+key2)%256)) end\nreturn s\nend\nlocal _0xSTR=function(t,k)local r={}for i=1,#t do r[i]=string.char(bit32.bxor(t[i],(k+i-1)%256))end return table.concat(r)end\nlocal chunk=loadstring(${f}(${d},${a},${k1v},${k2v}))\nif chunk then return chunk() else error("Load Failed") end`;
}

// ============================================
// SECTION 7: MAIN EXPORT
// ============================================
export function obfuscate(source, options = {}) {
  try {
    // 1. Tokenize
    const tokens = tokenize(source);
    
    // 2. Parse to AST
    const ast = parse(tokens);
    
    // 3. Transform AST (variable renaming, etc.)
    const transformed = transform(ast, options);
    
    // 4. Generate source from AST
    let result = generate(transformed);
    
    // 5. Post-AST obfuscation
    if (options.encryptStrings !== false) {
      result = obfuscateStrings(result);
    }
    if (options.obfuscateNumbers !== false) {
      result = obfuscateNumbers(result);
    }
    
    // 6. Pack
    if (options.packFinal !== false) {
      result = pack(result);
    }
    
    return result;
  } catch (e) {
    throw new Error('Obfuscation Error: ' + e.message);
  }
}
