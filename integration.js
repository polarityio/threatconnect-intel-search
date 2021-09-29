const request = require('request');
const async = require('async');
const config = require('./config/config');
const crypto = require('crypto');
const fs = require('fs');
const schedule = require('node-schedule');

let Logger;
let requestWithDefaults;
const owners = null;

const CRON_ONCE_PER_HOUR = '0 * * * *';

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

// Returns total amount of group objects returned between all owners
function getSummaryTags(searchResults) {
  const tags = [];
  let objectCount = 0;
  const owners = Object.keys(searchResults);
  owners.forEach((owner) => {
    objectCount += searchResults[owner].groups.length;
  });
  tags.push(`Number of results: ${objectCount}`);
  return tags;
}

function doLookup(entities, options, cb) {
  const lookupResults = [];

  Logger.trace({ entities, options }, 'doLookup');

  async.each(
    entities,
    (entity, entityDone) => {
      async.waterfall(
        [
          function (next) {
            getThreatConnectOwners(entity, options, next);
          },
          function (owners, next) {
            const filteredOwners = getFilteredOwners(owners, options);
            getGroupsForEachOwner(filteredOwners, options, next);
          },
          function (ownerToGroupsMapping, next) {
            const owners = Object.keys(ownerToGroupsMapping);
            const searchResults = {};
            owners.forEach((owner) => {
              const searchMatches = searchGroups(entity.value.toLowerCase(), ownerToGroupsMapping[owner]);
              const searchMatchesWithLimit = searchMatches.slice(0, options.resultLimit);
              const filteredSearchMatchesWithLimit = searchMatchesWithLimit.filter((group) =>
                options.validGroupTypes.some(
                  (validType) => validType.display.toLowerCase() === group.type.toLowerCase()
                )
              );

              if(filteredSearchMatchesWithLimit.length > 0){
                searchResults[owner] = {
                  groups: filteredSearchMatchesWithLimit
                };
              }
            });
            next(null, searchResults);
          }
        ],
        (err, searchResults) => {
          if (err) {
            return entityDone(err);
          }

          if (Object.keys(searchResults).length > 0) {
            lookupResults.push({
              entity,
              data: {
                summary: [getSummaryTags(searchResults)],
                details: searchResults
              }
            });
          } else {
            lookupResults.push({
              entity,
              data: null
            });
          }

          entityDone();
        }
      );
    },
    (err) => {
      Logger.trace({ lookupResults }, 'Lookup Results');
      cb(err, lookupResults);
    }
  );
}

/**
 * Returns an array of all TC Owners
 * https://docs.threatconnect.com/en/latest/rest_api/owners/owners.html#retrieving-multiple-owners
 * @param entity
 * @param options
 * @param cb
 */
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

      Logger.trace({ body, statusCode: response.statusCode }, 'getThreatConnectOwners');

      if (response.statusCode === 200) {
        cb(null, body.data.owner);
      } else {
        cb({
          detail: `Unexpected status code ${response.statusCode} received.`,
          body: body
        });
      }
    }
  );
}

/**
 * Returns an Object keyed on the owner name where the values is an array of group objects associated with that
 * owner.
 *
 * @param entity
 * @param owners
 * @param options
 * @param cb
 */
function getGroupsForEachOwner(owners, options, cb) {
  const groupObjectsMap = {};
  async.each(
    owners,
    function (owner, done) {
      findGroupsByOwner(owner, options, (err, groupObjects) => {
        if (err) {
          return done(err);
        }

        groupObjectsMap[owner.name] = groupObjects;
        done();
      });
    },
    (err) => {
      cb(err, groupObjectsMap);
    }
  );
}

