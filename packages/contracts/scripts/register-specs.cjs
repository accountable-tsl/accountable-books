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

// Add only new schemas that don't already exist
function addNewSchemas(schemas) {
  let content = fs.readFileSync(path.join(__dirname, '../openapi.yaml'), 'utf8');

  // Get existing schema names
  const existingNames = new Set();
  const matches = content.matchAll(/\s+(\w+):\s*$/gm);
  for (const match of matches) {
    existingNames.add(match[1]);
  }

  // Filter out schemas that already exist
  const newSchemas = Object.entries(schemas)
    .filter(([name]) => !existingNames.has(name))
    .map(([name, path]) => `    ${name}:\n      $ref: '${path}'`)
    .join('\n');

  if (newSchemas) {
    // Add new schemas at the end of the schemas section
    const schemasEnd = content.lastIndexOf('$ref:');
    if (schemasEnd !== -1) {
      const insertPoint = content.indexOf('\n', schemasEnd) + 1;
      content = content.slice(0, insertPoint) + newSchemas + '\n' + content.slice(insertPoint);
    }
  }

  fs.writeFileSync(path.join(__dirname, '../openapi.yaml'), content);
  console.log(
    `Added ${newSchemas.split('\n').filter((line) => line.includes('$ref:')).length} new schemas`,
  );
}

// Main execution
const schemas = findSchemas(path.join(__dirname, '../components/schemas'));
console.log(`Found ${Object.keys(schemas).length} schemas`);
addNewSchemas(schemas);
console.log('Updated openapi.yaml');
