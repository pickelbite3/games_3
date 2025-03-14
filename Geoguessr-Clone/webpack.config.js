const path = require('path');

module.exports = {
  // Development mode makes it easy to debug code, but code is not as efficient as it could be.
  // Production mode builds the code to be as efficient as possible, but is hard to debug.

  // To switch to production:
  // change mode to production
  // and remove line with devtool
  // Now just rebuild the project to get production code.

  mode: 'development',
  entry: './src/index.js',
  devtool: 'inline-source-map',
  output: {
    filename: 'main.js',
    path: path.resolve(__dirname, 'dist'),
  },

};
