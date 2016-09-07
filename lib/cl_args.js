'use strict';

const _ = require('lodash');
const pd = require('pretty-data2').pd;
const commandLineArgs = require('command-line-args');

class ArgsUtil {
  constructor(opts) {
    let optionDefinitions = [];
    this.options = {};

    opts.options.forEach((opt, i) => {
      let definition = {
        name: opt.name,
        type: opt.type || 'String'
      };

      if (opt.alias) definition.alias = opt.alias;
      if (opt.defaultValue) definition.defaultValue = opt.defaultValue;
      if (opt.multiple) definition.multiple = opt.multiple;
      if (opt.defaultOption) definition.defaultOption = opt.defaultOption;

      optionDefinitions.push(definition);

      if (opt.required) definition.required = opt.required;

      this.options[opt.name] = {};
      Object.assign(this.options[opt.name], definition);
    });

    this.args = commandLineArgs(optionDefinitions);
  }

  /**
   * Check if the first arg is equal to the value
   * @param value {string}
   */
  checkFirstArg(value) {
    if (!value || !_.isString(value)) {
      throw new Error(`value ${value} must be a String!`);
    }
    var firstArg = process.argv[2];

    if (!firstArg || firstArg !== value) {
      console.log('Missing first argument %s. Please try to start script with this arg!', value);
      process.exit(1);
    }
  }

  /**
   * Allow to check required command line options
   */
  checkRequiredArgs() {
    let optErrors = [];

    Object.keys(this.options).forEach(key => {
      if (this.options[key].required && !this.args[key]) {
        optErrors.push(`--${key} option is required!`);
      }
    });

    if (optErrors.length) {
      console.error('Options parsing error(s): %j', optErrors);
      process.exit(1);
    }
  }

  /**
   * Check if option is  with optionName is present and set its value depending to the limit
   * @param optionName {string}
   * @param limit {number}
   * @returns {number}
   */
  checkNumArg(optionName, limit) {
    if (!optionName || !_.isString(optionName)) {
      throw new Error(`optionName ${optionName} must be a String!`);
    }

    if (!limit || !_.isNumber(limit)) {
      throw new Error(`limit ${limit} must be a Number!`);
    }

    let count = this.args[optionName];

    if (0 >= count) {
      console.log('Count is 0. Nothing to do! Bye, bye :)');
      process.exit(1);
    } else if (!count) {
      console.error(`--${optionName} option is not defined! Use standard value %s`, limit);
      count = limit;
    } else if (count > limit) {
      console.error(`--${optionName} option is larger then %s! Use standard value %s`, limit, limit);
      count = limit;
    }

    return count;
  }
}

module.exports = ArgsUtil;
