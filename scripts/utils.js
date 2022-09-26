const path = require('path');
const pkg = require(path.join(process.cwd(), 'package.json'));

exports.getName = () => pkg.name.substring('@amplitude/'.length);

exports.getVersion = () => pkg.version;
