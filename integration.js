const request = require('request');
const async = require('async');
const config = require('./config/config');
const crypto = require('crypto');
const fs = require('fs');
const schedule = require('node-schedule');
const groupBy = require('lodash.groupby');

const GROUP_CACHE_LIMIT_PER_OWNER = 10000;
const CRON_ONCE_PER_HOUR = '0 * * * *';
//const CRON_ONCE_PER_FOUR_HOURS = '0 */4 * * *';
//const CRON_ONCE_PER_EIGHT_HOURS = '0 */8 * * *';
//const CRON_EVERY_NIGHT_AT_MIDNIGHT = '0 0 * * *'
//const CRON_ONCE_PER_MINUTE = '* * * * *';

let Logger;
let requestWithDefaults;
/**
 * Object containing cached group information for each owner
 *
 * ```
 * {
 *   'VXVault': [{}, {}, {}],
 *   'Technical Blogs and Reports': [{},{},{}]
 * }
 * ```
 * @type {null}
 */
let groupCache = null;

let groupCacheUpdateCronJob = null;

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

/**
 * Returns total amount of group objects returned between all owners
 *
 * @param searchResults
 * @returns {*[]}
 */
function getSummaryTags(searchResults) {
  const tags = [];
  let objectCount = 0;
  const owners = Object.keys(searchResults);
  owners.forEach((owner) => {
    objectCount += searchResults[owner].totalGroups;
  });
  tags.push(`Number of results: ${objectCount}`);
  return tags;
}

/**
 * Sets up the group cache update cron job
 *
 * @param options
 */
function setupCacheUpdateCron(options) {
  Logger.info('Initializing group update cron job');
  groupCacheUpdateCronJob = schedule.scheduleJob(CRON_ONCE_PER_HOUR, () => {
    cacheGroups(options, (err) => {
      if (err) {
        Logger.error({ err }, 'Failed to update cache');
      }
    });
  });
}

/**
 * Fetches all groups and caches them by owner name
 *
 * @param options
 * @param cb
 */
function cacheGroups(options, cb) {
  async.waterfall(
    [
      function (next) {
        getThreatConnectOwners(options, next);
      },
      function (owners, next) {
        getGroupsForEachOwner(owners, options, next);
      },
      function (ownerToGroupsMapping, next) {
        // Set the global group cache
        const ownerKeys = Object.keys(ownerToGroupsMapping);
        ownerKeys.forEach((ownerKey) => {
          const groups = ownerToGroupsMapping[ownerKey];
          ownerToGroupsMapping[ownerKey] = groupBy(groups, 'type');
        });
        groupCache = ownerToGroupsMapping;
        Logger.info(
          {
            numOwners: ownerKeys.length,
            numGroups: ownerKeys.reduce((count, ownerKey) => {
              const groupTypes = Object.keys(groupCache[ownerKey]);
              groupTypes.forEach((groupType) => {
                count += groupCache[ownerKey][groupType].length;
              });
              return count;
            }, 0)
          },
          'Updated group cache'
        );
        next();
      }
    ],
    cb
  );
}

/**
 * Sets the cache (groupCache) if it hasn't been set yet
 *
 * @param options
 * @param cb
 */
function maybeCacheGroups(options, cb) {
  if (groupCache === null) {
    cacheGroups(options, cb);
  } else {
    cb();
  }
}

/**
 * {
 *  data: {
 *     summary: [],
 *     details: {
 *         ownerName: {
 *             groupTypes: {
 *                 Report: {
 *                     groups: [],
 *                     totalGroups: 75
 *                 },
 *                 Incidents: {
 *                     groups: [],
 *                     totalGroups: 25
 *                 }
 *             },
 *             totalGroups: 100
 *         },
 *         ownerName2: {
 *             ... repeat
 *         }
 *     }
 *   }
 * }
 * @param entities
 * @param options
 * @param cb
 */
