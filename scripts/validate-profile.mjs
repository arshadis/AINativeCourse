import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import {validateProfileAgainstSchema} from './schema-validator.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const profilePath=resolve(process.argv[2] || resolve(root,'profile.json'));
const schemaPath=resolve(process.argv[3] || resolve(root,'profile.schema.json'));

try {
  const [profile,schema]=await Promise.all([
    readFile(profilePath,'utf8').then(JSON.parse),
    readFile(schemaPath,'utf8').then(JSON.parse),
  ]);
  const errors=validateProfileAgainstSchema(profile,schema);
  if (errors.length) {
    console.error(`FAIL: profile.json violates profile.schema.json (${errors.length} issue(s)):`);
    for (const issue of errors) console.error(`  - ${issue}`);
    process.exitCode=1;
  } else {
    console.log('PASS: profile.json conforms to the supported constraints in profile.schema.json');
  }
} catch (error) {
  console.error(`FAIL: could not validate profile: ${error.message}`);
  process.exitCode=1;
}
