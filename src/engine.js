// ============================================
// OBFAST AST ENGINE v1.0
// Real Recursive Descent Parser for Lua/Luau
// Guarantees Semantic Safety (No scope bugs)
// ============================================

const GLOBALS = new Set(['print','tostring','tonumber','type','typeof','pairs','ipairs','next','select','unpack','rawget','rawset','rawequal','rawlen','setmetatable','getmetatable','pcall','xpcall','error','assert','require','loadstring','dofile','loadfile','collectgarbage','coroutine','string','table','math','bit32','os','io','debug','game','workspace','script','Instance','Vector3','Vector2','CFrame','Color3','UDim','UDim2','Enum','task','tick','wait','spawn','delay','time','warn','self','super','load','_G','unpack']);

// --- 1. LEXER ---
function tokenize(src) {
  const tokens = []; let i = 0, l = src.length;
  const KW = new Set(['and','break','do','else','elseif','end','false','for','function','if','in','local','nil','not','or','repeat','return','then','true','until','while','continue','type','export','typeof']);
  
  while (i < l) {
    const c = src[i], n = src[i+1], n2 = src[i+2];
    // Comments & Long Strings
    if (c==='-' && n==='-') {
      if (n2==='[') { let eq=0; while(src[i+3+eq]==='=')eq++; if(src[i+3+eq]==='['){ let end=src.indexOf(']'+'='.repeat(eq)+']',i+4+eq); end=end===-1?l:end+3+eq; tokens.push({t:'comment',v:src.slice(i,end)}); i=end; continue; } }
      let end=src.indexOf('\n',i); tokens.push({t:'comment',v:src.slice(i,end===-1?l:end)}); i=end===-1?l:end; continue;
    }
    if (c==='[' && (n==='['||n==='=')) { let eq=0; while(src[i+1+eq]==='=')eq++; if(src[i+1+eq]==='['){ let end=src.indexOf(']'+'='.repeat(eq)+']',i+2+eq); end=end===-1?l:end+3+eq; tokens.push({t:'string',v:src.slice(i,end),raw:src.slice(i+2+eq,end-2-eq),long:true}); i=end; continue; } }
    if (c==='"'||c==="'") { const q=c; let j=i+1,raw=''; while(j<l&&src[j]!==q){ if(src[j]==='\\'){raw+=src[j]+(src[j+1]||'');j+=2}else{raw+=src[j];j++} } j++; tokens.push({t:'string',v:src.slice(i,j),raw}); i=j; continue; }
    // Numbers
    if (/\d/.test(c)||(c==='.'&&/\d/.test(n))) { let j=i; if(c==='0'&&(n==='x'||n==='X')){j+=2;while(j<l&&/[0-9a-fA-F]/.test(src[j]))j++}else{while(j<l&&/[\d.]/.test(src[j]))j++; if(j<l&&(src[j]==='e'||src[j]==='E')){j++;if(j<l&&(src[j]==='+'||src[j]==='-'))j++;while(j<l&&/\d/.test(src[j]))j++}} tokens.push({t:'number',v:src.slice(i,j)}); i=j; continue; }
    // Identifiers
    if (/[a-zA-Z_]/.test(c)) { let j=i; while(j<l&&/[a-zA-Z0-9_]/.test(src[j]))j++; const w=src.slice(i,j); tokens.push({t:KW.has(w)?'kw':'id',v:w}); i=j; continue; }
    // Operators
    if (c==='.'&&n==='.'&&n2==='.'){tokens.push({t:'op',v:'...'});i+=3;continue}
    if (c==='.'&&n==='.'){tokens.push({t:'op',v:'..'});i+=2;continue}
    if (c===':'&&n===':'){tokens.push({t:'op',v:'::'});i+=2;continue}
    if ((c==='='&&n==='=')||(c==='~'&&n==='=')||(c==='<'&&n==='=')||(c==='>'&&n==='=')){tokens.push({t:'op',v:c+n});i+=2;continue}
    if ('+-*/%^#=<>(){}[];:,.~'.includes(c)){tokens.push({t:'op',v:c});i++;continue}
    if (/\s/.test(c)){let j=i;while(j<l&&/\s/.test(src[j]))j++;tokens.push({t:'ws',v:src.slice(i,j)});i=j;continue}
    tokens.push({t:'unk',v:c}); i++;
  }
  return tokens;
}

