import MockAdapter from 'axios-mock-adapter';
import config from '../../config';

const mores = [];
let mockAdapter;

export function mock(axios) {

  // This sets the mock adapter on the default instance
  mockAdapter = new MockAdapter(axios);

  axios.interceptors.request.use(config => {
    console.log(config.method + ' ' + config.url);
    if (!config.headers.common.Authorization) {
      return Promise.reject('No Authorization');
    }
    return config;
  });

  // axios.interceptors.response.use(function (response) {   debugger  return
  // Promise.reject(error);   return response; } );

  mockAdapter.onGet(config.server.connection).reply(200, {
    errno: 0,
    data: {}
  });

  mockAdapter.onPost(config.server.command).reply(200, {errno: 0});

  mockAdapter.onGet(config.server.query).reply(200, {
    errno: 0,
    data: {}
  });

  mores.forEach(fn => fn(mockAdapter, config));
}

export function addMock(callback) {
  if (mockAdapter) {
    callback(mockAdapter, config);
  } else {
    mores.push(callback);
  }
}
