console.log('Welcome to SaasPlat, more visit www.saas-plat.com.');

import React from 'react';
import {
  View,
  ScrollView,
  Text,
  StatusBar,
  ActivityIndicator,
  Platform,
  NetInfo,
  TouchableOpacity,
  TouchableHighlight,
  StyleSheet,
  AsyncStorage
} from 'react-native';
import Storage from 'react-native-storage';
import config from './config';
import spdefine from './spdefine';
import querystring from 'querystring';
import 'whatwg-fetch';

const locales = {};
global.lastGlobalError = '';
let lang;

const T = function(txt) {
  return (lang && locales[lang] && locales[lang][txt]) || txt;
};

let deviceID = Platform.OS;
let deviceUUID;
switch (Platform.OS) {
  case 'android':
  case 'ios':
  case 'windows':
    const DeviceInfo = require('react-native-device-info');
    deviceID = DeviceInfo.getDeviceId() || DeviceInfo.getSystemName() +
      DeviceInfo.getSystemVersion(); // iPhone7,2
    deviceUUID = DeviceInfo.getUniqueID(); // FCDBD8EF-62FC-4ECB-B2F5-92C9E79AC7F9
    lang = DeviceInfo.getDeviceLocale();
    break;
  case 'web':
    const browser = {};
    if (/(msie|rv|chrome|firefox|opera|netscape)\D+(\d[\d.]*)/.test(navigator.userAgent
        .toLowerCase())) {
      browser.name = RegExp.$1;
      browser.version = RegExp.$2;
    } else if (/version\D+(\d[\d.]*).*safari/.test(navigator.userAgent.toLowerCase())) {
      browser.name = 'safari';
      browser.version = RegExp.$2;
    } else {
      browser.name = 'unknown';
      browser.version = '';
    }
    lang = navigator.language || navigator.browserLanguage;
    deviceID = browser.name + browser.version;
    deviceUUID = '$ip';
    break;
  case 'macos':
    // todo
  default:
    console.error(T('不支持的平台设备'), Platform.OS);
}

console.log(T('当前语言'), lang);
console.log(T('当前设备'), deviceID);

global.devOptions = {
  debugMode: false,
  cacheDisable: false
};

global.options = {
  get language() {
    return lang;
  }
};

if (lang) {
  try {
    if (lang !== 'zh-CN') { // 默认中文
      locales[lang] = require('./locales/' + lang);
    }
  } catch (err) {
    console.error(err);
  }
}

function invoke(script) {
  let scriptex =
    "spdefine('__app__',function(global, require, module, exports){" +
    "function __loadcode(){" + script + "\n}" + // try调用func减少性能损失
    "try{__loadcode();}catch(err){global.lastGlobalError = err;}\n});";
  // chrome引擎new function比eval快一倍以上
  (new Function(scriptex))();
}

// 加载平台组件
export default class extends React.Component {

  constructor(props) {
    super(props);
    this.state = {
      code: 0,
      loading: true,
      messageList: []
    };

    this.onPressFeed = this.onPressFeed.bind(this);
    this.syncFile = this.syncFile.bind(this);
    this.syncVersion = this.syncVersion.bind(this);
    this.clearMessageList = this.clearMessageList.bind(this);
    this.handleConnected = this.handleConnected.bind(this);
  }

  finished(code) {
    this.setState({ code: code, loading: false });
    // ios和android上有启动画面
    if (Platform.OS === 'android' || Platform.OS === 'ios') {
      // 成功是不隐藏的，等在platform加载完再隐藏
      if (this.state.code != 200) {
        // 关闭启动画面
        let end = new Date().getTime();
        let dif = end - this._start;
        if (dif > 2000) { // 至少显示2s，要不一闪而过体验不好
          // 恢复状态条
          StatusBar.setHidden(false);
          this.hideSplashScreen();
        } else {
          setTimeout(() => {
            // 恢复状态条
            StatusBar.setHidden(false);
            this.hideSplashScreen();
          }, dif);
        }
      }
    }
  }

