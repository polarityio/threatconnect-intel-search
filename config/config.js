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
      name: 'Result Limit',
      description: 'Maximum of number of group objects to return per group',
      default: 10,
      type: 'number',
      userCanEdit: false,
      adminOnly: true
    }
  ]
};
