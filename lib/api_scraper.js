'use strict';

// module dependencies
const joi = require('joi');
const _ = require('lodash');
const request = require('request');
const pd = require('pretty-data2').pd;

const utils = require('.').utils;
const ArgsUtil = require('.').ArgsUtil;
const PageScraper = require('.').PageScraper;

// api paths

const STRING_MAX_LENGTH = 256;

// define object validation schema to get only valuable data
const storySchema = joi.object().keys({
  url: joi.string().uri().required(),                           // uri
  by: joi.string().max(STRING_MAX_LENGTH).required(),           // author
  score: joi.number().integer().positive().required(),          // points
  descendants: joi.number().integer().positive().required(),     // comments count
  title: joi.string().min(1).max(STRING_MAX_LENGTH).required() // title
});

class ApiScraper extends PageScraper {
  constructor(opts) {
    super(opts);

    this.allowedArgs.options.push({name: 'type', alias: 't', type: String, defaultValue: this.apiOpts.storiesPath});

    this.apiOpts = {
      ext: '.json',
      itemPath: 'item/',
      apiUrl: 'https://hacker-news.firebaseio.com/v0/',
      storiesPath: 'topstories'
    };

  }

  /**
   *  Load all top stories ids
   * @returns {Promise}
   */
  getAllStoriesIds() {
    let ids;

    return new Promise((resolve, reject) => {
      let path = utils.getPathWithExt(HACKER_NEWS_API_URL, STORIES_PATH, EXT);

      request(path, (err, response, body) => {
        if (err) return reject(err);

        try {
          ids = JSON.parse(body);
        } catch (e) {
          return reject(e);
        }

        resolve(ids);
      });
    });
  }

  /**
   * Load story data from APU
   * @param id {int}
   * @returns {Promise}
   */
  getStoryById(id) {
    let story;
    let path = utils.getPathWithExt(this.apiOpts.apiUrl, this.clArgs.args.type + id, this.apiOpts.ext);

    return new Promise((resolve, reject) => {
      setImmediate(function () {
        request(path, (err, response, body) => {
          if (err) return reject(err);

          try {
            story = JSON.parse(body);
          } catch (e) {
            return reject(e);
          }

          resolve(story);
        });
      });
    });
  }

  /**
   * Load stories from API
   * @param ids {array}
   * @returns {Promise}
   */
  getStoriesByIds(ids) {
    let tasks = [];

    ids.forEach(id => {
      tasks.push(this.getStoryById(id));
    });

    return Promise.all(tasks);
  }

  /**
   *
   * @param ids
   * @returns {Promise}
   */
  processStoriesByIds(ids, postsCount) {
    let self = this;
    let result = [];

    let _ids = Object.assign([], ids); // make a copy of initial data
    _ids = _ids.sort((a, b) => a < b); // sort stories ids from newest to oldest

    let cutIds = count => _ids.splice(0, count); // get only defined coutnt of stories
    let processingIds = cutIds(postsCount);

    // recursively load stories data
    let processStories = ids => {
      return self.getStoriesByIds(ids)
        .then(stories => {
          stories.forEach(story => {
            // validate loaded data
            utils.validate(story, storySchema)
              .then(res => result.push(res.value)); // push valid story object to result array
          });

          if (!_ids.length) return result; // if all top stories have processed and nothing to do now

          if (result.length < postsCount) {
            processingIds = cutIds(postsCount - result.length); // take only missing count of posts

            return processStories(processingIds); // get other stories if result array still is not full
          } else {
            return result;
          }
        });
    };

    return processStories(processingIds);
  }

  /**
   * Map stories data
   * @param stories {array}
   * @returns {Array|*}
   */
  mapStories(stories) {
    // sort stories from lowers score to highest
    stories = stories.sort((a, b) => {
      return a.score > b.score;
    });

    // prepare a story view is needed
    stories = stories.map((story, i) => {
      return {
        title: story.title,
        uri: story.url,
        author: story.by,
        points: story.score,
        comments: story.descendants,
        rank: i + 1
      };
    });

    return stories;
  }

  /**
   * Let dreams come true!
   * @returns {Promise}
   */
  run() {
    let self = this;
    let waiting;

    /**
     * Print pretty results to stdout
     * @param stories {array}
     * @returns {*}
     */
    function printResults(stories) {
      console.time('Time spent while getting top stories');

      clearInterval(waiting);
      // console.log(pd.json(stories));
      process.stdout.write(pd.json(stories) + '\n'); // write to stdout
      console.timeEnd('Time spent while getting top stories');

      return stories;
    }

    /**
     * Log error has occurred and retry to load data
     * @param error {error}
     */
    function handleError(error) {
      console.error('\n Sorry, an error occured while loading your data. Trying to reconnect %s', error);

      reconnectionsCount++;
      run();

      if (reconnectionsCount > RECONNECTIONS_ATTEMPTS) {
        console.log('Sorry, can\'t load stories. Please, try again!');
        process.exit(1);
      }
    }
    // Show this message before loading data
    process.nextTick(() => {
      console.log('Please, wait while loading and preparing data. It will take a while.');
      // make waiting more fun
      waiting = setInterval(() => {
        process.stdout.write('.');
      }, 1000);
    });
    process.nextTick(() => {
      return getAllStoriesIds()
        .then(processStoriesByIds)
        .then(mapStories)
        .then(printResults)
        .catch(handleError);
    });
  }
}

module.exports = ApiScraper;
