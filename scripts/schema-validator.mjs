/**
 * Dependency-free validator for the JSON Schema vocabulary used by
 * profile.schema.json. The accepted keywords are checked explicitly, so a
 * future schema change cannot silently introduce an unenforced constraint.
 *
 * This is NOT a general-purpose JSON Schema Draft 2020-12 implementation.
 * If the project needs more keywords, use a standards-complete engine such
 * as Ajv, or deliberately extend this small validator with tests.
 */
const SUPPORTED_KEYWORDS = new Set([
  '$schema', 'title', 'description', 'type', 'properties', 'required',
  'additionalProperties', 'items', 'minLength', 'minItems', 'uniqueItems',
]);
const VALID_TYPES = new Set(['null', 'boolean', 'object', 'array', 'number', 'integer', 'string']);
const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const isPlainObject = value => value !== null && typeof value === 'object' &&
  !Array.isArray(value);
const actualType = value => value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;

function assertSchema(schema, path='$schema') {
  if (!isPlainObject(schema)) throw new Error(`Invalid schema at ${path}: expected object`);
  for (const key of Object.keys(schema)) {
    if (!SUPPORTED_KEYWORDS.has(key)) {
      throw new Error(`Unsupported JSON Schema keyword at ${path}: ${key}`);
    }
  }
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  if (types.some(type => !VALID_TYPES.has(type))) {
    throw new Error(`Invalid or unsupported type at ${path}`);
  }
  if (schema.required !== undefined &&
      (!Array.isArray(schema.required) || schema.required.some(x=>typeof x !== 'string'))) {
    throw new Error(`Invalid required list at ${path}`);
  }
  if (schema.additionalProperties !== undefined &&
      typeof schema.additionalProperties !== 'boolean') {
    throw new Error(`Unsupported additionalProperties at ${path}`);
  }
  for (const key of ['minLength','minItems']) {
    if (schema[key] !== undefined && (!Number.isInteger(schema[key]) || schema[key] < 0)) {
      throw new Error(`Invalid ${key} at ${path}`);
    }
  }
  if (schema.uniqueItems !== undefined && typeof schema.uniqueItems !== 'boolean') {
    throw new Error(`Invalid uniqueItems at ${path}`);
  }
  if (schema.properties !== undefined) {
    if (!isPlainObject(schema.properties)) throw new Error(`Invalid properties at ${path}`);
    for (const [key, child] of Object.entries(schema.properties)) {
      assertSchema(child, `${path}.properties.${key}`);
    }
  }
  if (schema.items !== undefined) assertSchema(schema.items, `${path}.items`);
}

function matchesType(value, type) {
  if (type === 'null') return value === null;
  if (type === 'array') return Array.isArray(value);
  if (type === 'object') return isPlainObject(value);
  if (type === 'integer') return typeof value === 'number' && Number.isInteger(value);
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
  return typeof value === type;
}

function validateNode(schema, value, path, errors) {
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  if (!types.some(type => matchesType(value,type))) {
    errors.push(`${path}: expected ${types.join(' or ')}, got ${actualType(value)}`);
    return;
  }
  if (typeof value === 'string' && schema.minLength !== undefined &&
      [...value].length < schema.minLength) {
    errors.push(`${path}: string is shorter than minLength ${schema.minLength}`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push(`${path}: array has fewer than ${schema.minItems} items`);
    }
    if (schema.uniqueItems && new Set(value.map(x => JSON.stringify(x))).size !== value.length) {
      errors.push(`${path}: array contains duplicate items`);
    }
    if (schema.items) value.forEach((item,i)=>validateNode(schema.items,item,`${path}[${i}]`,errors));
  }
  if (isPlainObject(value)) {
    if (schema.required) {
      for (const key of schema.required) {
        if (!hasOwn(value,key)) errors.push(`${path}.${key}: required property is missing`);
      }
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!hasOwn(schema.properties || {},key)) {
          errors.push(`${path}.${key}: additional property is not allowed`);
        }
      }
    }
    for (const [key,childSchema] of Object.entries(schema.properties || {})) {
      if (hasOwn(value,key)) validateNode(childSchema,value[key],`${path}.${key}`,errors);
    }
  }
}

/** Returns an array of path-specific validation messages; [] means valid. */
export function validateProfileAgainstSchema(profile, schema) {
  assertSchema(schema);
  const errors=[];
  validateNode(schema,profile,'$',errors);
  return errors;
}
