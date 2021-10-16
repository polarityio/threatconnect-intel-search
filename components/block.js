polarity.export = PolarityComponent.extend({
  details: Ember.computed.alias('block.data.details'),
  searchResults: Ember.computed.alias('block.data.details.searchResults'),
  iconMap: {
    Incident: 'disease',
    Report: 'file-alt',
    Signature: 'signature',
    Adversary: 'user-secret',
    Campaign: 'bullhorn',
    Email: 'email',
    'Intrusion Set': 'folder',
    Threat: 'virus',
    Malware: 'bug',
    Tactic: 'clipboard',
    Tool: 'hammer',
    'Attack Pattern': 'claw-marks',
    'Course of Action': 'road',
    Event: 'calendar',
    Vulnerability: 'traffic-cone'
  },
  actions: {
    toggleGroup: function (owner) {
      const collapsed = this.get('searchResults.' + owner + '.collapsed');
      if (typeof collapsed === 'undefined') {
        this.set('searchResults.' + owner + '.collapsed', false);
      } else {
        this.toggleProperty('searchResults.' + owner + '.collapsed');
      }
    },
    toggleGroupType: function (owner, groupType) {
      const collapsed = this.get('searchResults.' + owner + '.groupTypes.' + groupType + '.collapsed');
      if (typeof collapsed === 'undefined') {
        this.set('searchResults.' + owner + '.groupTypes.' + groupType + '.collapsed', false);
      } else {
        this.toggleProperty('searchResults.' + owner + '.groupTypes.' + groupType + '.collapsed');
      }
    }
  }
});
