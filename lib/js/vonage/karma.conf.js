const baseConfig = require('../karma.conf')

module.exports = function(config) {
  config.set({
    ...baseConfig(), // Spread the common settings
  });
};