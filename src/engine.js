// ============================================
// OBFAST ENGINE v3.1 - CRASH PROOF
// Fixes: node.body.map error, null AST handling
// ============================================

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

// --- 1. TOKENIZER ---
function tokenize(src) {
  const tokens = []; let i = 0, l = src.length;
  while (i < l) {
    const c = src[i], n = src[i+1], n2 = src[i+2];
    if (c==='-' && n==='-') {
      if (n2==='[') {
        let eq=0; while(src[i+3+eq]==='=')eq++;
        if(src[i+3+eq]==='['){
          let end=src.indexOf(']'+'='.repeat(eq)+']',i+4+eq);
          end=end===-1?l:end+3+eq;
          tokens.push({t:'comment',v:src.slice(i,end)}); i=end; continue;
        }
      }
      let end=src.indexOf('\n',i);
      tokens.push({t:'comment',v:src.slice(i,end===-1?l:end)});
      i=end===-1?l:end; continue;
    }
    if (c==='[' && (n==='['||n==='=')) {
      let eq=0; while(src[i+1+eq]==='=')eq++;
      if(src[i+1+eq]==='['){
        let end=src.indexOf(']'+'='.repeat(eq)+']',i+2+eq);
        end=end===-1?l:end+3+eq;
        tokens.push({t:'string',v:src.slice(i,end),r:null,long:true});
        i=end; continue;
      }
    }
    if (c==='"'||c==="'") {
      const q=c; let j=i+1, raw='', hasEscape=false;
      while(j<l&&src[j]!==q){
        if(src[j]==='\\'){
          hasEscape=true;
          let esc=src[j+1];
          if(esc==='n'||esc==='t'||esc==='r'||esc==='\\'||esc===q){j+=2;}
          else if(esc==='x'&&j+3<l&&/^[0-9a-fA-F]{2}$/.test(src.slice(j+2,j+4))){j+=4;}
          else{j+=2;}
        }else{
          if(src.charCodeAt(j)>255)hasEscape=true;
          j++;
        }
      }
      j++;
      tokens.push({t:'string',v:src.slice(i,j),r:hasEscape?null:src.slice(i+1,j-1),skip:hasEscape});
      i=j; continue;
    }
    if (/\d/.test(c)||(c==='.'&&/\d/.test(n))) {
      let j=i;
      if(c==='0'&&(n==='x'||n==='X')){j+=2;while(j<l&&/[0-9a-fA-F]/.test(src[j]))j++;}
      else{
        while(j<l&&/[\d.]/.test(src[j]))j++;
        if(j<l&&(src[j]==='e'||src[j]==='E')){j++;if(j<l&&(src[j]==='+'||src[j]==='-'))j++;while(j<l&&/\d/.test(src[j]))j++;}
      }
      tokens.push({t:'number',v:src.slice(i,j)}); i=j; continue;
    }
    if (/[a-zA-Z_]/.test(c)) {
      let j=i; while(j<l&&/[a-zA-Z0-9_]/.test(src[j]))j++;
      const w=src.slice(i,j);
      tokens.push({t:KEYWORDS.has(w)?'kw':'id',v:w}); i=j; continue;
    }
    if (c==='.'&&n==='.'&&n2==='.'){tokens.push({t:'op',v:'...'});i+=3;continue}
    if (c==='.'&&n==='.'){tokens.push({t:'op',v:'..'});i+=2;continue}
    if (c===':'&&n===':'){tokens.push({t:'op',v:'::'});i+=2;continue}
    if ((c==='='&&n==='=')||(c==='~'&&n==='=')||(c==='<'&&n==='=')||(c==='>'&&n==='=')){
      tokens.push({t:'op',v:c+n});i+=2;continue}
    if ('+-*/%^#=<>(){}[];:,.~'.includes(c)){tokens.push({t:'op',v:c});i++;continue}
    if (/\s/.test(c)){let j=i;while(j<l&&/\s/.test(src[j]))j++;tokens.push({t:'ws',v:src.slice(i,j)});i=j;continue}
    tokens.push({t:'unk',v:c}); i++;
  }
  return tokens;
}

