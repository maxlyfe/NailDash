const https = require('https');

const SUPABASE_URL = 'https://yefkehvdtykucjajfdcs.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InllZmtlaHZkdHlrdWNqYWpmZGNzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwMTY1NTQsImV4cCI6MjA4ODU5MjU1NH0.mfRk1S06qVrYqgF0-asjosel9Y0IZmyTj3DtAwHloE0';

function fetchJSON(path) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, SUPABASE_URL);
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      headers: {
        'apikey': ANON_KEY,
        'Authorization': 'Bearer ' + ANON_KEY,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    };
    https.get(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { resolve(data); }
      });
    }).on('error', reject);
  });
}

async function main() {
  // 1. Get OpenAPI schema to discover tables and columns
  console.log('='.repeat(60));
  console.log('SECTION 1: TABLE SCHEMA (from OpenAPI)');
  console.log('='.repeat(60));

  const schema = await fetchJSON('/rest/v1/');
  const defs = schema.definitions || {};
  const tables = Object.keys(defs).sort();
  console.log('\nTables found: ' + tables.length);
  console.log('Table names: ' + tables.join(', '));

  for (const tableName of tables) {
    const table = defs[tableName];
    const props = table.properties || {};
    const required = table.required || [];
    console.log('\n' + '-'.repeat(50));
    console.log('TABLE: ' + tableName);
    console.log('-'.repeat(50));
    for (const [colName, colDef] of Object.entries(props)) {
      const colType = colDef.format || colDef.type || 'unknown';
      const nullable = required.includes(colName) ? ' NOT NULL' : '';
      const defVal = colDef.default != null ? ' DEFAULT ' + JSON.stringify(colDef.default) : '';
      const desc = colDef.description || '';
      const maxLen = colDef.maxLength ? '(' + colDef.maxLength + ')' : '';
      let fkInfo = '';
      if (desc.toLowerCase().includes('fk')) {
        fkInfo = ' [FK: ' + desc + ']';
      }
      let enumInfo = '';
      if (colDef.enum) {
        enumInfo = ' ENUM(' + colDef.enum.join(', ') + ')';
      }
      console.log('  ' + colName + ': ' + colType + maxLen + enumInfo + nullable + defVal + fkInfo);
    }
  }

  // 2. Try to get data counts from each table
  console.log('\n' + '='.repeat(60));
  console.log('SECTION 2: TABLE DATA (row counts and samples)');
  console.log('='.repeat(60));

  for (const tableName of tables) {
    try {
      const result = await fetchJSON('/rest/v1/' + tableName + '?select=*&limit=5');
      if (Array.isArray(result)) {
        console.log('\n' + tableName + ': ' + (result.length >= 5 ? '5+ rows (showing first 5)' : result.length + ' rows'));
        if (result.length > 0) {
          for (const row of result) {
            console.log('  ' + JSON.stringify(row));
          }
        }
      } else {
        console.log('\n' + tableName + ': ' + JSON.stringify(result));
      }
    } catch (e) {
      console.log('\n' + tableName + ': ERROR - ' + e.message);
    }
  }

  // 3. Try to call RPC functions to check policies/triggers
  console.log('\n' + '='.repeat(60));
  console.log('SECTION 3: RPC FUNCTIONS AVAILABLE');
  console.log('='.repeat(60));

  // Check available RPC endpoints from the paths
  const paths = schema.paths || {};
  const rpcPaths = Object.keys(paths).filter(p => p.startsWith('/rpc/')).sort();
  console.log('\nRPC endpoints found: ' + rpcPaths.length);
  for (const rpc of rpcPaths) {
    const methods = Object.keys(paths[rpc]);
    console.log('  ' + rpc + ' (' + methods.join(', ') + ')');
    // Show parameters if any
    for (const method of methods) {
      const endpoint = paths[rpc][method];
      if (endpoint.parameters) {
        for (const param of endpoint.parameters) {
          if (param.in === 'body' && param.schema && param.schema.properties) {
            console.log('    Params: ' + JSON.stringify(param.schema.properties));
          }
        }
      }
    }
  }
}

main().catch(console.error);
