const path = require('path');

require('dotenv').config({path: path.resolve(__dirname, '../../../.env')});

module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    [
      'transform-inline-environment-variables',
      {include: ['VITE_AMPLITUDE_API_KEY']},
    ],
  ],
};
