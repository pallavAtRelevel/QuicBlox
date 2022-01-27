import {eventChannel} from 'redux-saga';
import {
  call,
  cancel,
  fork,
  put,
  race,
  select,
  take,
  takeEvery,
  takeLatest,
} from 'redux-saga/effects';
import {NativeEventEmitter} from 'react-native';
import QB from 'quickblox-react-native-sdk';

import {
  fileUploadFail,
  fileUploadSucess,
  privateUrlGetFail,
  privateUrlGetSuccess,
  fileGetInfoSuccess,
  fileGetInfoFail,
} from '../actionCreators';
import {
  AUTH_LOGIN_SUCCESS,
  AUTH_LOGOUT_REQUEST,
  FILE_GET_INFO_REQUEST,
  FILE_PRIVATE_URL_REQUEST,
  FILE_UPLOAD_CANCEL,
  FILE_UPLOAD_REQUEST,
  INIT_QB_REQUEST_SUCCESS,
} from '../constants';

function createFileUploadChannel() {
  return eventChannel(emitter => {
    const contentEmitter = new NativeEventEmitter(QB.content);
    const subscription = contentEmitter.addListener(
      QB.content.EVENT_TYPE.FILE_UPLOAD_PROGRESS,
      emitter,
    );
    return () => subscription.remove();
  });
}

function* QBFileEventsChannel() {
  const channel = yield call(createFileUploadChannel);
  while (true) {
    try {
      const event = yield take(channel);
      yield put(event);
    } catch (e) {
      yield put({error: e.message, type: 'QB_FILE_SAGA_ERROR'});
    }
  }
}

export function* QBFileEventsSaga() {
  while (true) {
    const loggedIn = yield select(({auth}) => auth.loggedIn);
    if (!loggedIn) {
      yield take(AUTH_LOGIN_SUCCESS);
    }
    const task = yield fork(QBFileEventsChannel);
    yield take(AUTH_LOGOUT_REQUEST);
    yield cancel(task);
  }
}

export function* uploadFile(action = {}) {
  const {resolve, reject, url} = action.payload;
  try {
    yield call(QB.content.subscribeUploadProgress, {url});
    const {file} = yield race({
      cancel: take(FILE_UPLOAD_CANCEL),
      file: call(QB.content.upload, {public: false, url}),
    });
    if (file) {
      const result = fileUploadSucess(file);
      yield put(result);
      if (resolve) {
        resolve(result);
      }
    }
  } catch (e) {
    const result = fileUploadFail(e.message);
    yield put(result);
    if (reject) {
      reject(result);
    }
  } finally {
    yield call(QB.content.unsubscribeUploadProgress, {url});
  }
}

export function* getFileInfo(action = {}) {
  try {
    const id = action.payload;
    const info = yield call(QB.content.getInfo, {id});
    yield put(fileGetInfoSuccess(info));
  } catch (e) {
    yield put(fileGetInfoFail(e.message));
  }
}

export function* getPrivateUrl(action = {}) {
  try {
    const uid = action.payload;
    const url = yield call(QB.content.getPrivateURL, {uid});
    yield put(privateUrlGetSuccess(uid, url));
  } catch (e) {
    yield put(privateUrlGetFail(e.message));
  }
}

export default [
  takeLatest(FILE_UPLOAD_REQUEST, uploadFile),
  takeEvery(FILE_PRIVATE_URL_REQUEST, getPrivateUrl),
  takeLatest(FILE_GET_INFO_REQUEST, getFileInfo),
  takeLatest(INIT_QB_REQUEST_SUCCESS, QBFileEventsSaga),
];
