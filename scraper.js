'use strict';

console.time('Time spent while getting top stories');

// module dependencies
const joi = require('joi');
const path = require('path');
const cheerio = require('cheerio');
const request = require('request');
const pd = require('pretty-data2').pd;
const commandLineArgs = require('command-line-args');

// --posts n option default value, and config commandLineArgs tool by explicitly defining option name, its alias and format
let postsCount;
const CODE_PHRASE = 'hackernews';
const POSTS_KEY = 'posts';
let reconnectionsCount = 0;
const DEFAULT_POSTS_COUNT = 100;
const RECONNECTIONS_ATTEMPTS = 10;
const optionDefinitions = [{name: POSTS_KEY, alias: 'p', type: Number}];
const options = commandLineArgs(optionDefinitions);

// news paths
const NEWS_PATH = 'news?p=';
const NEWS_BASE_PATH = 'https://news.ycombinator.com/';


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

const RANK_REGEXP = /^(\d+)\.$/i ;
const POINTS_REGEXP = /^(\d+)\s(point(|s))$/i;
const COMMENTS_REGEXP = /^(\d+)\s(comment(|s))$/i ;

// validation options
const STRING_MAX_LENGTH = 256;
const validationOptions = {
    stripUnknown: true,
    abortEarly: true,
    convert: true
};

// define object validation schema to get only valuable data
const storySchema = joi.object().keys({
    title: joi.string().min(1).max(STRING_MAX_LENGTH).required(),
    uri: joi.string().uri().required(),
    author: joi.string().max(STRING_MAX_LENGTH).required(),
    points: joi.number().integer().positive().required(),
    comments: joi.number().integer().positive().required(),
    rank: joi.number().integer().positive().required()
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
 * @param {string} page
 * @returns {string}
 */
function getPathByPage(page) {
    return path.format({root: NEWS_BASE_PATH, name: `${NEWS_PATH + page}`});
}

/**
 *
 * @param page {number}
 * @returns {Promise}
 */
function getPage(page) {
    return new Promise((resolve, reject) => {
        request(getPathByPage(page), (err, response, body) => {
            if (err) return reject(err);

            resolve(body);
        });
    });
}

/**
 * Helper function to get number from the string using regExp
 * @param string {string}
 * @param regExp {regexp}
 * @returns {number}
 */
function getCountByRegExp (string, regExp) {
    let _res = regExp.exec(string);

    return _res ? _res[1] : 0;
}

/**
 *
 * @param page
 * @returns {Promise.<Array>}
 */
function processPage(page) {
    let result = [];

    let $ = cheerio.load(page);

    $(ITEM_CLASS).each(function(index, elem) {
        let data = $(elem);

        let title = data.find(ITEM_TITLE_CLASS).text();
        let uri = data.find(ITEM_URI_CLASS).attr('href');
        let author = data.next().find(ITEM_AUTHOR_CLASS).text();
        let rank = data.find(ITEM_RANK_CLASS).text();
        let comments = data.next().find(ITEM_SUBTEXT_CLASS).children('a').eq(COMMENT_ELEM_NUMBER).text();
        let points = data.next().find(ITEM_POINTS_CLASS).text();

        // write normalised(filtered by regexp) values
        rank =  RANK_REGEXP.exec(rank)[1];
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
        let _validation = joi.validate(story, storySchema, validationOptions);
        if (_validation.error) return; // go to the next element if story object is not valid

        result.push(_validation.value);
    });

    return Promise.resolve(result);
}

/**
 * Load all necessary data
 * @returns {Promise.<TResult>}
 */
function loadData() {
    let page = 1;
    let count = 0;
    let result = [];

    /**
     * load pages' data recursively
     * @returns {Promise.<TResult>}
     */
    let loadPageData = function loadPageData() {
        return getPage(page)
            .then(processPage)
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
        loadData()
            .then(printResults)
            .catch(handleError)
    });
}

checkCodePhrase();
checkPostsOption();

run();
