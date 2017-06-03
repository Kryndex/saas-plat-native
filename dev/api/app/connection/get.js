var fs = require('fs');
var path = require('path');

exports.default = function() {

  var json2 = {
    bundleServer: 'http://localhost:8200/api/v1/bundle/file',
    routes: [],
    bundles: []
  };
  var root = path.join(__dirname, '../../../../src/platform');
  var files = fs.readdirSync(root);
  for (var f in files) {
    var filename = path.join(root, files[f], 'package.json');
    var packageconfig = {};
    if (fs.existsSync(filename)) {
      var packagefile = fs.readFileSync(filename);
      var json3 = JSON.parse(packagefile);
      json3.spconfig = json3.spconfig || {};
      packageconfig = {
        name: json3.name,
        version: 'HEAD',
        description: json3.description,
        keywords: json3.keywords,
        author: json3.author,
        license: json3.license,
        // 下面的是sp扩展
        preload: json3.spconfig.preload,
        dependencies: json3.spconfig.dependencies
      };
      json2.bundles.push(packageconfig);
    }
  }

  var routefilename = path.join(__dirname, 'routes.json');
  if (fs.existsSync(routefilename)) {
    var routefile = fs.readFileSync(routefilename);
    var json4 = JSON.parse(routefile);
    json2.routes = json4;
  }

  return json2;
}
