const snippet = (integrity, version) => `
!(function (window, document) {
  var amplitude = window.amplitude || { _q: [] };
  if (amplitude.invoked) window.console && console.error && console.error('Amplitude snippet has been loaded.')
  else {
    amplitude.invoked = !0;
    var as = document.createElement('script');
    as.type = 'text/javascript';
    as.integrity = '${integrity}';
    as.crossOrigin = 'anonymous';
    as.async = true;
    as.src = 'https://cdn.amplitude.com/libs/amplitude-ts-${version}-min.gz.js';
    as.onload = function () {
      if (!window.amplitude.runQueuedFunctions) {
        console.log('[Amplitude] Error: could not load SDK');
      }
    };
    var s = document.getElementsByTagName('script')[0];
    s.parentNode.insertBefore(as, s);
    function proxy(obj, fn) {
      obj.prototype[fn] = function () {
        this._q.push([fn].concat(Array.prototype.slice.call(arguments, 0)));
        return this;
      };
    }
    var Identify = function () {
      this._q = [];
      amplitude._q.push(['Identify', this]);
      return this;
    };
    var identifyFuncs = [
      'add',
      'append',
      'clearAll',
      'prepend',
      'set',
      'setOnce',
      'unset',
      'preInsert',
      'postInsert',
      'remove',
      'getUserProperties',
    ];
    for (var i = 0; i < identifyFuncs.length; i++) {
      proxy(Identify, identifyFuncs[i]);
    }
    amplitude.Identify = Identify;
    var Revenue = function () {
      this._q = [];
      amplitude._q.push(['Revenue', this]);
      return this;
    };
    var revenueFuncs = [
      'getEventProperties',
      'setProductId',
      'setQuantity',
      'setPrice',
      'setRevenue',
      'setRevenueType',
      'setEventProperties',
    ];
    for (var j = 0; j < revenueFuncs.length; j++) {
      proxy(Revenue, revenueFuncs[j]);
    }
    amplitude.Revenue = Revenue;
    var funcs = [
      'init',
      'track',
      'logEvent',
      'add',
      'remove',
      'identify',
      'groupIdentify',
      'revenue',
      'setDeviceId',
      'setSessionId',
      'setUserId',
    ];
    function setUpProxy(instance) {
      function proxyMain(fn) {
        instance[fn] = function () {
          instance._q.push([fn].concat(Array.prototype.slice.call(arguments, 0)));
        };
      }
      for (var k = 0; k < funcs.length; k++) {
        proxyMain(funcs[k]);
      }
    }
    setUpProxy(amplitude);
    window.amplitude = amplitude;
  }
})(window, document);
`;

exports.snippet = snippet;
