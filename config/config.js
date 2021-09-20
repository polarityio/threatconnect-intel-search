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
      'key': 'apiKey',
      'name': 'API Key',
      'description': 'The API key to use when authenticating',
      'default': '',
      'type': 'password',
      'userCanEdit': false,
      'adminOnly': true
    }]
};
