import configparser
import collections

class SessionConfig:
    def __init__(self, path):
        self._path = path
        self._cfg = configparser.ConfigParser()
        self._cfg.read(path)
        if 'last' not in self._cfg:
            self._cfg['last'] = {}
        self._section = self._cfg['last']

    def save(self):
        with open(self._path, 'w') as fp:
            self._cfg.write(fp)

    @property
    def last_login_username(self):
        return self._section.get('username', fallback='')

    @last_login_username.setter
    def last_login_username(self, username):
        self._section['username'] = username

    def get_session_data(self, username):
        return self._section.get(self._get_username_key(username))

    def set_session_data(self, username, data):
        self._section[self._get_username_key(username)] = data

    def _get_username_key(self, username):
        # prefix the username to avoid collision with app keys
        return '+' + username


AppContext = collections.namedtuple('AppContext', 'appcfg, session')