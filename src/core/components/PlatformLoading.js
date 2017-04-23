import React from 'react';
import {View, StatusBar, Text, TouchableOpacity, Platform} from 'react-native';
import {autobind} from 'core-decorators';
import Spinner from './Spinner';
import bundle from '../core/Bundle';
import * as apis from '../apis/PlatformApis';
import {connectStyle} from '../core/Theme';
import {translate} from '../core/I18n';
import {connectStore} from '../core/Store';

import ModuleLoading from './ModuleLoading';
import MessageView from './MessageView';
import AppIntro from './AppIntro';

import {tx} from '../utils/internal';

const observer = Platform.OS === 'web'
  ? require('mobx-react').observer
  : require('mobx-react/native').observer;

let Route,
  Switch;
switch (Platform.OS) {
  case 'android':
  case 'ios':
  case 'windows':
  case 'macos':
    {
      const NativeRouter = require('react-router-native');
      Route = NativeRouter.Route;
      Switch = NativeRouter.Switch;
      break;
    }
  case 'web':
    {
      const BrowserRouter = require('react-router-dom');
      Route = BrowserRouter.Route;
      Switch = BrowserRouter.Switch;
      break;
    }
  default:
    console.error(tx('不支持的路由平台'), Platform.OS);
    break;
}

// 平台组件加载等待
@translate('core.PlatformLoading')
@connectStyle('core.PlatformLoading')
@connectStore(['userStore', 'systemStore', 'routerStore'])
@observer
export default class PlatformLoading extends React.Component {

  constructor(props) {
    super(props);
    this.state = {
      animating: true,
      message: props.t('正在准备环境，请稍后...')
    };
  }

  @autobind
  finished(code, message) {
    if (this._isMounted) {
      this.setState({animating: false});
      this.setState({
        message: message || this.props.t('环境尚未准备就绪，稍后重试...(500)')
      });
    }

    if (Platform.OS === 'android' || Platform.OS === 'ios') {
      // 恢复状态条
      StatusBar.setHidden(false);
      require('@remobile/react-native-splashscreen').hide();
    }

    if (this._isMounted) {
      this.setState({success: true});
    }

    if (code === 'complated') {
      const appVersion = this.props.systemStore.options.appVersion;
      // console.log(this.props.t('user version:'+appVersion);
      // console.log(this.props.t('system version:'+System.getVersion());
      // 如果没有看过介绍页显示，否着直接进入登录页
      try {
        (this.props.systemStore.config.version !== appVersion && !global.devOptions.debugMode)
          ? this.props.history.replace('/appintro')
          : this.props.history.replace(this.props.location.pathname === '/'
            ? '/login'
            : this.props.location.pathname)
      } catch (err) {
        debugger;
        console.warn(err);
        if (this._isMounted) {
          if (Platform.OS === 'web') {
            this.setState({animating: false, message: this.props.t('系统无法登录，请刷新后重试~(500.2)')});
          } else {
            this.setState({animating: false, message: this.props.t('系统无法登录，请完全退出应用稍后重试~(500.2)')});
          }
        }
      }
    }
  }

  componentWillMount() {
    this._isMounted = true;
  }

  componentDidMount() {
    this.prepare();
  }

  componentWillUnmount() {
    this._isMounted = false;
  }

  connect() {
    const me = this;
    return new Promise(async(resolve, reject) => {
      console.log(me.props.t('开始连接平台网络...'));
      try {
        const platformConfig = await apis.connectPlatform();
        bundle.removeMetadata('platform');
        bundle.addMetadata('platform', platformConfig.bundles);
        me.props.systemStore.debug(platformConfig.device && platformConfig.device.debug);
        if (platformConfig.bundleServer) {
          me.props.systemStore.updateBundleServer(platformConfig.bundleServer);
        }
        console.log(me.props.t('连接平台完成'));
        resolve(platformConfig);
      } catch (err) {
        me.finished(err);
        reject();
      }
    });
  }

  loadBundle(platformConfig) {
    const me = this;
    return new Promise((resolve, reject) => {
      console.log(me.props.t('开始加载平台模块...'));
      bundle.load(platformConfig.bundles, platformConfig.server).then((bundles) => {
        console.log(me.props.t('加载平台模块完成'));
        resolve(bundles);
      }).catch((err) => {
        console.warn(me.props.t('加载平台模块失败'));
        me.finished(err);
      });
    });
  }

  startupSystem() {
    const me = this;
    me.loadBundle({bundles: bundle.getPreloads('platform'), server: this.props.systemStore.config.platform.bundle}).then((bundles) => {
      me.finished('complated', this.props.t('环境准备已就绪~'));
    }).catch((err) => {
      console.log(me.props.t('加载平台失败'));
      console.warn(err);
      me.finished('bundlefailed', this.props.t('系统加载失败，请稍后重试~(500.2)'));
    });
  }

  prepare() {
    this.setState({animating: true, message: this.props.t('正在准备环境，请稍后...')});

    this.connect(). // 连接获取平台基本配置信息
    then(() => this.props.systemStore.loadSystemOptions()). // 先加载系统选项，启动过程可能需要判断
    then(() => this.props.userStore.loadHistory()). // 加载登录历史
    then(() => this.startupSystem.bind(this)()); // 启动系统
  }

  @autobind
  onPressFeed() {
    if (this.state.animating) {
      return;
    }
    this.prepare();
  }

  render() {
    if (this.state.success === true) {
      return (<Switch>
        <Route path='/appintro' component={AppIntro}/>
        <Route path='/404' component={MessageView} code={404}/>
        {(this.props.routerStore.getRoutes('/')).map((item) => <Route {...item} key={item.path.replace(/\//g, '_')}/>)}
        <Route component={ModuleLoading}/>
      </Switch>);
    } else {
      return (
        <View style={this.props.style.container}>
          {(Platform.OS === 'android' || Platform.OS === 'ios')
            ? <StatusBar hidden={false} barStyle='default'/>
            : null}
          <Spinner visible={this.state.animating}/>
          <TouchableOpacity onPress={this.onPressFeed}>
            <View>
              <Text style={this.props.style.success}>
                {this.state.message}
              </Text>
            </View>
          </TouchableOpacity>
        </View>
      );
    }
  }
}
