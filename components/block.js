polarity.export = PolarityComponent.extend({
  details: Ember.computed.alias('block.data.details'),
  actions: {
    toggleGroup: function (owner) {
      const collapsed = this.get('details.' + owner + '.collapsed');
      if (typeof collapsed === 'undefined') {
        this.set('details.' + owner + '.collapsed', false);
      } else {
        this.toggleProperty('details.' + owner + '.collapsed');
      }
    }
  }
});
