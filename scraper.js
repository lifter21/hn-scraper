'use strict';

const PageScraper = require('./lib').PageScraper;

if (module.parent) {
  return PageScraper;
} else {
  let scraper = new PageScraper({postsLimit: 200});

  scraper.run();
}