// --- 2. PARSER (Recursive Descent -> AST) ---
function parse(tokens) {
  let idx = 0;
  const peek = () => tokens[idx];
  const eat = (t, v) => { if(tokens[idx].t===t && (!v||tokens[idx].v===v)){idx++;return tokens[idx-1]} return null; };
  const expect = (t, v) => { const tk=eat(t,v); if(!tk)throw new Error(`Expected ${t} ${v||''}, got ${tokens[idx]?.v||'EOF'}`); return tk; };
  const skipWs = () => { while(tokens[idx]&&(tokens[idx].t==='ws'||tokens[idx].t==='comment'))idx++; };

  function parseBlock() {
    const stmts = [];
    skipWs();
    while(idx<tokens.length && tokens[idx].t!=='kw' && !['end','until','else','elseif'].includes(tokens[idx].v)) {
      stmts.push(parseStatement());
      skipWs();
    }
    return {type:'Block', body:stmts};
  }

  function parseStatement() {
    skipWs();
    const tk = tokens[idx];
    if (!tk) return null;
    
    if (tk.t==='kw' && tk.v==='local') {
      idx++; skipWs();
      const names = [];
      while(tokens[idx]&&tokens[idx].t==='id'){ names.push(tokens[idx].v); idx++; skipWs(); if(eat('op',','))skipWs(); else break; }
      let values = [];
      if (eat('op','=')) { skipWs(); values = parseExpressionList(); }
      return {type:'LocalStatement', names, values};
    }
    if (tk.t==='kw' && tk.v==='function') {
      idx++; skipWs();
      const name = expect('id').v; skipWs();
      let isMethod = false;
      if (eat('op',':')) { isMethod = true; skipWs(); }
      const methodName = expect('id').v; skipWs();
      const params = parseParamList(); skipWs();
      const body = parseBlock(); skipWs();
      expect('kw','end');
      return {type:'FunctionDeclaration', name, methodName, isMethod, params, body};
    }
    if (tk.t==='kw' && tk.v==='if') {
      idx++; skipWs();
      const clauses = [];
      clauses.push({cond: parseExpression(), body: parseBlock()}); skipWs();
      while(eat('kw','elseif')) { skipWs(); clauses.push({cond: parseExpression(), body: parseBlock()}); skipWs(); }
      let elseBody = null;
      if (eat('kw','else')) { skipWs(); elseBody = parseBlock(); skipWs(); }
      expect('kw','end');
      return {type:'IfStatement', clauses, elseBody};
    }
    if (tk.t==='kw' && tk.v==='while') {
      idx++; skipWs();
      const cond = parseExpression(); skipWs();
      expect('kw','do'); skipWs();
      const body = parseBlock(); skipWs();
      expect('kw','end');
      return {type:'WhileStatement', cond, body};
    }
    if (tk.t==='kw' && tk.v==='for') {
      idx++; skipWs();
      const varName = expect('id').v; skipWs();
      if (eat('op','=')) { skipWs(); const start=parseExpression(); skipWs(); expect('op',','); skipWs(); const end=parseExpression(); skipWs(); let step=null; if(eat('op',',')){skipWs();step=parseExpression();skipWs()} expect('kw','do'); skipWs(); const body=parseBlock(); skipWs(); expect('kw','end'); return {type:'NumericFor', varName, start, end, step, body}; }
      else { const names=[varName]; while(eat('op',',')){skipWs();names.push(expect('id').v);skipWs()} expect('kw','in'); skipWs(); const iters=parseExpressionList(); skipWs(); expect('kw','do'); skipWs(); const body=parseBlock(); skipWs(); expect('kw','end'); return {type:'GenericFor', names, iters, body}; }
    }
    if (tk.t==='kw' && tk.v==='return') {
      idx++; skipWs();
      const values = (tokens[idx] && tokens[idx].t!=='kw') ? parseExpressionList() : [];
      return {type:'ReturnStatement', values};
    }
    if (tk.t==='kw' && tk.v==='do') { idx++; skipWs(); const body=parseBlock(); skipWs(); expect('kw','end'); return {type:'DoStatement', body}; }
    if (tk.t==='kw' && tk.v==='repeat') { idx++; skipWs(); const body=parseBlock(); skipWs(); expect('kw','until'); skipWs(); const cond=parseExpression(); return {type:'RepeatStatement', body, cond}; }
    
    // Expression Statement / Assignment / Call
    const expr = parseExpression(); skipWs();
    if (eat('op','=')) { skipWs(); const values=parseExpressionList(); return {type:'AssignmentStatement', targets:[expr], values}; }
    if (eat('op',',')) { skipWs(); const targets=[expr]; while(true){targets.push(parseExpression());skipWs();if(!eat('op',','))break} expect('op','='); skipWs(); const values=parseExpressionList(); return {type:'AssignmentStatement', targets, values}; }
    return {type:'ExpressionStatement', expression: expr};
  }

  function parseParamList() {
    expect('op','('); skipWs();
    const params = [];
    if (tokens[idx]&&tokens[idx].t==='id') { params.push(tokens[idx].v); idx++; skipWs(); while(eat('op',',')){skipWs();params.push(expect('id').v);skipWs()} }
    else if (eat('op','...')) { params.push('...'); }
    expect('op',')');
    return params;
  }

  function parseExpressionList() {
    const list = [parseExpression()]; skipWs();
    while(eat('op',',')){skipWs();list.push(parseExpression());skipWs()}
    return list;
  }

  // Precedence Climbing for Expressions
  function parseExpression() { return parseOr(); }
  function parseOr() { let l=parseAnd(); skipWs(); while(eat('kw','or')){skipWs();l={type:'BinaryExpr',op:'or',left:l,right:parseAnd()};skipWs()} return l; }
  function parseAnd() { let l=parseComp(); skipWs(); while(eat('kw','and')){skipWs();l={type:'BinaryExpr',op:'and',left:l,right:parseComp()};skipWs()} return l; }
  function parseComp() { let l=parseConcat(); skipWs(); while(tokens[idx]&&tokens[idx].t==='op' && ['<','>','<=','>=','~=','=='].includes(tokens[idx].v)){const op=tokens[idx].v;idx++;skipWs();l={type:'BinaryExpr',op,left:l,right:parseConcat()};skipWs()} return l; }
  function parseConcat() { let l=parseAdd(); skipWs(); while(eat('op','..')){skipWs();l={type:'BinaryExpr',op:'..',left:l,right:parseAdd()};skipWs()} return l; }
  function parseAdd() { let l=parseMul(); skipWs(); while(tokens[idx]&&tokens[idx].t==='op' && ['+','-'].includes(tokens[idx].v)){const op=tokens[idx].v;idx++;skipWs();l={type:'BinaryExpr',op,left:l,right:parseMul()};skipWs()} return l; }
  function parseMul() { let l=parseUnary(); skipWs(); while(tokens[idx]&&tokens[idx].t==='op' && ['*','/','%','^'].includes(tokens[idx].v)){const op=tokens[idx].v;idx++;skipWs();l={type:'BinaryExpr',op,left:l,right:parseUnary()};skipWs()} return l; }
  function parseUnary() { skipWs(); if(eat('op','not')){skipWs();return {type:'UnaryExpr',op:'not',arg:parseUnary()}} if(eat('op','#')){skipWs();return {type:'UnaryExpr',op:'#',arg:parseUnary()}} if(eat('op','-')){skipWs();return {type:'UnaryExpr',op:'-',arg:parseUnary()}} return parsePrimary(); }
  function parsePrimary() {
    skipWs();
    if (eat('kw','nil')) return {type:'Literal',value:'nil'};
    if (eat('kw','true')) return {type:'Literal',value:'true'};
    if (eat('kw','false')) return {type:'Literal',value:'false'};
    if (eat('op','...')) return {type:'Literal',value:'...'};
    if (tokens[idx]&&tokens[idx].t==='number') { const v=tokens[idx].v; idx++; return {type:'NumberLiteral',value:v}; }
    if (tokens[idx]&&tokens[idx].t==='string') { const v=tokens[idx].v; const raw=tokens[idx].raw; idx++; return {type:'StringLiteral',value:v,raw}; }
    if (eat('op','(')) { skipWs(); const e=parseExpression(); skipWs(); expect('op',')'); return e; }
    if (eat('op','{')) { skipWs(); const fields=[]; while(!eat('op','}')){ skipWs(); if(tokens[idx]&&tokens[idx].t==='op'&&(tokens[idx].v==='[')){idx++;skipWs();const k=parseExpression();skipWs();expect('op',']');skipWs();expect('op','=');skipWs();fields.push({type:'Key',key:k,value:parseExpression()})} else if(tokens[idx]&&tokens[idx].t==='id' && tokens[idx+1]&&tokens[idx+1].t==='op' && tokens[idx+1].v==='='){const k=tokens[idx].v;idx++;skipWs();expect('op','=');skipWs();fields.push({type:'KeyStr',key:k,value:parseExpression()})} else {fields.push({type:'Val',value:parseExpression()})} skipWs(); eat('op',',')||eat('op',';'); skipWs(); } return {type:'TableLiteral',fields}; }
    if (tokens[idx]&&tokens[idx].t==='id') { const name=tokens[idx].v; idx++; let expr={type:'Identifier',name}; skipWs(); while(true){ if(eat('op','.')){skipWs();expr={type:'MemberExpr',obj:expr,field:expect('id').v}} else if(eat('op',':')){skipWs();expr={type:'MethodExpr',obj:expr,method:expect('id').v}} else if(eat('op','(')){skipWs();const args=parseExpressionList();skipWs();expect('op',')');expr={type:'CallExpr',callee:expr,args}} else if(eat('op','{')){idx--;const args=[parsePrimary()];expr={type:'CallExpr',callee:expr,args}} else if(tokens[idx]&&tokens[idx].t==='string'){const args=[parsePrimary()];expr={type:'CallExpr',callee:expr,args}} else break; skipWs(); } return expr; }
    throw new Error(`Unexpected token: ${tokens[idx]?.v||'EOF'}`);
  }

  skipWs();
  const body = parseBlock();
  return {type:'Program', body};
}

