const moduleIds = new Map();
let spModuleId = 100000;
export default spdefine = global.spdefine = (moduleName, factory) => {
  let moduleId = spModuleId++;
  moduleIds.set(moduleName, moduleId);
  global.__d(factory, moduleId, null, moduleName);
};

global.__require = global.require;
global.require = global.sprequire = (moduleName) => {
  //console.log(moduleName + ':' + moduleIds.get(moduleName));
  return global.__require(moduleIds.get(moduleName) || moduleName);
};
