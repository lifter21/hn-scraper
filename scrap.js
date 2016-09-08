'use strict';

const ApiScraper = require('./lib').ApiScraper;

if (module.parent) {
  return ApiScraper;
} else {
  let loader = new ApiScraper({postsLimit: 100});
  loader.run();
}
