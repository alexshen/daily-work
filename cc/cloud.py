import httpx
from datetime import datetime, timezone
import hashlib
from Crypto.Cipher import AES
import base64
import pickle
import configparser


class RequestError(Exception):
    pass

class ExpirationError(Exception):
    pass

class AppConfig:
    def __init__(self, path: str):
        self._config = configparser.ConfigParser()
        self._config.read(path)

    def __getitem__(self, key: str):
        '''
        key is composed of two parts joined with a dot, e.g.
            section.key

        If key does not exist, raise KeyError
        '''
        try:
            sec, sub_key = key.split('.')
        except ValueError:
            raise KeyError

        return self._config[sec][sub_key]


class Session:

    def __init__(self, api_endpoint, aes_key, aes_iv):
        self._api_endpoint = api_endpoint
        self._aes_key = aes_key
        self._aes_iv = aes_iv
        self._x_access_token = None
        self._client = httpx.Client()
        self._username = None
        self._password = None

    @property
    def username(self):
        return self._username

    @username.setter
    def username(self, username):
        self._username = username

    @property
    def password(self):
        return self._password

    @password.setter
    def password(self, password):
        self._password = password

    def dump(self):
        '''
        dump the session for serialization
        '''
        state = (
            self.username,
            self.password,
            dict(self._client.cookies.items()),
            self._x_access_token
        )
        return base64.b64encode(pickle.dumps(state))

    def load(self, data):
        '''
        restore the session state from the saved data
        '''
        self.username, self.password, \
            cookies, self._x_access_token = pickle.loads(
                base64.b64decode(data))
        self._client.cookies.update(cookies)

    def post(self, path, headers=None, json=None):
        headers = self._set_token(headers)
        r = self._client.post(self._api_endpoint + path,
                              headers=headers,
                              json=json)
        return self._validate_json_response(r)

    def get(self, path, headers=None, params=None):
        params = params or {}
        params['_t'] = int(datetime.now(timezone.utc).timestamp())
        headers = self._set_token(headers)
        r = self._client.get(self._api_endpoint + path,
                             headers=headers,
                             params=params)
        return self._validate_json_response(r)

    def _set_token(self, headers):
        if self._x_access_token:
            headers = headers or {}
            headers['X-Access-Token'] = self._x_access_token
        return headers

    def _validate_json_response(self, r):
        res = r.json()
        if r.status_code == 500 and 'Token失效' in res['message']:
            raise ExpirationError()
        r.raise_for_status()
        try:
            if res['code'] != 200 and res['code'] != 0:
                raise RequestError(res['code'], res['message'])
        except KeyError:
            # code may not exist
            pass
        try:
            return res['result']
        except KeyError:
            return res

    def validate(self):
        '''
        validate the session, returns False if login is required
        '''
        if not self._x_access_token:
            return False
        try:
            # issue an abritrary request to validate the session
            self.get('/sys/annountCement/listByUser')
            return True
        except ExpirationError:
            return False

    def login(self):
        self._get_token_and_appid()
        login_result = self._do_calogin()
        self._x_access_token = login_result['token']
        self._get_check_role(
            login_result['userInfo']['id'], login_result['departs'][0]['id'])
        self._select_depart(login_result['userInfo'])
        # TODO: save permissions
        self._get_user_permission_by_token(
            login_result['token'], login_result['userInfo']['id'])

    def _get_token_and_appid(self):
        return self.get('/sys/getAccessTokenAndAppId')

    def _do_calogin(self):
        cipher = AES.new(self._aes_key.encode('utf-8'), AES.MODE_CBC,
                         self._aes_iv.encode('utf-8'))
        encrypted = cipher.encrypt(
            self.password.encode('utf-8').ljust(AES.block_size, b'\x00'))
        payload = {
            'username': self.username,
            'password': base64.b64encode(encrypted).decode('utf-8')
        }
        return self.post('/sys/caLogin', json=payload)

    def _get_check_role(self, user_id, dept_id):
        return self.get('/sys/getCheckRole', params={'userId': user_id, 'deptId': dept_id})

    def _select_depart(self, user_info):
        return self.post('/sys/selectDepart', json={
            'orgCode': user_info['orgCode'],
            'roleId': user_info['roleId'],
            'username': user_info['username']})

    def _get_user_permission_by_token(self, token, role_id):
        return self.get('/sys/permission/getUserPermissionByToken',
                        params={'token': token, 'roleId': role_id})
