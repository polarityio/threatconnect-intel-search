const request = require('request');
const async = require('async');

let Logger;

function startup(logger) {
  Logger = logger;
}

function doLookup(entities, options, cb) {
  const lookupResults = [];
  Logger.trace({ entities, options }, 'doLookup');
  async.each(entities, (entity, done) => {
    const requestOptions = {
      uri: 'https://httpbin.org/get',
      json: true,
      qs: {
        query: entity.value,
        apiKey: options.apiKey
      }
    };

    request(requestOptions, (err, response, body) => {
      if (err) {
        return done(err);
      }

      if (response.statusCode === 200) {
        lookupResults.push({
          entity,
          data: {
            summary: [body.origin],
            details: body
          }
        });
        done();
      } else {
        done(`Unexpected HTTP status code ${response.statusCode}`);
      }
    });
  }, (err) => {
    cb(err, lookupResults);
  });
}

function onDetails(lookupResult, options, cb) {
  setTimeout(() => {
    lookupResult.data.summary.push('This is a new tag');
    cb(null, lookupResult.data);
  }, 3000);
}

module.exports = {
  doLookup,
  startup,
  onDetails
};

