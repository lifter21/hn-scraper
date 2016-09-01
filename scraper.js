'use strict';

console.time('Time spent while getting top stories');

// module dependencies
const joi = require('joi');
const path = require('path');
const request = require('request');
const pd = require('pretty-data2').pd;
const commandLineArgs = require('command-line-args');

// --posts n option default value, and config commandLineArgs tool by explicitly defining option name, its alias and format
let postsCount;
const POSTS_KEY = 'posts';
let reconnectionsCount = 0;
const DEFAULT_POSTS_COUNT = 100;
const RECONNECTIONS_ATTEMPTS = 10;
const optionDefinitions = [{name: POSTS_KEY, alias: 'p', type: Number}];
const options = commandLineArgs(optionDefinitions);

// api paths
const EXT = '.json';
const STORY_BASE_PATH = 'item/';        //https://hacker-news.firebaseio.com/v0/item/160705.json
const CODE_PHRASE = 'hackernews';
const TOP_STORIES_PATH = 'topstories';  // https://hacker-news.firebaseio.com/v0/topstories.json
const HACKER_NEWS_API_URL = 'https://hacker-news.firebaseio.com/v0/';

const STRING_MAX_LENGTH = 256;

const validationOptions = {
    stripUnknown: true,
    abortEarly: true,
    convert: true
};

// define object validation schema to get only valuable data
const storySchema = joi.object().keys({
    url: joi.string().uri().required(),                           // uri
    by: joi.string().max(STRING_MAX_LENGTH).required(),           // author
    score: joi.number().integer().positive().required(),          // points
    descendants: joi.number().integer().positive().required(),     // comments count
    title: joi.string().min(1).max(STRING_MAX_LENGTH).required() // title
});

/**
 * Check if the 'hackernews' code phrase is present
 */
function checkCodePhrase () {
    var firstArg = process.argv[2];

    if (!firstArg || firstArg !== CODE_PHRASE) {
        console.log('Nothing to do!');
        process.exit(0);
    }
}

/**
 * Check if --post option is present 
 */
function checkPostsOption () {
    postsCount = options[POSTS_KEY];
    
    if (0 >= postsCount) {
        console.log('Nothing to do! No posts');
        process.exit(0);
    } else if (!postsCount) {
        console.error('--posts is not defined! Use standart value %s', DEFAULT_POSTS_COUNT);
        postsCount = DEFAULT_POSTS_COUNT;
    } else if (postsCount > DEFAULT_POSTS_COUNT) {
        console.error('--posts is larger then %s! Use standart value %s', DEFAULT_POSTS_COUNT, DEFAULT_POSTS_COUNT);
        postsCount = DEFAULT_POSTS_COUNT;
    }
}

/**
 * Helps to generate valid api path
 * @param {string} pathString
 * @returns {string}
 */
function getFullPath(pathString) {
    return path.format({root: HACKER_NEWS_API_URL, name: pathString, ext: EXT});
}

/**
 *  Load all top stories ids
 * @returns {Promise}
 */
function getAllStoriesIds() {
    let ids;

    return new Promise((resolve, reject) => {
        let path = getFullPath(TOP_STORIES_PATH);

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
function getStoryById(id) {
    let story;
    let path = getFullPath(STORY_BASE_PATH + id);


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
function getStoriesByIds(ids) {
    let tasks = [];

    ids.forEach(id => {
        tasks.push(getStoryById(id));
    });
    
    return Promise.all(tasks);
}

/**
 * 
 * @param ids
 * @returns {Promise}
 */
function processStoriesByIds(ids) {
    let result = [];
    
    let _ids = Object.assign([], ids); // make a copy of initial data
    _ids = _ids.sort((a, b) => a < b); // sort stories ids from newest to oldest

    let cutIds = count => _ids.splice(0, count); // get only defined coutnt of stories
    let processingIds = cutIds(postsCount);
    
    // recursively load stories data
    let processStories = ids => {
        return getStoriesByIds(ids)
            .then(stories => {
                stories.forEach(story => {
                    // validate loaded data
                    let _res = joi.validate(story, storySchema, validationOptions);

                    if (_res.error) return;
                    
                    result.push(_res.value); // push valid story object to result array
                });

                if (!_ids.length) return result; // if all top stories have processed and nothing to do now

                if (result.length < postsCount) {
                    processingIds = cutIds(postsCount - result.length); // take only missing count of posts
                    
                    return processStories(processingIds); // get other stories if result array still is not full
                }  else {
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
function mapStories(stories) {
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
            rank: i+1
        };
    });

    return stories;
}

// make waiting more fun
let waiting = setInterval(() => {
    process.stdout.write('.');
}, 1000);

/**
 * Print pretty results to stdout
 * @param stories {array}
 * @returns {*}
 */
function printResults(stories) {
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
});

/**
 * Let dreams come true!
 * @returns {Promise}
 */
function run() {
    process.nextTick(() => {
        return getAllStoriesIds()
            .then(processStoriesByIds)
            .then(mapStories)
            .then(printResults)
            .catch(handleError);
    });
}

checkCodePhrase();
checkPostsOption();
run();