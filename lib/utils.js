'use strict';

const joi = require('joi');
const path = require('path');

/**
 * Helps to generate valid api path with page number
 * @param base {string}
 * @param pathString {string}
 * @param page {int}
 * @returns {string}
 */
function getPathWithPage(base, pathString, page) {
  return path.format({root: base, name: `${pathString + page}`});
}

/**
 *  Helps to generate valid api path
 * @param base {string}
 * @param pathString {string}
 * @param ext {string}
 * @returns {string}
 */
function getPathWithExt(base, pathString, ext) {
  return path.format({root: base, name: pathString, ext: ext});
}

/**
 * Validate object data
 * @param data {object}
 * @param schema {object}
 * @param opts {object}
 * @returns {Promise}
 */
function validate(data, schema, opts) {
  const stdOpts = {
    stripUnknown: true,
    abortEarly: true,
    convert: true
  };

  opts = opts || stdOpts;

  return new Promise((resolve, reject) => {
    let _res = joi.validate(data, schema, opts);

    if (_res.error) return reject(_res.error);

    resolve(_res.value);
  })

}

module.exports = {getPathWithPage, getPathWithExt, validate};
