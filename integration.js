const request = require('request');
const async = require('async');
const config = require('./config/config');
const crypto = require('crypto');
const fs = require('fs');

let Logger;
let requestWithDefaults;
const MAX_LOOKBACK_DAYS = 360;
const blockedOwners = [];
const allowedOwners = [];

function startup(logger) {
  Logger = logger;
  let defaults = {};

  if (typeof config.request.cert === 'string' && config.request.cert.length > 0) {
    defaults.cert = fs.readFileSync(config.request.cert);
  }

  if (typeof config.request.key === 'string' && config.request.key.length > 0) {
    defaults.key = fs.readFileSync(config.request.key);
  }

  if (typeof config.request.passphrase === 'string' && config.request.passphrase.length > 0) {
    defaults.passphrase = config.request.passphrase;
  }

  if (typeof config.request.ca === 'string' && config.request.ca.length > 0) {
    defaults.ca = fs.readFileSync(config.request.ca);
  }

  if (typeof config.request.proxy === 'string' && config.request.proxy.length > 0) {
    defaults.proxy = config.request.proxy;
  }

  if (typeof config.request.rejectUnauthorized === 'boolean') {
    defaults.rejectUnauthorized = config.request.rejectUnauthorized;
  }

  requestWithDefaults = request.defaults(defaults);
}

function getSummaryTags(results) {
  const tags = [];
  let objectCount = 0;
  const groups = Object.keys(results);
  groups.forEach((group) => {
    objectCount += results[group].groupObjects.length;
  });
  tags.push(`Number of results: ${objectCount}`);
  return tags;
}

function doLookup(entities, options, cb) {
  const lookupResults = [];
  Logger.trace({ entities, options }, 'doLookup');
  async.each(
    entities,
    (entity, done) => {
      getThreatConnectOwners(entity, options, (err, results) => {
        if (err) {
          return done(err);
        }

        if (Object.keys(results).length > 0) {
          lookupResults.push({
            entity,
            data: {
              summary: [getSummaryTags(results)],
              details: results
            }
          });
        } else {
          lookupResults.push({
            entity,
            data: null
          });
        }
        done();
      });
    },
    (err) => {
      Logger.trace({ lookupResults }, 'Lookup Results');
      cb(err, lookupResults);
    }
  );
}

// Retrieves all owners from ThreatConnect
// https://docs.threatconnect.com/en/latest/rest_api/owners/owners.html#retrieving-multiple-owners
function getThreatConnectOwners(entity, options, cb) {
  request(
    {
      uri: options.url + '/api/v2/owners',
      method: 'GET',
      headers: getHeaders('/api/v2/owners', 'GET', options),
      json: true
    },
    function (err, response, body) {
      if (err) {
        return cb(err);
      }
      Logger.trace({ body }, 'getThreatConnectOwners');
      parseThreatConnectOwners(entity, body.data.owner, options, cb);
    }
  );
}

// Filters out owners based on allow/block list. Used to help reduce client side cycles or low fidelity data.
function parseThreatConnectOwners(entity, owners, options, cb) {
  let validOwners = [];
  const ownerResults = {};

  if (allowedOwners.length > 0) {
    Logger.trace({ allowedOwners }, 'Filtering on allowed owners');
    validOwners = owners.filter(function (owner) {
      return allowedOwners.includes(owner.name);
    }, owners);
  } else if (blockedOwners.length > 0) {
    Logger.trace({ blockedOwners }, 'Filtering on blocked owners');
    validOwners = owners.filter(function (owner) {
      return !blockedOwners.includes(owner.name);
    }, owners);
  } else {
    Logger.trace('No owners were filtered - using all available.');
    validOwners = owners;
  }
  Logger.trace({ validOwners }, 'Valid Owners');

  async.each(
    validOwners,
    function (owner, done) {
      retrieveThreatConnectGroupObjects(entity, owner, options, (err, ownerResult) => {
        if (err) {
          return done(err);
        }
        if (Array.isArray(ownerResult) && ownerResult.length > 0) {
          ownerResults[owner.name] = {
            collapsed: true,
            groupObjects: ownerResult
          };
        }
        done();
      });
    },
    (err) => {
      cb(err, ownerResults);
    }
  );
}

// All groups are returned because TC does not support the necessary server side filtering for this use case. They only support name "starts with" or name "is", not "contains".
// Group are retrieved using this API
// https://docs.threatconnect.com/en/latest/rest_api/groups/groups.html#retrieve-all-groups
// Time filter is added with this syntax
// https://docs.threatconnect.com/en/latest/rest_api/groups/groups.html#filtering-groups
// Owner is specified with this syntax
// https://docs.threatconnect.com/en/latest/rest_api/overview.html#specifying-an-owner
// Result limit is capped at 10,000
// https://docs.threatconnect.com/en/latest/rest_api/overview.html#pagination
function retrieveThreatConnectGroupObjects(entity, owner, options, cb) {
  const encodedOwner = encodeURIComponent(owner.name);
  let now = new Date();
  now.setDate(now.getDate() - MAX_LOOKBACK_DAYS);
  let formattedLookback = now.toISOString().split('T')[0];
  let urlPath = `/api/v2/groups/?owner=${encodedOwner}&resultLimit=10000&filters=dateAdded%3E${formattedLookback}`;
  request(
    {
      uri: options.url + urlPath,
      method: 'GET',
      headers: getHeaders(urlPath, 'GET', options),
      json: true
    },
    function (err, response, body) {
      if (err) {
        return cb(err);
      }
      Logger.trace({ body }, 'retrieveThreatConnectGroupObjects');
      let ownerResult = [];

      if (body.hasOwnProperty('data') && body.data.hasOwnProperty('group')) {
        ownerResult = filterGroupsOnPhrase(entity, body.data.group, owner.name, options);
      } else {
        Logger.trace(owner.name + ' did not return any groups');
      }
      cb(null, ownerResult);
    }
  );
}

// Final function in chain. Outputs groups that contain the keyword/phrase to console.
function filterGroupsOnPhrase(entity, groups, ownerName, options) {
  //let ownerResults = [];
  Logger.trace('Filtering ' + ownerName + "'s groups based on inputted phrase");

  let keywordMatches = groups.filter(function (group) {
    return group.name.toLowerCase().includes(entity.value.toLowerCase());
  }, groups);

  if (keywordMatches.length > 0) {
    // Removes keys we do not want in Polarity results.
    keywordMatches.map(function (group) {
      delete group['ownerName'];
      delete group['id'];
    });
    //ownerResults[ownerName] = keywordMatches;
    Logger.trace({ keywordMatches }, 'Owner Results');
  } else {
    Logger.trace(ownerName + ' did not contain the inputted phrase');
  }

  return keywordMatches.slice(0, options.resultLimit);
}

function getHeaders(urlPath, httpMethod, options) {
  let timestamp = Math.floor(Date.now() / 1000);
  return {
    Authorization: getAuthHeader(urlPath, httpMethod, timestamp, options),
    TimeStamp: timestamp
  };
}

function getAuthHeader(urlPath, httpMethod, timestamp, options) {
  let signature = urlPath + ':' + httpMethod + ':' + timestamp;
  let hmacSignatureInBase64 = crypto.createHmac('sha256', options.apiKey).update(signature).digest('base64');
  return 'TC ' + options.accessId + ':' + hmacSignatureInBase64;
}

module.exports = {
  doLookup,
  startup
};