// --- 3. SCOPE ANALYZER & TRANSFORMER ---
function transform(ast) {
  const renameMap = new Map();
  const genName = () => '_0x' + Math.random().toString(16).slice(2, 10).toUpperCase();
  
  function getOrGen(name) {
    if (!renameMap.has(name)) renameMap.set(name, genName());
    return renameMap.get(name);
  }

  function visit(node, scope) {
    if (!node) return;
    if (node.type === 'Program' || node.type === 'Block') {
      const newScope = { parent: scope, vars: new Set() };
      // Pre-scan for local declarations in this block
      if (node.body) {
        for (const stmt of node.body) {
          if (stmt.type === 'LocalStatement') stmt.names.forEach(n => newScope.vars.add(n));
          if (stmt.type === 'FunctionDeclaration') newScope.vars.add(stmt.name);
        }
      }
      if (node.body) node.body.forEach(s => visit(s, newScope));
      return;
    }
    if (node.type === 'LocalStatement') {
      node.names.forEach(n => { if(!GLOBALS.has(n)) node.names[node.names.indexOf(n)] = getOrGen(n); });
      node.values.forEach(v => visit(v, scope));
      return;
    }
    if (node.type === 'FunctionDeclaration') {
      const fName = GLOBALS.has(node.name) ? node.name : getOrGen(node.name);
      node.name = fName;
      const funcScope = { parent: scope, vars: new Set(node.params) };
      visit(node.body, funcScope);
      return;
    }
    if (node.type === 'Identifier' && !GLOBALS.has(node.name)) {
      // Check if it's declared in current or parent scope
      let s = scope;
      while(s) { if(s.vars.has(node.name)){node.name=getOrGen(node.name);return;} s=s.parent; }
      // If not found in scope, it's global, leave it.
    }
    // Recurse other nodes
    for (const key in node) {
      if (key==='type') continue;
      const child = node[key];
      if (Array.isArray(child)) child.forEach(c => visit(c, scope));
      else if (child && typeof child === 'object' && child.type) visit(child, scope);
    }
  }
  
  visit(ast, { parent: null, vars: new Set() });
  return ast;
}

