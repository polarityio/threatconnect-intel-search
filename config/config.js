module.exports = {
  name: 'Sample REST Training',
  acronym: 'REST',
  description: 'This is a training integration',
  entityTypes: ['ipv4'],
  logging: { level: 'trace' },
  block: {
    component: {
      file: './components/block.js'
    },
    template: {
      file: './templates/block.hbs'
    }
  },
  styles: ['./styles/styles.less'],
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
    }]
};
