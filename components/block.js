polarity.export = PolarityComponent.extend({
    details: Ember.computed.alias('block.data.details'),
    actions: {
        toggleGroup: function(group){
            this.toggleProperty('details.' + group + '.collapsed');
        }
    }
});