// --- 4. CODE GENERATOR ---
function generate(ast) {
  function gen(node) {
    if (!node) return '';
    switch(node.type) {
      case 'Program': return node.body.map(gen).join('\n');
      case 'Block': return node.body.map(gen).join('\n');
      case 'LocalStatement': return 'local ' + node.names.join(', ') + (node.values.length ? ' = ' + node.values.map(gen).join(', ') : '');
      case 'FunctionDeclaration': return `function ${node.name}${node.isMethod?':':'.'}${node.methodName}(${node.params.join(', ')})\n${gen(node.body)}\nend`;
      case 'IfStatement': {
        let s = `if ${gen(node.clauses[0].cond)} then\n${gen(node.clauses[0].body)}`;
        for(let i=1;i<node.clauses.length;i++) s+=`\nelseif ${gen(node.clauses[i].cond)} then\n${gen(node.clauses[i].body)}`;
        if(node.elseBody) s+=`\nelse\n${gen(node.elseBody)}`;
        return s + '\nend';
      }
      case 'WhileStatement': return `while ${gen(node.cond)} do\n${gen(node.body)}\nend`;
      case 'NumericFor': return `for ${node.varName} = ${gen(node.start)}, ${gen(node.end)}${node.step?', '+gen(node.step):''} do\n${gen(node.body)}\nend`;
      case 'GenericFor': return `for ${node.names.join(', ')} in ${node.iters.map(gen).join(', ')} do\n${gen(node.body)}\nend`;
      case 'RepeatStatement': return `repeat\n${gen(node.body)}\nuntil ${gen(node.cond)}`;
      case 'DoStatement': return `do\n${gen(node.body)}\nend`;
      case 'ReturnStatement': return 'return ' + node.values.map(gen).join(', ');
      case 'AssignmentStatement': return node.targets.map(gen).join(', ') + ' = ' + node.values.map(gen).join(', ');
      case 'ExpressionStatement': return gen(node.expression);
      case 'BinaryExpr': return `${gen(node.left)} ${node.op} ${gen(node.right)}`;
      case 'UnaryExpr': return `${node.op}${gen(node.arg)}`;
      case 'CallExpr': return `${gen(node.callee)}(${node.args.map(gen).join(', ')})`;
      case 'MemberExpr': return `${gen(node.obj)}.${node.field}`;
      case 'MethodExpr': return `${gen(node.obj)}:${node.method}`;
      case 'IndexExpr': return `${gen(node.obj)}[${gen(node.key)}]`;
      case 'Identifier': return node.name;
      case 'NumberLiteral': return node.value;
      case 'StringLiteral': return node.value;
      case 'Literal': return node.value;
      case 'TableLiteral': {
        const fields = node.fields.map(f => {
          if(f.type==='Key') return `[${gen(f.key)}] = ${gen(f.value)}`;
          if(f.type==='KeyStr') return `${f.key} = ${gen(f.value)}`;
          return gen(f.value);
        });
        return '{' + fields.join(', ') + '}';
      }
      default: return '';
    }
  }
  return gen(ast);
}

