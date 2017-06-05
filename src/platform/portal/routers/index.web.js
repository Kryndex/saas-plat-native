import { Registry, Screen } from 'saasplat-native';

let size;
const optsize = Screen.get('md', 'xs');
if (optsize === 'xs') {
  size = 'mobilecomponents'; // 手机版
} else {
  size = 'webcomponents'; // PC 版
}

Registry.registerRootRoute(() => [{
    path: '/',
    exact: true,
    component: require('../' + size + '/Console').default
  },
  {
    path: '/:id',
    component: require('../' + size + '/Workspace').default
  }
]);