  hideSplashScreen() {
    if (Platform.OS === 'web') {
      const el = document.getElementById('sp-loading');
      el.parentNode.removeChild(el);
    } else {
      require('@remobile/react-native-splashscreen').hide();
    }
  }

  syncFile({ resolve, reject, id }) {
    const me = this;
    if (!global.isConnected) {
      reject(T('网络尚未连接'));
      return;
    }
    this.pushMessage(T('开始同步内核脚本...'));
    // id = version
    fetch(id, { mode: "cors" }).then((response) => {
      if (response.status === 200) {
        return response.text();
      }
      throw T('网络连接已拒绝') + ' (' + response.status + ')';
    }).then(text => {
      me.pushMessage(T('内核脚本下载完成'));
      if (id !== 'HEAD') { // 每次加载最新版不保存
        me.store.save({ key: 'file', id, rawData: text });
        me.pushMessage(T('fileSaved'));
      }
      resolve(text);
    }).catch((error) => {
      if (global.devOptions.debugMode) {
        me.pushMessage(id);
      }
      reject(error);
    });
  }

  syncVersion({ reject, resolve }) {
    const me = this;
    if (!global.isConnected) {
      reject(T('netInfoCheckFailed'));
      return;
    }
    let timeoutId = __DEV__ ?
      1 :
      setTimeout(() => {
        if (!timeoutId) {
          return;
        }
        timeoutId = null;
        reject(T('网络请求超时')); // reject on timeout
      }, 10000); // 10s超时
    this.pushMessage(T('开始同步内核程序版本...'));
    const arg = querystring.stringify({ platform: Platform.OS });
    const url = `${config.version}?${arg}`;
    fetch(url).then((response) => {
      if (!timeoutId) {
        return;
      }
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      if (response.status === 200) {
        return response.json();
      }
      throw Error(T('网络连接已拒绝') + ' (' + response.status + ')');
    }).then(json => {
      if (!json) {
        return;
      }
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      if (json.errno) {
        reject(json.msg);
      } else if (!json.data.file) {
        reject(T('当前版本文件不存在'));
      } else {
        me.pushMessage(T('内核程序版本同步完成'));
        if (json.data.version !== 'HEAD') { // HEAD是最新版就不要保存
          me.store.save({ key: 'version', rawData: json.data });
          me.pushMessage(T('内核最新版本已经保存，版本号:') + json.data.version);
        }
        resolve(json.data);
      }
    }).catch(error => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      if (global.devOptions.debugMode) {
        me.pushMessage(config.version);
      }
      reject(error);
    });
  }

  startApp() {
    this.pushMessage(T('开始运行内核程序...'));
    const sp = global.require('saas-plat-native-core');
    if (global.lastGlobalError) {
      if (global.lastGlobalError && global.devOptions.debugMode) {
        this.pushMessage(global.lastGlobalError.message || global.lastGlobalError);
      }
      this.pushMessage(T('应用启动失败，稍后重试...'));
      this.finished(500.2);
      return false;
    }
    if (!sp || !sp.App) {
      if (global.devOptions.debugMode) {
        this.pushMessage(T('内核程序加载失败'));
      }
      this.pushMessage(T('应用启动失败，稍后重试...'));
      this.finished(500.9);
      return false;
    }
    this.pushMessage(T('内核程序加载成功'));
    spdefine('saasplat-native', (global, require, module, exports) => {
      module.exports = sp.__esModule ?
        sp.default :
        sp;
    });
    this.pushMessage(T('环境准备已就绪'));
    this.finished(200);
    return true;
  }

  loadWebScript(url) {
    return new Promise((resolve, reject) => {
      var script = document.createElement('script');
      script.type = 'text/javascript';
      if (script.readyState) { // IE
        script.onreadystatechange = function() {
          if (script.readyState === 'loaded' || script.readyState ===
            'complete') {
            script.onreadystatechange = null;
            resolve();
          }
        };
      } else { // FF, Chrome, Opera, ...
        script.onload = function() {
          resolve();
        };
      }
      script.src = url;
      document.getElementsByTagName('body')[0].appendChild(script);
    });
  }

  loadFile(version, file) {
    const me = this;
    me.pushMessage(T('开始加载内核程序...'));
    if (Platform.OS === 'web') {
      // web fetch 需要解决跨域请求的问题
      // 缓存直接用浏览器
      me.loadWebScript(file).then(() => {
        me.pushMessage(T('内核程序加载成功'));
        if (!me.startApp()) {
          // 当前版本的文件无效，清楚缓存
          me.store.remove({ key: 'file', id: file });
        }
      }).catch(err => {
        //如果没有找到数据且没有同步方法，
        if (err && global.devOptions.debugMode) {
          //或者有其他异常，则在catch中返回
          me.pushMessage(T('内核程序脚本加载失败') + ', ' + (err.message || err));
        }
        // 当前版本已过期删除
        me.store.remove({ key: 'version' });
        me.pushMessage(T('应用启动失败，稍后重试...'));
        me.finished(500);
      });
    } else {
      if (__DEV__ || global.devOptions.cacheDisable) {
        me.store.remove({ key: 'file', id: file });
      }
      // 如果版本加载成功，开始加载代码
      me.store.load({
        key: 'file',
        id: file,
        syncInBackground: !(__DEV__ || global.devOptions.cacheDisable)
      }).then(ret => {
        invoke(ret);
        me.pushMessage(T('内核程序加载成功'));
        if (!me.startApp()) {
          // 当前版本的文件无效，清楚缓存
          me.store.remove({ key: 'file', id: file });
        }
      }).catch(err => {
        //如果没有找到数据且没有同步方法，
        if (err && global.devOptions.debugMode) {
          //或者有其他异常，则在catch中返回
          me.pushMessage(T('内核程序脚本加载失败') + ', ' + (err.message || err));
        }
        // 当前版本已过期删除
        me.store.remove({ key: 'version' });
        me.pushMessage(T('应用启动失败，稍后重试...'));
        me.finished(500);
      });
    }
  }

  loadVersion(autoSync) {
    const me = this;
    this.pushMessage(T('内核版本开始加载'));
    if (__DEV__ || global.devOptions.cacheDisable) {
      this.store.remove({ key: 'version' });
    }
    // 版本默认每天检查一次，就算过期也是先返回老版本，下次打开才是新版
    this.store.load({
      key: 'version',
      autoSync,
      syncInBackground: (__DEV__ || global.devOptions.cacheDisable) ?
        false : true
    }).then(ret => {
      me.pushMessage(T('内核版本读取完成，当前版本:') + ret.version);
      me.loadFile(ret.version, ret.file);
    }).catch(err => {
      // 如果没有找到数据且没有同步方法，
      if (err && global.devOptions.debugMode) {
        // 或者有其他异常，则在catch中返回
        me.pushMessage(T('内核程序版本获取失败') + ', ' + (err.message || err));
      }
      me.pushMessage(T('系统正在维护，稍后重试...'));
      me.finished(404);
    });
  }

  pushMessage(message) {
    console.log(message);
    this.setState({ messageList: this.state.messageList.concat(message) });
  }

  loadDevOptions(callback) {
    if (global.isConnected) {
      // 联网从平台获取开发者选项
      this.pushMessage(T('获取开发者选项...'));
      const arg = querystring.stringify({ did: deviceID, uuid: deviceUUID });
      const url = `${config.dev}?${arg}`;
      fetch(url).then((response) => {
        return response.json();
      }).then((json) => {
        if (json.errno) {
          this.pushMessage(json.errmsg);
        } else {
          global.devOptions = {
            ...global.devOptions,
            ...json.data
          };
        }
      }).then(() => {
        if (global.devOptions.cacheDisable) {
          this.pushMessage(T('系统已经禁用缓存'));
        }
        if (global.devOptions.debugMode) {
          this.pushMessage(T('系统已经启用调试模式'));
        }
        if (callback) {
          callback();
        }
      }).catch(err => {
        this.pushMessage(T('开发者选项获取失败') + ', ' + (err.message || err));
      });
    } else {
      if (global.devOptions.cacheDisable) {
        this.pushMessage(T('系统已经禁用缓存'));
      }
      if (global.devOptions.debugMode) {
        this.pushMessage(T('系统已经启用调试模式'));
      }
      if (callback) {
        callback();
      }
    }
  }

  loadCoreFile() {
    if (global.isConnected) {
      const me = this;
      this.pushMessage(T('网络连接成功'));
      // 如果网络连接，获取最新版本
      this.syncVersion({
        resolve: function({ version, file }) {
          me.loadFile(version, file);
        },
        reject: function(err) {
          me.pushMessage(T('内核程序版本获取失败') + ', ' + (err.message || err));
          me.loadVersion(false);
        }
      });
    } else {
      alert(T('网络尚未连接，建议开启WIFI或4G网络，否则数据无法更新和保存提交'));
      this.pushMessage(T('网络尚未连接'));
      this.loadVersion();
    }
  }

  initEnv() {
    if (Platform.OS === 'android' || Platform.OS === 'ios') {
      // 调试模式不显示启动画面，直接显示加载过程
      if (global.devOptions.debugMode) {
        // 恢复状态条
        StatusBar.setHidden(false);
        this.hideSplashScreen();
      }
    }

    this.store = new Storage({
      size: 1, // 默认保存最近1个版本
      storageBackend: AsyncStorage,
      defaultExpires: (__DEV__ || global.devOptions.cacheDisable) ?
        1 : null, // 永不过期
      autoSync: true,
      syncInBackground: !(__DEV__ || global.devOptions.cacheDisable),
      sync: {
        file: this.syncFile,
        version: this.syncVersion
      }
    });
  }

  handleConnected(isConnected) {
    global.isConnected = isConnected;
    if (this.handled) {
      // 网络请求不能关闭，但是这里只需要处理一次
      return;
    }
    this.pushMessage(T('开始启动...'));
    this.loadDevOptions(() => {
      this.initEnv();
      this.loadCoreFile();
    });
  }

  prepare() {
    this.setState({ code: 0, loading: true });
    this.pushMessage(T('开始检查网络连接情况...'));
    NetInfo.isConnected.fetch().then((isConnected) => {
      //console.log('First, is ' + (isConnected ? 'online' : 'offline'));
      this.handleConnected(isConnected);
    });

    function handleFirstConnectivityChange(isConnected) {
      //console.log('Then, is ' + (isConnected ? 'online' : 'offline'));
      NetInfo.isConnected.removeEventListener('change',
        handleFirstConnectivityChange);
    }
    NetInfo.isConnected.addEventListener('change',
      handleFirstConnectivityChange);
  }

  componentDidMount() {
    this._start = new Date().getTime();
    this.prepare();
  }

  onPressFeed() {
    if (this.state.loading) {
      return;
    }
    this.prepare();
  }

  clearMessageList() {
    this.setState({ messageList: [] });
  }

  render() {
    if (this.state.code === 200) {
      const sp = global.require('saas-plat-native-core');
      const Component = sp.App;
      return <Component/>;
    }
    switch (Platform.OS) {
      case 'android':
      case 'ios':
      case 'windows':
        return this.renderApp();
      case 'web':
        return this.renderWeb();
      case 'macos':
        // todo
      default:
        console.error(T('不支持的平台视图'), Platform.OS);
        return null;
    }
  }

  renderWeb() {
    const messageContent = this.state.messageList.length > 0 ?
      this.state.messageList[this.state.messageList.length - 1] :
      '';
    let lastErrorText = null;
    if (lastGlobalError) {
      lastErrorText = (
        <Text style={styles.messageError}>
          {lastGlobalError}
        </Text>
      );
    }
    return (
      <View style={styles.container}>
        <ActivityIndicator
          animating={this.state.loading}
          style={{height: 50}}
          size='small'/>
        <TouchableOpacity onPress={this.onPressFeed}>
          <View style={{
            marginBottom: 120
          }}>
            <Text style={styles.message}>
              {messageContent + (this.state.code !== 0
                ? ('(' + this.state.code + ')')
                : '')}
            </Text>
            {lastErrorText}
          </View>
        </TouchableOpacity>
      </View>
    );
  }

  renderApp() {
    if (!global.devOptions.debugMode) {
      const messageContent = this.state.messageList.length > 0 ?
        this.state.messageList[this.state.messageList.length - 1] :
        '';
      let lastErrorText = null;
      if (lastGlobalError) {
        lastErrorText = (
          <Text style={styles.messageError}>
            {lastGlobalError}
          </Text>
        );
      }
      return (
        <View style={styles.container}>
          <StatusBar hidden={false} barStyle='default'/>{this.state.loading
            ? <ActivityIndicator
                loading={true}
                style={{
                height: 50
              }}
                size='small'/>
            : <View style={{
              height: 50
            }}/>}
          <TouchableOpacity onPress={this.onPressFeed}>
            <View style={{
              marginBottom: 120
            }}>
              <Text style={styles.message}>
                {messageContent + (this.state.code !== 0
                  ? ('(' + this.state.code + ')')
                  : '')}
              </Text>
              {lastErrorText}
            </View>
          </TouchableOpacity>
        </View>
      );
    } else {
      return (
        <View style={styles.container}>
          <StatusBar hidden={false} barStyle='default'/>
          <ScrollView
            style={styles.messageList}
            contentContainerStyle={styles.messageListContainer}>
            {this.state.messageList.map((message, i) => (
              <View key={i} style={styles.row}>
                <TouchableHighlight
                  activeOpacity={0.5}
                  style={styles.rowContent}
                  underlayColor='transparent'>
                  <Text style={styles.rowText}>
                    {message}
                  </Text>
                </TouchableHighlight>
              </View>
            ))}
          </ScrollView>
          <View style={styles.buttons}>
            <TouchableHighlight
              activeOpacity={0.5}
              onPress={this.onPressFeed}
              style={styles.button}
              underlayColor='transparent'>
              <Text
                style={[
                styles.buttonText, this.state.loading
                  ? styles.buttonDisabled
                  : null
              ]}>
                {T('重新加载')}
              </Text>
            </TouchableHighlight>
            <TouchableHighlight
              activeOpacity={0.5}
              onPress={this.clearMessageList}
              style={styles.button}
              underlayColor='transparent'>
              <Text style={styles.buttonText}>
                {T('清空所有')}
              </Text>
            </TouchableHighlight>
          </View>
        </View>
      );
    }
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff'
  },
  message: {
    fontSize: 16,
    textAlign: 'center',
    color: '#111'
  },
  messageError: {
    fontSize: 14,
    color: '#ccc'
  },
  messageList: {
    padding: 15,
    position: 'absolute',
    top: 39,
    left: 0,
    right: 0,
    bottom: 60
  },
  messageListContainer: {},
  buttons: {
    flexDirection: 'row',
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0
  },
  button: {
    flex: 1,
    padding: 22
  },
  buttonText: {
    color: '#111',
    fontSize: 14,
    textAlign: 'center'
  },
  buttonDisabled: {
    color: '#ccc'
  },
  row: {
    height: 36,
    marginTop: 1
  },
  rowText: {
    color: '#111',
    fontSize: 16,
    fontWeight: '600'
  },
  rowContent: {
    flex: 1
  }
});