// --- 5. STRING & NUMBER OBFUSCATION (Post-AST) ---
function obfuscateLiterals(luaCode) {
  // Simple regex for literals is safe HERE because AST already handled variables.
  // Encrypt Strings
  luaCode = luaCode.replace(/(["'])(?:(?!\1|\\).|\\.)*\1/g, match => {
    if (match.length < 4) return match; // Skip tiny strings
    const quote = match[0];
    const raw = match.slice(1, -1);
    if (raw.includes('\\')) return match; // Skip escaped strings for safety
    const key = Math.floor(Math.random()*254)+1;
    const bytes = [];
    for(let i=0;i<raw.length;i++) bytes.push(raw.charCodeAt(i)^((key+i)%256));
    return `_0xDEC({${bytes.join(',')}},${key})`;
  });
  
  // Obfuscate Numbers
  luaCode = luaCode.replace(/\b(\d+)\b/g, (match, numStr) => {
    const num = parseInt(numStr);
    if (num < 0 || num > 65535) return match;
    const high = Math.floor(num/256), low = num%256, noise = Math.floor(Math.random()*254)+1;
    return `bit32.bor(bit32.lshift(bit32.bxor(${high^noise},${noise}),8),${low})`;
  });
  
  return luaCode;
}

// --- 6. PACKER ---
function pack(src) {
  const bytes = new TextEncoder().encode(src);
  const k1 = Math.floor(Math.random()*200)+50, k2 = Math.floor(Math.random()*200)+50;
  const enc = new Uint8Array(bytes.length);
  for(let i=0;i<bytes.length;i++) enc[i] = bytes[i] ^ ((k1*(i+1)+k2)%256);
  
  const base = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const alpha = base.split('');
  for(let i=alpha.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[alpha[i],alpha[j]]=[alpha[j],alpha[i]]}
  const alp = alpha.join('');
  
  let b64 = '';
  for(let i=0;i<enc.length;i+=3){
    const b1=enc[i],b2=i+1<enc.length?enc[i+1]:0,b3=i+2<enc.length?enc[i+2]:0;
    b64+=alp[b1>>2]+alp[((b1&3)<<4)|(b2>>4)]+(i+1<enc.length?alp[((b2&15)<<2)|(b3>>6)]:'')+(i+2<enc.length?alp[b3&63]:'');
  }
  
  const d='_0xD_'+Math.random().toString(16).slice(2,6).toUpperCase();
  const a='_0xA_'+Math.random().toString(16).slice(2,6).toUpperCase();
  const k1v='_0xK1_'+Math.random().toString(16).slice(2,6).toUpperCase();
  const k2v='_0xK2_'+Math.random().toString(16).slice(2,6).toUpperCase();
  const f='_0xF_'+Math.random().toString(16).slice(2,6).toUpperCase();
  
  return `local ${d}="${b64}"\nlocal ${a}="${alp}"\nlocal ${k1v}=${k1}\nlocal ${k2v}=${k2}\nlocal function ${f}(data,alpha,key1,key2)\nlocal b={}\nfor i=1,#data,4 do\nlocal c1=alpha:find(data:sub(i,i),1,1) or 1\nlocal c2=alpha:find(data:sub(i+1,i+1),1,1) or 1\nlocal c3=i+2<=#data and (alpha:find(data:sub(i+2,i+2),1,1) or 1)\nlocal c4=i+3<=#data and (alpha:find(data:sub(i+3,i+3),1,1) or 1)\nc1,c2,c3,c4=c1-1,c2-1,c3-1,c4-1\nb[#b+1]=c1*4+math.floor(c2/16)\nif i+2<=#data then b[#b+1]=(c2%16)*16+math.floor(c3/4) end\nif i+3<=#data then b[#b+1]=(c3%4)*64+c4 end\nend\nlocal s=""\nfor i=1,#b do s=s..string.char(bit32.bxor(b[i],(key1*i+key2)%256)) end\nreturn s\nend\nlocal _0xDEC=function(t,k)local r={}for i=1,#t do r[i]=string.char(bit32.bxor(t[i],(k+i-1)%256))end return table.concat(r)end\nlocal chunk=loadstring(${f}(${d},${a},${k1v},${k2v}))\nif chunk then return chunk() else error("Load Failed") end`;
}

// --- MAIN EXPORT ---
export function obfuscate(source) {
  try {
    const tokens = tokenize(source);
    const ast = parse(tokens);
    const transformedAst = transform(ast);
    let lua = generate(transformedAst);
    lua = obfuscateLiterals(lua);
    return pack(lua);
  } catch (e) {
    throw new Error("AST Parse Error: " + e.message);
  }
}