function doLookup(entities, options, cb) {
  const lookupResults = [];

  Logger.trace({ entities, options }, 'doLookup');

  if (groupCacheUpdateCronJob === null) {
    setupCacheUpdateCron(options);
  }

  async.each(
    entities,
    (entity, entityDone) => {
      maybeCacheGroups(options, (err) => {
        if (err) {
          // We ran into an error caching the groups
          return entityDone(err);
        }

        if (entity.value.length > options.maxSearchTermLength && options.maxSearchTermLength !== 0) {
          return entityDone();
        }

        const searchResults = {};
        const filteredOwners = getFilteredOwners(Object.keys(groupCache), options);
        filteredOwners.forEach((owner) => {
          const groupCacheFiltered = Object.keys(groupCache[owner]).reduce((accum, groupType) => {
            if (options.validGroupTypes.some((validType) => validType.value === groupType.toLowerCase())) {
              // this is a group type that should be searched
              accum[groupType] = groupCache[owner][groupType];
            }
            return accum;
          }, {});
          const searchMatches = searchGroups(entity.value.toLowerCase(), groupCacheFiltered);
          let totalGroups = 0;
          const searchMatchesWithLimit = Object.keys(searchMatches).reduce((accum, groupType) => {
            accum[groupType] = {
              groups: searchMatches[groupType].slice(0, options.resultLimit),
              totalGroups: searchMatches[groupType].length
            };
            totalGroups += searchMatches[groupType].length;
            return accum;
          }, {});

          if (Object.keys(searchMatches).length > 0) {
            searchResults[owner] = {
              groupTypes: searchMatchesWithLimit,
              totalGroups
            };
          }
        });

        if (Object.keys(searchResults).length > 0) {
          lookupResults.push({
            entity,
            data: {
              summary: [getSummaryTags(searchResults)],
              details: {
                resultLimit: options.resultLimit,
                searchResults
              }
            }
          });
        } else {
          lookupResults.push({
            entity,
            data: null
          });
        }

        entityDone();
      });
    },
    (err) => {
      Logger.info({ lookupResults }, 'Lookup Results');
      cb(err, lookupResults);
    }
  );
}

/**
 * Returns an array of all TC Owners
 * https://docs.threatconnect.com/en/latest/rest_api/owners/owners.html#retrieving-multiple-owners
 *
 * @param entity
 * @param options
 * @param cb
 */
function getThreatConnectOwners(options, cb) {
  const tcUrl = new URL(options.url);
  const urlPath = tcUrl.pathname.endsWith('/') ? tcUrl.pathname : tcUrl.pathname + '/';
  options.url = options.url.endsWith('/') ? options.url : options.url + '/';
  const requestOptions = {
    uri: options.url + 'v2/owners',
    method: 'GET',
    headers: getHeaders(`${urlPath}v2/owners`, 'GET', options),
    json: true
  };
  Logger.trace({ requestOptions }, 'getThreatConnectOwners');
  request(requestOptions, function (err, response, body) {
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
  });
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
  const tcUrl = new URL(options.url);
  options.url = options.url.endsWith('/') ? options.url : options.url + '/';
  const encodedOwner = encodeURIComponent(owner.name);
  const now = new Date();
  now.setDate(now.getDate() - options.maxLookbackDays);
  const formattedLookback = now.toISOString().split('T')[0];
  const urlPath = tcUrl.pathname.endsWith('/') ? tcUrl.pathname : tcUrl.pathname + '/';
  const apiPath = `v2/groups/?owner=${encodedOwner}&resultLimit=${GROUP_CACHE_LIMIT_PER_OWNER}&filters=dateAdded%3E${formattedLookback}`;

  const requestOptions = {
    uri: options.url + apiPath,
    method: 'GET',
    headers: getHeaders(`${urlPath}${apiPath}`, 'GET', options),
    json: true
  };
  Logger.trace({ requestOptions }, 'findGroupsByOwner');

  request(requestOptions, (err, response, body) => {
    if (err) {
      return cb(err);
    }
    Logger.trace({ body }, 'retrieveThreatConnectGroupObjects');

    if (body && body.data && body.data.group) {
      cb(null, body.data.group);
    } else {
      cb(null, []);
    }
  });
}

/**
 * Searches each group in the groups array for a match on group name against the searchTerm
 * @param searchTerm, the term to search within each group name
 * @param groups, array of groups to search
 * @returns {*} array of matching groups
 */
function searchGroups(searchTerm, groups) {
  let groupMatches = {};
  Object.keys(groups).forEach((groupType) => {
    const matches = groups[groupType].filter((group) => group.name.toLowerCase().includes(searchTerm));
    if (matches.length > 0) {
      groupMatches[groupType] = matches;
    }
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
 * @param owners Array of strings which are the names of owners
 * @param options user options object
 * @returns {*} an array of filtered owners based on users allow and blocklist settings
 */
function getFilteredOwners(ownerNames, options) {
  if (options.searchBlocklist.trim().length > 0) {
    const blocklistedOrgs = createSearchOrgBlocklist(options);
    return ownerNames.filter((owner) => !blocklistedOrgs.has(owner.toLowerCase()));
  } else if (options.searchAllowlist.trim().length > 0) {
    const allowlistedOrgs = createSearchOrgAllowlist(options);
    return ownerNames.filter((owner) => allowlistedOrgs.has(owner.toLowerCase()));
  } else {
    return ownerNames;
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
