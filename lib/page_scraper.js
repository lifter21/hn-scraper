'use strict';

// module dependencies
const joi = require('joi');
const cheerio = require('cheerio');
const request = require('request');
const pd = require('pretty-data2').pd;

const ArgsUtil = require('.').ArgsUtil;
const utils = require('.').utils;

// command line args:
const FIRST_ARG = 'hackernews';
// --posts
const POSTS_LIMIT = 100;
const POSTS_OPT = 'posts';
const POSTS_OPT_ALIAS = 'p';
// --messages
const MESSAGES_OPT = 'messages';
const MESSAGES_OPT_ALIAS = 'm';
// --stats
const STATS_OPT = 'stats';
const STATS_OPT_ALIAS = 's';
// --reconnect
const RECONNECT_OPT = 'reconnect';
const RECONNECT_OPT_ALIAS = 'r';
// --attempts
const ATTEMPTS_LIMIT = 5;
const ATTEMPTS_OPT = 'attempts';
const ATTEMPTS_OPT_ALIAS = 'a';

class PageScraper {
  constructor(opts) {
    this.postsLimit = opts && opts.postsLimit || POSTS_LIMIT;
    // explicitly define acceptable command line args
    this.allowedArgs = {
      options: [
        {name: POSTS_OPT, alias: POSTS_OPT_ALIAS, type: Number, defaultValue: this.postsLimit, required: true},
        {name: MESSAGES_OPT, alias: MESSAGES_OPT_ALIAS, type: Boolean, defaultValue: false},
        {name: STATS_OPT, alias: STATS_OPT_ALIAS, type: Boolean, defaultValue: false},
        {name: RECONNECT_OPT, alias: RECONNECT_OPT_ALIAS, type: Boolean, defaultValue: false},
        {name: ATTEMPTS_OPT, alias: ATTEMPTS_OPT_ALIAS, type: Number, defaultValue: ATTEMPTS_LIMIT}
      ]
    };

    this.clArgs = new ArgsUtil(this.allowedArgs);

    this.reconnectionsCount = 0;
  }
  /**
   * Load
   * @param page {number}
   * @returns {Promise}
   */
  getPage(page) {
    // news paths
    const NEWS_PATH = 'news?p=';
    const NEWS_BASE_PATH = 'https://news.ycombinator.com/';

    return new Promise((resolve, reject) => {
      request(utils.getPathWithPage(NEWS_BASE_PATH, NEWS_PATH, page), (err, response, body) => {
        if (err) return reject(err);

        resolve(body);
      });
    });
  }


  /**
   *
   * @param page
   * @returns {Promise.<Array>}
   */
  processPage(page) {
    // define page classes for future scrapping using them
    // const PAGINATE_CLASS = '.morelink';
    // const CONTAINER_CLASS = '.itemlist';
    const COMMENT_ELEM_NUMBER = 2;

    const ITEM_CLASS = '.athing';
    const ITEM_RANK_CLASS = '.rank';
    const ITEM_POINTS_CLASS = '.score';
    const ITEM_URI_CLASS = '.storylink';
    const ITEM_AUTHOR_CLASS = '.hnuser';
    const ITEM_TITLE_CLASS = '.storylink';
    const ITEM_SUBTEXT_CLASS = '.subtext';

    const RANK_REGEXP = /^(\d+)\.$/i;
    const POINTS_REGEXP = /^(\d+)\s(point(|s))$/i;
    const COMMENTS_REGEXP = /^(\d+)\s(comment(|s))$/i;

    /**
     * Allow to get post validation schema
     */
    function getPostSchema () {
      // validation options
      const STRING_MAX_LENGTH = 256;

      // define object validation schema to get only valuable data
      const postSchema = joi.object().keys({
        title: joi.string().min(1).max(STRING_MAX_LENGTH).required(),
        uri: joi.string().uri().required(),
        author: joi.string().max(STRING_MAX_LENGTH).required(),
        points: joi.number().integer().positive().required(),
        comments: joi.number().integer().positive().required(),
        rank: joi.number().integer().positive().required()
      });

      return postSchema;
    }

    /**
     * Helper function to get number from the string using regExp
     * @param string {string}
     * @param regExp {regexp}
     * @returns {number}
     */
    function getCountByRegExp(string, regExp) {
      let _res = regExp.exec(string);

      return _res ? _res[1] : 0;
    }

    let result = [];
    let $ = cheerio.load(page);

    $(ITEM_CLASS).each(function (index, elem) {
      let data = $(elem);

      let title = data.find(ITEM_TITLE_CLASS).text();
      let uri = data.find(ITEM_URI_CLASS).attr('href');
      let author = data.next().find(ITEM_AUTHOR_CLASS).text();
      let rank = data.find(ITEM_RANK_CLASS).text();
      let comments = data.next().find(ITEM_SUBTEXT_CLASS).children('a').eq(COMMENT_ELEM_NUMBER).text();
      let points = data.next().find(ITEM_POINTS_CLASS).text();

      // write normalised(filtered by regexp) values
      rank = RANK_REGEXP.exec(rank)[1];
      points = getCountByRegExp(points, POINTS_REGEXP);
      comments = getCountByRegExp(comments, COMMENTS_REGEXP);

      let story = {
        title,
        uri,
        author,
        points,
        comments,
        rank
      };

      // validate story object
      utils.validate(story, getPostSchema())
        .then(_res => result.push(_res));
    });

    return Promise.resolve(result);
  }

