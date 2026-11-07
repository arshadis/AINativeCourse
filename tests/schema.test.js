import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {validateProfileAgainstSchema} from '../scripts/schema-validator.mjs';

const schema=JSON.parse(readFileSync(new URL('../profile.schema.json',import.meta.url),'utf8'));
const profile=JSON.parse(readFileSync(new URL('../profile.json',import.meta.url),'utf8'));
const copy=()=>structuredClone(profile);
const errorsFor=value=>validateProfileAgainstSchema(value,schema);

test('complete real profile conforms to declared JSON Schema constraints',()=>{
  assert.deepEqual(errorsFor(profile),[]);
});
test('missing required profile section fails validation',()=>{
  const candidate=copy();delete candidate.limits;
  assert.match(errorsFor(candidate).join('\n'),/\$\.limits: required/);
});
test('type mismatch in nested field fails with exact path',()=>{
  const candidate=copy();candidate.courses[0].title=12;
  assert.match(errorsFor(candidate).join('\n'),/\$\.courses\[0\]\.title: expected string/);
});
test('extra unapproved property fails due to additionalProperties false',()=>{
  const candidate=copy();candidate.projects[0].fabricated_employer='Example';
  assert.match(errorsFor(candidate).join('\n'),/fabricated_employer: additional property/);
});
test('empty required project summary is rejected',()=>{
  const candidate=copy();candidate.projects[0].summary='';
  assert.match(errorsFor(candidate).join('\n'),/projects\[0\]\.summary: string is shorter/);
});
test('empty features array is rejected',()=>{
  const candidate=copy();candidate.projects[0].features=[];
  assert.match(errorsFor(candidate).join('\n'),/projects\[0\]\.features: array has fewer/);
});
test('duplicate public paths are rejected',()=>{
  const candidate=copy();candidate.limits.published_fields.push(candidate.limits.published_fields[0]);
  assert.match(errorsFor(candidate).join('\n'),/published_fields: array contains duplicate/);
});
test('nullable about fields are valid, but non-null objects are rejected',()=>{
  const candidate=copy();candidate.about.display_name={x:1};
  assert.match(errorsFor(candidate).join('\n'),/about\.display_name: expected string or null/);
});
test('unknown schema keywords throw instead of silently passing',()=>{
  const futureSchema=structuredClone(schema);
  futureSchema.properties.skills.minProperties=1;
  assert.throws(()=>validateProfileAgainstSchema(profile,futureSchema),/Unsupported JSON Schema keyword/);
});
test('CLI exits nonzero and gives a path-specific message for invalid record',()=>{
  const directory=mkdtempSync(join(tmpdir(),'profile-schema-test-'));
  try {
    const candidate=copy();candidate.courses[0].title=false;
    const path=join(directory,'bad-profile.json');
    writeFileSync(path,JSON.stringify(candidate));
    const script=fileURLToPath(new URL('../scripts/validate-profile.mjs',import.meta.url));
    const jsonSchema=fileURLToPath(new URL('../profile.schema.json',import.meta.url));
    const run=spawnSync(process.execPath,[script,path,jsonSchema],{encoding:'utf8'});
    assert.equal(run.status,1);
    assert.match(run.stderr,/courses\[0\]\.title/);
  } finally { rmSync(directory,{recursive:true,force:true}); }
});
