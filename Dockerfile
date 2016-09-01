# Build:
# docker build -t scraper .
#
# Run:
# docker run -it scraper
# Exec:
# docker exec -it scraper bash
#
# Compose:
# docker-compose build scraper
# docker-compose up scraper
# docker-compose run scraper bash

FROM ubuntu:latest
MAINTAINER Alex Bondarenko

# Install Utilities
RUN apt-get update -q
RUN apt-get install -yqq wget ca-certificates aptitude htop vim git traceroute dnsutils curl ssh sudo tree tcpdump nano psmisc gcc make build-essential libfreetype6 libfontconfig libkrb5-dev

# Install NodeJS
#RUN curl -sL https://deb.nodesource.com/setup_6.x | sudo -E bash -
RUN curl -sL https://deb.nodesource.com/setup_6.x -o nodesource_setup.sh
RUN bash nodesource_setup.sh
RUN sudo apt-get install -yq nodejs

# Install MEAN.JS Prerequisites
RUN npm install --quiet -g grunt-cli gulp bower yo mocha karma-cli pm2 nodemon

RUN mkdir /opt/scraper
WORKDIR /opt/scraper

# Copies the local package.json file to the container
# and utilities docker container cache to not needing to rebuild
# and install node_modules/ everytime we build the docker, but only
# when the local package.json file changes.
# Install npm packages
ADD package.json /opt/scraper/package.json
RUN npm install --quiet

# Share local directory on the docker container
ADD . /opt/scraper

# Machine cleanup
RUN npm cache clean
RUN apt-get clean && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# Set development environment as default
ENV NODE_ENV development

# Ports generic
EXPOSE 80:80
EXPOSE 443:443

# Port 3000 for server
EXPOSE 3000:3000

# Port 5858 for node debug
EXPOSE 5858:5858

# Port 35729 for livereload
EXPOSE 35729:35729

# Run app
CMD ["npm", "start"]
