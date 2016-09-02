# Hacker News scraper

### How to run it

In your terminal console run

`npm start`

with default `--posts` count `100`.

If you run script with `node`, you need to provide `hackernews` as first arg after file and `posts` as second arg:

`node scrap hackernews -p 10 `

or

`node scrap hackernews --posts 10 `

or

`node scrap hackernews --posts=10 `

If you use Docker or Docker-compose next commands helps you to run script:

Dockerfile:

1. Build:

 `docker build -t scraper .`
2. Run:

`docker run -it scraper`

Docker-compose:

1. Build:

`docker-compose build scraper`

2. Up (run container with default command: `node scrap hackernews --posts 100`):

`docker-compose up scraper`
3. Run bash into container:

`docker-compose run scraper bash`,

and then run inside container one of the commands as described above.

##### Project dependencies:
1. [command-line-args](https://www.npmjs.com/package/command-line-args) - used for explicitly defining and processing command line args

2. [joi](https://www.npmjs.com/package/joi) - used for validating and mapping objects

3. [pretty-data2](https://www.npmjs.com/package/pretty-data2) - used for formatting output in disered format

4. [request](https://www.npmjs.com/package/request) - used for requesting data from hackernews API

5. [x-ray](https://www.npmjs.com/package/x-ray) - used for scraping data