// --- 2. PARSER ---
function parse(tokens) {
  let idx = 0;
  const peek = (o=0) => tokens[idx+o];
  const eat = (t,v) => { const tk=tokens[idx]; if(tk&&tk.t===t&&(!v||tk.v===v)){idx++;return tk;} return null; };
  const expect = (t,v) => { const tk=eat(t,v); if(!tk) throw new Error(`Expected ${t} '${v||''}', got '${peek()?.v||'EOF'}' at token ${idx}`); return tk; };
  const skip = () => { while(tokens[idx]&&(tokens[idx].t==='ws'||tokens[idx].t==='comment'))idx++; };

  function parseBlock(stopTokens=new Set()) {
    const stmts = [];
    skip();
    while(idx<tokens.length){
      const tk=peek();
      if(!tk) break;
      if(tk.t==='kw'&&stopTokens.has(tk.v)) break;
      if(tk.t==='kw'&&tk.v==='return'){stmts.push(parseReturn());break;}
      const stmt=parseStatement();
      if(stmt) stmts.push(stmt);
      skip();
    }
    return {type:'Block',body:stmts};
  }

  function parseStatement() {
    skip();
    const tk=peek();
    if(!tk) return null;
    if(tk.t==='op'&&tk.v===';'){idx++;return null;}
    
    if(tk.t==='kw'&&tk.v==='local'){
      idx++;skip();
      if(peek()&&peek().t==='kw'&&peek().v==='function'){
        idx++;skip();
        const name=expect('id').v;skip();
        const params=parseParamList();skip();
        const body=parseBlock(new Set(['end']));skip();
        expect('kw','end');
        return {type:'LocalFunction',name,params,body};
      }
      const names=[];
      while(peek()&&peek().t==='id'){names.push(expect('id').v);skip();if(eat('op',','))skip();else break;}
      let init=null;
      if(eat('op','=')){skip();init=parseExpressionList();}
      return {type:'LocalStatement',names,init:init||[]};
    }
    
    if(tk.t==='kw'&&tk.v==='function'){
      idx++;skip();
      const name=expect('id').v;skip();
      let method=null,isMethod=false;
      while(eat('op','.')){skip();method=method?method+'.'+expect('id').v:expect('id').v;skip();}
      if(eat('op',':')){isMethod=true;skip();method=(method?method+':':'')+expect('id').v;skip();}
      const params=parseParamList();skip();
      const body=parseBlock(new Set(['end']));skip();
      expect('kw','end');
      return {type:'FunctionDeclaration',name,method,isMethod,params,body};
    }
    
    if(tk.t==='kw'&&tk.v==='if'){
      idx++;skip();
      const clauses=[{cond:parseExpression(),body:parseBlock(new Set(['elseif','else','end']))}];skip();
      while(peek()&&peek().t==='kw'&&peek().v==='elseif'){idx++;skip();clauses.push({cond:parseExpression(),body:parseBlock(new Set(['elseif','else','end']))});skip();}
      let elseBody=null;
      if(eat('kw','else')){skip();elseBody=parseBlock(new Set(['end']));skip();}
      expect('kw','end');
      return {type:'IfStatement',clauses,elseBody};
    }
    
    if(tk.t==='kw'&&tk.v==='while'){
      idx++;skip();
      const cond=parseExpression();skip();
      expect('kw','do');skip();
      const body=parseBlock(new Set(['end']));skip();
      expect('kw','end');
      return {type:'WhileStatement',cond,body};
    }
    
    if(tk.t==='kw'&&tk.v==='repeat'){
      idx++;skip();
      const body=parseBlock(new Set(['until']));skip();
      expect('kw','until');skip();
      const cond=parseExpression();
      return {type:'RepeatStatement',body,cond};
    }
    
    if(tk.t==='kw'&&tk.v==='do'){
      idx++;skip();
      const body=parseBlock(new Set(['end']));skip();
      expect('kw','end');
      return {type:'DoStatement',body};
    }
    
    if(tk.t==='kw'&&tk.v==='for'){
      idx++;skip();
      const varName=expect('id').v;skip();
      if(eat('op','=')){
        skip();const start=parseExpression();skip();expect('op',',');skip();
        const end=parseExpression();skip();let step=null;
        if(eat('op',',')){skip();step=parseExpression();skip();}
        expect('kw','do');skip();const body=parseBlock(new Set(['end']));skip();expect('kw','end');
        return {type:'NumericFor',varName,start,end,step,body};
      }else{
        const names=[varName];
        while(eat('op',',')){skip();names.push(expect('id').v);skip();}
        expect('kw','in');skip();const iters=parseExpressionList();skip();
        expect('kw','do');skip();const body=parseBlock(new Set(['end']));skip();expect('kw','end');
        return {type:'GenericFor',names,iters,body};
      }
    }
    
    if(tk.t==='kw'&&tk.v==='break'){idx++;return {type:'BreakStatement'};}
    if(tk.t==='kw'&&tk.v==='continue'){idx++;return {type:'ContinueStatement'};}
    
    const expr=parsePrefixExpression();skip();
    if(eat('op','=')){skip();const values=parseExpressionList();return {type:'AssignmentStatement',targets:[expr],values};}
    if(expr.type==='CallExpression'||expr.type==='MethodCallExpression'){
      return {type:'CallStatement',expression:expr};
    }
    return {type:'ExpressionStatement',expression:expr};
  }

  function parseReturn(){
    expect('kw','return');skip();
    const values=(peek()&&peek().t!=='kw')?parseExpressionList():[];
    return {type:'ReturnStatement',values};
  }

  function parseParamList(){
    expect('op','(');skip();
    const params=[];
    if(peek()&&peek().t==='id'){params.push(expect('id').v);skip();while(eat('op',',')){skip();params.push(expect('id').v);skip();}}
    if(eat('op','...')){params.push('...');skip();}
    expect('op',')');
    return params;
  }

  function parseExpressionList(){
    const list=[parseExpression()];skip();
    while(eat('op',',')){skip();list.push(parseExpression());skip();}
    return list;
  }

  function parseExpression(){return parseOr();}
  function parseOr(){let l=parseAnd();skip();while(peek()&&peek().t==='kw'&&peek().v==='or'){idx++;skip();l={type:'BinaryExpr',op:'or',left:l,right:parseAnd()};skip();}return l;}
  function parseAnd(){let l=parseComp();skip();while(peek()&&peek().t==='kw'&&peek().v==='and'){idx++;skip();l={type:'BinaryExpr',op:'and',left:l,right:parseComp()};skip();}return l;}
  function parseComp(){let l=parseConcat();skip();while(peek()&&peek().t==='op'&&['<','>','<=','>=','~=','=='].includes(peek().v)){const op=peek().v;idx++;skip();l={type:'BinaryExpr',op,left:l,right:parseConcat()};skip();}return l;}
  function parseConcat(){let l=parseAdd();skip();while(eat('op','..')){skip();l={type:'BinaryExpr',op:'..',left:l,right:parseAdd()};skip();}return l;}
  function parseAdd(){let l=parseMul();skip();while(peek()&&peek().t==='op'&&['+','-'].includes(peek().v)){const op=peek().v;idx++;skip();l={type:'BinaryExpr',op,left:l,right:parseMul()};skip();}return l;}
  function parseMul(){let l=parseUnary();skip();while(peek()&&peek().t==='op'&&['*','/','%','^'].includes(peek().v)){const op=peek().v;idx++;skip();l={type:'BinaryExpr',op,left:l,right:parseUnary()};skip();}return l;}
  function parseUnary(){skip();if(eat('kw','not')){skip();return {type:'UnaryExpr',op:'not',arg:parseUnary()}}if(eat('op','#')){skip();return {type:'UnaryExpr',op:'#',arg:parseUnary()}}if(eat('op','-')){skip();return {type:'UnaryExpr',op:'-',arg:parseUnary()}}return parsePrimary();}
  
  function parsePrimary(){
    skip();
    const tk=peek();
    if(!tk) throw new Error('Unexpected end of input');
    if(tk.t==='number'){idx++;return {type:'NumberLiteral',value:tk.v};}
    if(tk.t==='string'){idx++;return {type:'StringLiteral',value:tk.v,raw:tk.r};}
    if(tk.t==='kw'&&tk.v==='nil'){idx++;return {type:'NilLiteral'};}
    if(tk.t==='kw'&&tk.v==='true'){idx++;return {type:'BooleanLiteral',value:true};}
    if(tk.t==='kw'&&tk.v==='false'){idx++;return {type:'BooleanLiteral',value:false};}
    if(tk.t==='op'&&tk.v==='...'){idx++;return {type:'VarargLiteral'};}
    if(tk.t==='kw'&&tk.v==='function'){
      idx++;skip();const params=parseParamList();skip();
      const body=parseBlock(new Set(['end']));skip();expect('kw','end');
      return {type:'FunctionExpression',params,body};
    }
    if(tk.t==='op'&&tk.v==='{'){return parseTableConstructor();}
    if(tk.t==='op'&&tk.v==='('){idx++;skip();const e=parseExpression();skip();expect('op',')');return e;}
    if(tk.t==='id'||tk.t==='op'){return parsePrefixExpression();}
    throw new Error(`Unexpected token '${tk.v}' at position ${idx}`);
  }

  function parseTableConstructor(){
    expect('op','{');skip();
    const fields=[];
    while(peek()&&!(peek().t==='op'&&peek().v==='}')){
      skip();
      if(!peek()||(peek().t==='op'&&peek().v==='}'))break;
      if(peek().t==='op'&&peek().v==='['){
        idx++;skip();const k=parseExpression();skip();expect('op',']');skip();expect('op','=');skip();
        fields.push({type:'Key',key:k,value:parseExpression()});
      }else if(peek().t==='id'&&peek(1)&&peek(1).t==='op'&&peek(1).v==='='){
        const k=expect('id').v;skip();expect('op','=');skip();
        fields.push({type:'KeyStr',key:k,value:parseExpression()});
      }else{
        fields.push({type:'Val',value:parseExpression()});
      }
      skip();if(peek()&&peek().t==='op'&&(peek().v===','||peek().v===';')){idx++;skip();}
    }
    expect('op','}');
    return {type:'TableConstructor',fields};
  }

  function parsePrefixExpression(){
    skip();
    let expr;
    const tk=peek();
    if(tk&&tk.t==='id'){expr={type:'Identifier',name:tk.v};idx++;}
    else if(tk&&tk.t==='op'&&tk.v==='('){expr=parsePrimary();}
    else throw new Error(`Expected identifier or '(', got '${tk?.v||'EOF'}'`);
    
    skip();
    while(true){
      const next=peek();
      if(!next)break;
      if(next.t==='op'&&next.v==='.'){idx++;skip();expr={type:'MemberExpr',obj:expr,field:expect('id').v};}
      else if(next.t==='op'&&next.v===':'){idx++;skip();expr={type:'MethodExpr',obj:expr,method:expect('id').v};}
      else if(next.t==='op'&&next.v==='['){idx++;skip();expr={type:'IndexExpr',obj:expr,index:parseExpression()};skip();expect('op',']');}
      else if(next.t==='op'&&(next.v==='('||next.v==='{')||(next.t==='string')){
        const args=parseArguments();skip();
        expr={type:'CallExpr',callee:expr,args};
      }else break;
      skip();
    }
    return expr;
  }

  function parseArguments(){
    const tk=peek();
    if(tk.t==='op'&&tk.v==='('){
      idx++;skip();const args=[];
      if(peek()&&!(peek().t==='op'&&peek().v===')')){args.push(...parseExpressionList());}
      skip();expect('op',')');return args;
    }else if(tk.t==='op'&&tk.v==='{'){return [parseTableConstructor()];}
    else if(tk.t==='string'){idx++;return [{type:'StringLiteral',value:tk.v,raw:tk.r}];}
    throw new Error(`Expected arguments, got '${tk.v}'`);
  }

  skip();
  const body=parseBlock();
  return {type:'Program',body};
}

