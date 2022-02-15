import requests
from datetime import datetime, timezone
import hashlib
from Crypto.Cipher import AES
import base64
import pickle


class RequestError(Exception):
    pass


class Auth(requests.auth.AuthBase):
    def __init__(self, token):
        self._token = token

    def __call__(self, r):
        if self._token:
            r.headers['X-Access-Token'] = self._token
        return r


class Session:

    def __init__(self, api_endpoint, aes_key, aes_iv):
        self._api_endpoint = api_endpoint
        self._aes_key = aes_key
        self._aes_iv = aes_iv
        self._x_access_token = None
        self._session = None

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
            self._session,
            self._x_access_token
        )
        return base64.b64encode(pickle.dumps(state))

    def load(self, data):
        '''
        restore the session state from the saved data
        '''
        self.username, self.password, \
            self._session, self._x_access_token = pickle.loads(base64.b64decode(data))

    def post(self, path, headers=None, json=None):
        r = self._session.post(self._api_endpoint + path,
                               auth=Auth(self._x_access_token),
                               headers=headers,
                               json=json)
        return self._validate_json_response(r)

    def get(self, path, headers=None, params=None):
        params = params or {}
        params['_t'] = int(datetime.now(timezone.utc).timestamp())
        r = self._session.get(self._api_endpoint + path,
                              auth=Auth(self._x_access_token),
                              headers=headers,
                              params=params)
        return self._validate_json_response(r)

    def _validate_json_response(self, r):
        r.raise_for_status()
        res = r.json()
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
        pass

    def login(self):
        self._session = requests.Session()

        app_data = self._get_token_and_appid()
        auth_data = self._do_acccount(app_data)
        self._do_verify(auth_data['auth_token'], app_data)
        info = self._do_info(auth_data, app_data)
        login_result = self._do_calogin(info['id_no'])
        self._x_access_token = login_result['token']
        self._get_check_role(
            login_result['userInfo']['id'], login_result['departs'][0]['id'])
        self._select_depart(login_result['userInfo'])
        # TODO: save permissions
        self._get_user_permission_by_token(
            login_result['token'], login_result['userInfo']['id'])

    def _get_token_and_appid(self):
        return self.get('/sys/getAccessTokenAndAppId')

    def _do_acccount(self, app_data):
        m = hashlib.sha256()
        m.update(self.password.encode('utf-8'))
        return self._do_auth('/unitrust/login/account',
                             {'account': self.username, 'pwd': m.hexdigest()},
                             app_data)

    def _do_verify(self, auth_token, app_data):
        return self._do_auth('/unitrust/token/verify', {'auth_token': auth_token}, app_data)

    def _do_info(self, auth_data, app_data):
        return self._do_auth('/unitrust/person/info', auth_data, app_data)

    def _do_auth(self, path, json, app_data):
        return self.post(path,
                         headers={
                             'UniTrust-AppId': app_data['appId'],
                             'UniTrust-Token': app_data['accessToken']
                         },
                         json=json)

    def _do_calogin(self, id_no):
        payload = {'certificateNumber': id_no}
        cipher = AES.new(self._aes_key.encode('utf-8'), AES.MODE_CBC,
                         self._aes_iv.encode('utf-8'))
        encrypted = cipher.encrypt(
            self.username.encode('utf-8').ljust(AES.block_size, b'\x00'))
        payload['username'] = base64.b64encode(encrypted).decode('utf-8')
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