  /**
   * Load all necessary data
   * @returns {Promise.<TResult>}
   */
  loadData(postsCount) {
    let self = this;
    let page = 1;
    let count = 0;
    let result = [];

    /**
     * load pages' data recursively
     * @returns {Promise.<TResult>}
     */
    let loadPageData = function loadPageData() {
      return self.getPage(page)
        .then(self.processPage)
        .then(pageData => {
          if (pageData.length) {
            result = result.concat(pageData);
          }

          page++;
          count = result.length;

          if (count < postsCount) {
            return loadPageData(); // load next page data
          } else {
            if (count > postsCount) {
              return result.splice(0, postsCount); // return only desired posts count
            }

            return result;
          }
        });
    };

    return loadPageData();
  }

  /**
   * Let dreams come true!
   * @returns {Promise}
   */
  run() {
    let self = this;

    /**
     * Print pretty results to stdout
     * @param stories {array}
     * @param waiting {interval}
     * @returns {*}
     */
    function printResults(stories, waiting) {
      /**
       * Reset reconnections counter
       */
      function resetReconnectionsCount() {
        this.reconnectionsCount = 0;
      }

      resetReconnectionsCount.call(self);
      clearInterval(waiting);

      // console.log(pd.json(stories));
      process.stdout.write(pd.json(stories) + '\n'); // write to stdout

      if (self.clArgs.args[STATS_OPT]) {
        console.timeEnd('Time spent while getting top stories');
      }

      return stories;
    }

    /**
     * Log error has occurred and retry to load data
     * @param error {error}
     */
    function handleError(error) {
      if (self.clArgs.args[MESSAGES_OPT]) {
        console.error('\nSorry, an error occurred while loading your data: %s', error);
      }

      if (self.clArgs.args[RECONNECT_OPT]) {
        if (self.reconnectionsCount >= self.clArgs.args[ATTEMPTS_OPT]) {
          if (self.clArgs.args[MESSAGES_OPT]) {
            console.log('\nSorry, can\'t load stories. Please, try again!');
          }

          process.exit(1);
        } else {
          self.reconnectionsCount++;

          if (self.clArgs.args[MESSAGES_OPT]) {
            console.log('\nTrying to reconnect... (%s attempt)', self.reconnectionsCount);
          }

          self.run();
        }
      }
    }

    let waiting;
    // check presence of first arg 'hackernews'
    this.clArgs.checkFirstArg(FIRST_ARG);
    // get posts count according to limit
    let postsCount = this.clArgs.checkNumArg(POSTS_OPT, this.postsLimit);

    if (this.clArgs.args[STATS_OPT]) {
      console.time('Time spent while getting top stories');
    }

    // Show this message before loading data
    if (this.clArgs.args[MESSAGES_OPT]) {
      process.nextTick(() => {
        console.log('Please, wait while loading and preparing data. It will take a while.');
        // make waiting more fun
        waiting = setInterval(() => {
          process.stdout.write(`.`);
        }, 1000);
      });
    }

    process.nextTick(() => {
      this.loadData(postsCount)
        .then(result => printResults(result, waiting))
        .catch(handleError)
    });
  }
}

module.exports = PageScraper;