// --- 3. TRANSFORMER (CRASH PROOF) ---
function transform(ast) {
  // VALIDASI KRITIS: Pastikan ast.body adalah array sebelum di-map
  if (!ast || !Array.isArray(ast.body)) {
    console.warn("AST Body is not an array, returning original AST");
    return ast;
  }

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
      
      // Pre-scan declarations
      if (Array.isArray(node.body)) {
        for (const stmt of node.body) {
          if (stmt && stmt.type === 'LocalStatement' && Array.isArray(stmt.names)) {
            stmt.names.forEach(n => newScope.vars.add(n));
          }
          if (stmt && stmt.type === 'LocalFunction') {
            newScope.vars.add(stmt.name);
          }
        }
        
        // Visit children safely
        node.body.forEach(s => visit(s, newScope));
      }
      return;
    }
    
    if (node.type === 'LocalStatement') {
      if (Array.isArray(node.names)) {
        node.names.forEach((name, idx) => {
          if (!GLOBALS.has(name)) {
            node.names[idx] = getOrGen(name);
          }
        });
      }
      if (Array.isArray(node.init)) {
        node.init.forEach(v => visit(v, scope));
      }
      return;
    }
    
    if (node.type === 'LocalFunction') {
      if (!GLOBALS.has(node.name)) {
        node.name = getOrGen(node.name);
      }
      const funcScope = { parent: scope, vars: new Set(node.params || []) };
      visit(node.body, funcScope);
      return;
    }
    
    if (node.type === 'FunctionDeclaration') {
      const funcScope = { parent: scope, vars: new Set(node.params || []) };
      visit(node.body, funcScope);
      return;
    }
    
    if (node.type === 'FunctionExpression') {
      const funcScope = { parent: scope, vars: new Set(node.params || []) };
      visit(node.body, funcScope);
      return;
    }
    
    if (node.type === 'Identifier' && !GLOBALS.has(node.name)) {
      let s = scope;
      while(s) { 
        if(s.vars && s.vars.has(node.name)){
          node.name = getOrGen(node.name);
          return;
        } 
        s=s.parent; 
      }
    }
    
    // Safe recursion for all other nodes
    for (const key in node) {
      if (key==='type') continue;
      const child = node[key];
      if (Array.isArray(child)) {
        child.forEach(c => visit(c, scope));
      } else if (child && typeof child === 'object' && child.type) {
        visit(child, scope);
      }
    }
  }
  
  visit(ast, { parent: null, vars: new Set() });
  return ast;
}

