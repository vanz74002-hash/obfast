// ============================================
// OBFAST ENGINE v9.3 - ARITHMETIC ENCODING
// Inspired by simple obfuscator technique
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

function genName() {
  return '_' + Math.random().toString(36).slice(2, 10);
}

// --- ENCODE STRING TO ARITHMETIC ARRAY ---
function encodeString(str) {
  const key = Math.floor(Math.random() * 100) + 50;
  const step = Math.floor(Math.random() * 5) + 2;
  const encoded = [];
  
  for (let i = 0; i < str.length; i++) {
    const charCode = str.charCodeAt(i);
    const encodedVal = (charCode + key + (i * step)) % 256;
    encoded.push(encodedVal);
  }
  
  return { encoded, key, step };
}

// --- GENERATE DECODER FUNCTION ---
function generateDecoder(encodedArray, key, step, varName) {
  const arrayVar = genName();
  const keyVar = genName();
  const stepVar = genName();
  const resultVar = genName();
  const loopVar = genName();
  
  return `local ${arrayVar}={${encodedArray.join(',')}}\n` +
         `local ${keyVar}=${key}\n` +
         `local ${stepVar}=${step}\n` +
         `local ${resultVar}={}\n` +
         `for ${loopVar}=1,#${arrayVar} do ${resultVar}[${loopVar}]=string.char((${arrayVar}[${loopVar}]-${keyVar}-(${loopVar}-1)*${stepVar})%256) end\n` +
         `local ${varName}=table.concat(${resultVar})\n`;
}

// --- MAIN OBFUSCATION FUNCTION ---
function obfuscate(source) {
  // 1. Remove comments
  source = source.replace(/--\[\[[\s\S]*?\]\]/g, '');
  source = source.replace(/--[^\n]*/g, '');
  
  // 2. Minify whitespace
  source = source.replace(/\s+/g, ' ');
  source = source.replace(/\s*([{}()\[\];,=+\-*/%^#<>~:])\s*/g, '$1');
  
  // 3. Split source into chunks
  const chunkSize = 500;
  const chunks = [];
  for (let i = 0; i < source.length; i += chunkSize) {
    chunks.push(source.slice(i, i + chunkSize));
  }
  
  // 4. Encode each chunk
  const decoders = [];
  const chunkVars = [];
  
  chunks.forEach((chunk, idx) => {
    const varName = genName();
    const { encoded, key, step } = encodeString(chunk);
    decoders.push(generateDecoder(encoded, key, step, varName));
    chunkVars.push(varName);
  });
  
  // 5. Combine all chunks
  const combinedVar = genName();
  const concatCode = `local ${combinedVar}=${chunkVars.join('..')}\n`;
  
  // 6. Execute
  const execCode = `return(loadstring or load)(${combinedVar})()\n`;
  
  // 7. Combine everything
  return decoders.join('') + concatCode + execCode;
}

export { obfuscate };