/**
 * All groups are returned for the given owner because TC does not support the necessary server side filtering for this use case.
 * They only support name "starts with" or name "is", not "contains".
 *
 * Group are retrieved using this API
 * https://docs.threatconnect.com/en/latest/rest_api/groups/groups.html#retrieve-all-groups
 *
 * Time filter is added with this syntax
 * https://docs.threatconnect.com/en/latest/rest_api/groups/groups.html#filtering-groups
 *
 * Owner is specified with this syntax
 * https://docs.threatconnect.com/en/latest/rest_api/overview.html#specifying-an-owner
 *
 * Result limit is capped at 10,000
 * https://docs.threatconnect.com/en/latest/rest_api/overview.html#pagination
 *
 * @param owner
 * @param options
 * @param cb
 */
function findGroupsByOwner(owner, options, cb) {
  const encodedOwner = encodeURIComponent(owner.name);
  const now = new Date();
  now.setDate(now.getDate() - options.maxLookbackDays);
  const formattedLookback = now.toISOString().split('T')[0];
  const urlPath = `/api/v2/groups/?owner=${encodedOwner}&resultLimit=10000&filters=dateAdded%3E${formattedLookback}`;

  request(
    {
      uri: options.url + urlPath,
      method: 'GET',
      headers: getHeaders(urlPath, 'GET', options),
      json: true
    },
    (err, response, body) => {
      if (err) {
        return cb(err);
      }
      Logger.trace({ body }, 'retrieveThreatConnectGroupObjects');

      if (body && body.data && body.data.group) {
        cb(null, body.data.group);
      } else {
        cb(null, []);
      }
    }
  );
}

/**
 * Searches each group in the groups array for a match on group name against the searchTerm
 * @param searchTerm, the term to search within each group name
 * @param groups, array of groups to search
 * @returns {*} array of matching groups
 */
function searchGroups(searchTerm, groups) {
  let groupMatches = groups.filter((group) => group.name.toLowerCase().includes(searchTerm));

  // Removes keys we do not want in Polarity results.
  groupMatches = groupMatches.map((group) => {
    delete group['ownerName'];
    delete group['id'];
    return group;
  });

  return groupMatches;
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

/**
 * Filter owners based on either the organization block list or organization allow list set through the
 * integration options.
 * @param owners
 * @param options
 * @returns {*}
 */
function getFilteredOwners(owners, options) {
  if (options.searchBlocklist.trim().length > 0) {
    const blocklistedOrgs = createSearchOrgBlocklist(options);
    return owners.filter((owner) => !blocklistedOrgs.has(owner.name.toLowerCase()));
  } else if (options.searchAllowlist.trim().length > 0) {
    const allowlistedOrgs = createSearchOrgAllowlist(options);
    return owners.filter((owner) => allowlistedOrgs.has(owner.name.toLowerCase()));
  } else {
    return owners;
  }
}

/**
 * Create a block list of organizations based on the options
 *
 * @param options
 * @returns {Set<any>} Set of blocklisted organizations (i.e., owners)
 */
function createSearchOrgBlocklist(options) {
  const blocklistedOrgs = new Set();

  if (typeof options.searchBlocklist === 'string' && options.searchBlocklist.trim().length > 0) {
    let tokens = options.searchBlocklist.split(',');
    tokens.forEach((token) => {
      token = token.trim().toLowerCase();
      if (token.length > 0) {
        blocklistedOrgs.add(token);
      }
    });
    return blocklistedOrgs;
  }
}

/**
 * Create an allow list of organizations based on the options
 * @param options
 * @returns {Set<any>} Set of allowed organizations (i.e., owners)
 */
function createSearchOrgAllowlist(options) {
  const allowlistedOrgs = new Set();

  if (typeof options.searchAllowlist === 'string' && options.searchAllowlist.trim().length > 0) {
    let tokens = options.searchAllowlist.split(',');
    tokens.forEach((token) => {
      token = token.trim().toLowerCase();
      if (token.length > 0) {
        allowlistedOrgs.add(token);
      }
    });
    return allowlistedOrgs;
  }
}

module.exports = {
  doLookup,
  startup
};