// --- 4. CODE GENERATOR (CRASH PROOF) ---
function generate(ast) {
  function gen(node) {
    if (!node) return '';
    switch(node.type) {
      case 'Program': return Array.isArray(node.body) ? node.body.map(gen).join('\n') : '';
      case 'Block': return Array.isArray(node.body) ? node.body.map(gen).join('\n') : '';
      case 'LocalStatement': 
        const names = Array.isArray(node.names) ? node.names.join(', ') : '';
        const init = Array.isArray(node.init) && node.init.length ? ' = ' + node.init.map(gen).join(', ') : '';
        return 'local ' + names + init;
      case 'LocalFunction': return `local function ${node.name}(${(node.params||[]).join(', ')})\n${gen(node.body)}\nend`;
      case 'FunctionDeclaration': 
        const fName = node.method ? (node.name + (node.isMethod?':':'.') + node.method) : node.name;
        return `function ${fName}(${(node.params||[]).join(', ')})\n${gen(node.body)}\nend`;
      case 'FunctionExpression': return `function(${(node.params||[]).join(', ')})\n${gen(node.body)}\nend`;
      case 'IfStatement': {
        let s = `if ${gen(node.clauses[0]?.cond)} then\n${gen(node.clauses[0]?.body)}`;
        if(Array.isArray(node.clauses)){
          for(let i=1;i<node.clauses.length;i++) s+=`\nelseif ${gen(node.clauses[i].cond)} then\n${gen(node.clauses[i].body)}`;
        }
        if(node.elseBody) s+=`\nelse\n${gen(node.elseBody)}`;
        return s + '\nend';
      }
      case 'WhileStatement': return `while ${gen(node.cond)} do\n${gen(node.body)}\nend`;
      case 'RepeatStatement': return `repeat\n${gen(node.body)}\nuntil ${gen(node.cond)}`;
      case 'DoStatement': return `do\n${gen(node.body)}\nend`;
      case 'NumericFor': return `for ${node.varName} = ${gen(node.start)}, ${gen(node.end)}${node.step?', '+gen(node.step):''} do\n${gen(node.body)}\nend`;
      case 'GenericFor': return `for ${(node.names||[]).join(', ')} in ${(node.iters||[]).map(gen).join(', ')} do\n${gen(node.body)}\nend`;
      case 'ReturnStatement': return 'return ' + (Array.isArray(node.values)?node.values.map(gen).join(', '):'');
      case 'BreakStatement': return 'break';
      case 'ContinueStatement': return 'continue';
      case 'AssignmentStatement': return (Array.isArray(node.targets)?node.targets.map(gen).join(', '):'') + ' = ' + (Array.isArray(node.values)?node.values.map(gen).join(', '):'');
      case 'CallStatement': return gen(node.expression);
      case 'BinaryExpr': return `${gen(node.left)} ${node.op} ${gen(node.right)}`;
      case 'UnaryExpr': return `${node.op}${gen(node.arg)}`;
      case 'CallExpr': return `${gen(node.callee)}(${(node.args||[]).map(gen).join(', ')})`;
      case 'MemberExpr': return `${gen(node.obj)}.${node.field}`;
      case 'MethodExpr': return `${gen(node.obj)}:${node.method}`;
      case 'IndexExpr': return `${gen(node.obj)}[${gen(node.index)}]`;
      case 'Identifier': return node.name;
      case 'NumberLiteral': return node.value;
      case 'StringLiteral': return node.value;
      case 'NilLiteral': return 'nil';
      case 'BooleanLiteral': return node.value?'true':'false';
      case 'VarargLiteral': return '...';
      case 'TableConstructor': {
        const fields = (node.fields||[]).map(f => {
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

// --- 5. POST-OBFUSCATION & PACKER ---
function obfuscateLiterals(luaCode) {
  if(typeof luaCode !== 'string') return luaCode;
  luaCode = luaCode.replace(/(["'])(?:(?!\1|\\).|\\.)*\1/g, match => {
    if(match.length<4) return match;
    const quote=match[0], raw=match.slice(1,-1);
    if(raw.includes('\\')) return match;
    const key=Math.floor(Math.random()*254)+1;
    const bytes=[];
    for(let i=0;i<raw.length;i++) bytes.push(raw.charCodeAt(i)^((key+i)%256));
    return `_0xDEC({${bytes.join(',')}},${key})`;
  });
  
  luaCode = luaCode.replace(/\b(\d+)\b/g, (match, numStr) => {
    const num=parseInt(numStr);
    if(num<0||num>65535) return match;
    const high=Math.floor(num/256), low=num%256, noise=Math.floor(Math.random()*254)+1;
    return `bit32.bor(bit32.lshift(bit32.bxor(${high^noise},${noise}),8),${low})`;
  });
  return luaCode;
}

function pack(src) {
  if(typeof src !== 'string') src = String(src);
  const bytes = new TextEncoder().encode(src);
  const k1=Math.floor(Math.random()*200)+50, k2=Math.floor(Math.random()*200)+50;
  const enc=new Uint8Array(bytes.length);
  for(let i=0;i<bytes.length;i++) enc[i]=bytes[i]^((k1*(i+1)+k2)%256);
  
  const base='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const alpha=base.split('');
  for(let i=alpha.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[alpha[i],alpha[j]]=[alpha[j],alpha[i]];}
  const alp=alpha.join('');
  
  let b64='';
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
    if (!source || typeof source !== 'string' || source.trim().length === 0) {
      throw new Error("Input kosong atau tidak valid!");
    }
    
    const tokens = tokenize(source);
    if (!tokens || tokens.length === 0) {
      throw new Error("Tokenizer gagal menghasilkan token!");
    }
    
    const ast = parse(tokens);
    if (!ast || !Array.isArray(ast.body)) {
      throw new Error("Parser gagal menghasilkan AST yang valid!");
    }
    
    const transformedAst = transform(ast);
    let lua = generate(transformedAst);
    
    if (typeof lua !== 'string' || lua.length === 0) {
      throw new Error("Code generator menghasilkan output kosong!");
    }
    
    lua = obfuscateLiterals(lua);
    return pack(lua);
  } catch (e) {
    throw new Error("Obfuscation Error: " + e.message);
  }
}
