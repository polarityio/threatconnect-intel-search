const request = require('request');
const async = require('async');
const config = require('./config/config');
const fs = require('fs');

let Logger;
let requestWithDefaults;

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

function doLookup(entities, options, cb) {
  const lookupResults = [];
  Logger.trace({ entities, options }, 'doLookup');
  async.each(
    entities,
    (entity, done) => {
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
    },
    (err) => {
      cb(err, lookupResults);
    }
  );
}

// Retreives all owners from ThreatConnect
// https://docs.threatconnect.com/en/latest/rest_api/owners/owners.html#retrieving-multiple-owners
function getThreatConnectOwners() {
  request(
    {
      uri: baseUrl + '/api/v2/owners',
      method: 'GET',
      headers: getHeaders('/api/v2/owners', 'GET'),
      json: true
    },
    function (err, response, body) {
      Logger.trace('Returned owners from ThreatConnect\n');
      Logger.trace(body.data.owner);
      parseThreatConnectOwners(body.data.owner);
    }
  );
}

// Filters out owners based on allow/block list. Used to help reduce client side cycles or low fidelity data.
function parseThreatConnectOwners(owners) {
  let validOwners = [];
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
  async.each(validOwners, function (owner) {
    retrieveThreatConnectGroupObjects(owner);
  });
}

// All groups are returned because TC does not support the necessary server side filtering for this use case. They only support name "starts with" or name "is", not "contains".
// Group are retrieved using this API
// https://docs.threatconnect.com/en/latest/rest_api/groups/groups.html#retrieve-all-groups
// Time filter is added with this syntax
// https://docs.threatconnect.com/en/latest/rest_api/groups/groups.html#filtering-groups
// Owner is specified with this syntex
// https://docs.threatconnect.com/en/latest/rest_api/overview.html#specifying-an-owner
// Result limit is capped at 10,000
// https://docs.threatconnect.com/en/latest/rest_api/overview.html#pagination
function retrieveThreatConnectGroupObjects(owner) {
  const encodedOwner = encodeURIComponent(owner.name);
  let now = new Date();
  now.setDate(now.getDate() - maxLookbackDays);
  let formattedLookback = now.toISOString().split('T')[0];
  let urlPath = '/api/v2/groups/?owner=' + encodedOwner + '&resultLimit=10000&filters=dateAdded%3E' + formattedLookback;
  request(
    {
      uri: baseUrl + urlPath,
      method: 'GET',
      headers: getHeaders(urlPath, 'GET'),
      json: true
    },
    function (err, response, body) {
      if (body.hasOwnProperty('data') && body.data.hasOwnProperty('group')) {
        filterGroupsOnPhrase(body.data.group, owner.name);
      } else {
        Logger.trace(owner.name + ' did not return any groups');
      }
    }
  );
}

// Final function in chain. Outputs groups that contain the keyword/phrase to console.
function filterGroupsOnPhrase(groups, ownerName) {
  let ownerResults = {};
  Logger.trace('Filtering ' + ownerName + "'s groups based on inputted phrase");
  let keywordMatches = groups.filter(function (group) {
    return group.name.includes(lookupPhrase);
  }, groups);
  if (keywordMatches.length > 0) {
    // Removes keys we do not want in Polarity results.
    keywordMatches.map(function (group) {
      delete group['ownerName'];
      delete group['id'];
    });
    ownerResults[ownerName] = keywordMatches;
    Logger.trace({ ownerResults }, 'Owner Results');
  } else {
    Logger.trace(ownerName + ' did not contain the inputted phrase');
  }
}

function onDetails(lookupResult, options, cb) {
  setTimeout(() => {
    lookupResult.data.summary.push('This is a new tag');
    cb(null, lookupResult.data);
  }, 3000);
}

function getHeaders(urlPath, httpMethod) {
  let timestamp = Math.floor(Date.now() / 1000);
  return {
    Authorization: getAuthHeader(urlPath, httpMethod, timestamp),
    TimeStamp: timestamp
  };
}

function getAuthHeader(urlPath, httpMethod, timestamp) {
  let signature = urlPath + ':' + httpMethod + ':' + timestamp;
  let hmacSignatureInBase64 = crypto.createHmac('sha256', secretKey).update(signature).digest('base64');
  return 'TC ' + accessID + ':' + hmacSignatureInBase64;
}

module.exports = {
  doLookup,
  startup,
  onDetails
};
