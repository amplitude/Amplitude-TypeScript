var express = require('express');
var router = express.Router();
var amplitude = require('@amplitude/analytics-node');

/* POST analytics */
router.post('/', function (req, res, next) {
  // Foward instrumented events to Amplitude
  amplitude.track(req.body);
  res.send();
});

module.exports = router;
