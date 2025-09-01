#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Find all .yaml files in components/schemas recursively
function findSchemas(dir, basePath = '') {
  if (!fs.existsSync(dir)) return {};

  const schemas = {};
  for (const item of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, item);
    if (fs.statSync(fullPath).isDirectory()) {
      Object.assign(schemas, findSchemas(fullPath, path.join(basePath, item)));
    } else if (item.endsWith('.yaml')) {
      const name = path.basename(item, '.yaml');
      schemas[name] = `./components/schemas/${path.join(basePath, item).replace(/\\/g, '/')}`;
    }
  }
  return schemas;
}

// Update openapi.yaml with discovered schemas
function updateOpenAPI(schemas) {
  let content = fs.readFileSync(path.join(__dirname, '../openapi.yaml'), 'utf8');

  // Remove existing schemas section and add new one
  content = content.replace(/  schemas:\n((\s+[^\n]+:\s*[^\n]*\n?)*)/, '');
  const insertIndex = content.indexOf('components:') + 'components:'.length;
  const schemasSection =
    '\n  schemas:\n' +
    Object.entries(schemas)
      .map(([name, path]) => `    ${name}:\n      $ref: '${path}'`)
      .join('\n') +
    '\n';

  content = content.slice(0, insertIndex) + schemasSection + content.slice(insertIndex);
  fs.writeFileSync(path.join(__dirname, '../openapi.yaml'), content);
}

// Main execution
const schemas = findSchemas(path.join(__dirname, '../components/schemas'));
console.log(`Found ${Object.keys(schemas).length} schemas`);
updateOpenAPI(schemas);
console.log('Updated openapi.yaml');
