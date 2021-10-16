module.exports = {
  name: 'ThreatConnect Group Search',
  acronym: 'TCG',
  description: 'Searches ThreatConnect Groups',
  entityTypes: ['*'],
  customTypes: [
    {
      key: 'allText',
      regex: /[\s\S]+/
    }
  ],
  onDemandOnly: true,
  defaultColor: 'light-gray',
  logging: { level: 'info' },
  block: {
    component: {
      file: './components/block.js'
    },
    template: {
      file: './templates/block.hbs'
    }
  },
  styles: ['./styles/styles.less'],
  request: {
    // Provide the path to your certFile. Leave an empty string to ignore this option.
    // Relative paths are relative to the integration's root directory
    cert: '',
    // Provide the path to your private key. Leave an empty string to ignore this option.
    // Relative paths are relative to the integration's root directory
    key: '',
    // Provide the key passphrase if required.  Leave an empty string to ignore this option.
    // Relative paths are relative to the integration's root directory
    passphrase: '',
    // Provide the Certificate Authority. Leave an empty string to ignore this option.
    // Relative paths are relative to the integration's root directory
    ca: '',
    // An HTTP proxy to be used. Supports proxy Auth with Basic Auth, identical to support for
    // the url parameter (by embedding the auth info in the uri)
    proxy: '',
    /**
     * If set to false, the integration will ignore SSL errors.  This will allow the integration to connect
     * to servers without valid SSL certificates.  Please note that we do NOT recommending setting this
     * to false in a production environment.
     */
    rejectUnauthorized: true
  },
  options: [
    {
      key: 'url',
      name: 'ThreatConnect Instance URL',
      description: 'The URL of the ThreatConnect instance you would like to connect to (including http:// or https://)',
      default: '',
      type: 'text',
      userCanEdit: false,
      adminOnly: true
    },
    {
      key: 'accessId',
      name: 'Access ID',
      description: 'Account Identifier that is associated with the API Key',
      default: '',
      type: 'text',
      userCanEdit: false,
      adminOnly: true
    },
    {
      key: 'apiKey',
      name: 'API Key',
      description: 'The API (secret) Key associated with the provided Access ID',
      default: '',
      type: 'password',
      userCanEdit: false,
      adminOnly: true
    },
    {
      key: 'resultLimit',
      name: 'Group Type Result Limit',
      description: 'For each owner, specify the maximum of number of group objects to return per group type (defaults to 25).',
      default: 25,
      type: 'number',
      userCanEdit: false,
      adminOnly: true
    },
    {
      key: 'maxLookbackDays',
      name: 'Max Lookback Days',
      description: 'Maximum of number of days back to search for group objects (defaults to 365).',
      default: 365,
      type: 'number',
      userCanEdit: false,
      adminOnly: true
    },
    {
      key: 'validGroupTypes',
      name: 'Group Types to Return',
      description:
        'The types of group objects that should be returned to Polarity. Some of the groups shown are only available in ThreatConnect version  6.3 and after. Please check that you have the groups selected before querying',
      default: [
        {
          value: 'adversary',
          display: 'Adversary'
        },
        {
          value: 'campaign',
          display: 'Campaign'
        },
        {
          value: 'document',
          display: 'Document'
        },
        {
          value: 'email',
          display: 'Email'
        },
        {
          value: 'event',
          display: 'Event'
        },
        {
          value: 'incident',
          display: 'Incident'
        },
        {
          value: 'intrusion set',
          display: 'Intrusion Set'
        },
        {
          value: 'report',
          display: 'Report'
        },
        {
          value: 'signature',
          display: 'Signature'
        },
        {
          value: 'threat',
          display: 'Threat'
        }
      ],
      type: 'select',
      options: [
        {
          value: 'adversary',
          display: 'Adversary'
        },
        {
          value: 'attack pattern',
          display: 'Attack Pattern'
        },
        {
          value: 'campaign',
          display: 'Campaign'
        },
        {
          value: 'course of action',
          display: 'Course of Action'
        },
        {
          value: 'document',
          display: 'Document'
        },
        {
          value: 'email',
          display: 'Email'
        },
        {
          value: 'event',
          display: 'Event'
        },
        {
          value: 'incident',
          display: 'Incident'
        },
        {
          value: 'intrusion set',
          display: 'Intrusion Set'
        },
        {
          value: 'malware',
          display: 'Malware'
        },
        {
          value: 'report',
          display: 'Report'
        },
        {
          value: 'signature',
          display: 'Signature'
        },
        {
          value: 'tactic',
          display: 'Tactic'
        },
        {
          value: 'threat',
          display: 'Threat'
        },
        {
          value: 'tool',
          display: 'Tool'
        },
        {
          value: 'vulnerability',
          display: 'Vulnerability'
        }
      ],
      multiple: true,
      userCanEdit: false,
      adminOnly: false
    },
    {
      key: 'searchBlocklist',
      name: 'Organization Search Blocklist',
      description:
        'By default all organizations visible to the provided API User will be searched.  This blocklist is a comma delimited list of organizations you do not want searched. This option cannot be used in conjunction with the "Organization Search Allowlist" option.',
      default: '',
      type: 'text',
      userCanEdit: false,
      adminOnly: true
    },
    {
      key: 'searchAllowlist',
      name: 'Organization Search Allowlist',
      description:
        'By default all organizations visible to the provided API User will be searched. This allowlist is a comma delimited list of organizations you want searched (organizations not listed will not be searched). This option cannot be used in conjunction with the "Organization Search Blocklist" option',
      default: '',
      type: 'text',
      userCanEdit: false,
      adminOnly: true
    },
    {
      key: 'maxSearchTermLength',
      name: 'Maximum Search Term Length',
      description:
          'Search terms over this length will not be searched.  Set to 0 for no search limit.  If you have the "allText" custom entity type enabled you should set a maximum search term length.  (Defaults to 100)',
      default: 100,
      type: 'number',
      userCanEdit: false,
      adminOnly: true
    }
  ]
};
