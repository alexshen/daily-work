#! /usr/bin/env python3

import cloud
import configparser
import os
import glob
import argparse
import importlib
import getpass
import sys


def prompt_password():
    password = ''
    while not password:
        password = getpass.getpass()
    return password


def die(msg, exit_code=1):
    print('error: ' + msg, file=sys.stderr)
    sys.exit(exit_code)


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


if __name__ == '__main__':
    dirname = os.path.dirname(__file__)
    argparser = argparse.ArgumentParser(prog='cc')
    argparser.add_argument('-u', '--username', default='', help='''specify the username, if not specified and 
it's the first time to login, you will be prompted to enter the username''')
    argparser.add_argument(
        '-p', '--password', action='store_true', help='prompt for the new password')

    subparsers = argparser.add_subparsers(
        required=True, metavar='sub-commands')
    # register all sub commands
    for path in glob.glob(os.path.join(dirname, 'c_*.py')):
        fname = os.path.basename(path)
        mod = importlib.import_module(os.path.splitext(fname)[0])
        parser = mod.register(subparsers)
    args = argparser.parse_args()

    sess_cfg = SessionConfig(os.path.join(
        os.path.expanduser('~'), '.ccsession'))

    password = ''
    username = args.username or sess_cfg.last_login_username
    if not username:
        die('Please specify the username')

    appcfg = cloud.AppConfig(os.path.join(dirname, 'config.ini'))
    session = cloud.Session(appcfg['app.api_endpoint'],
                            appcfg['login.key'],
                            appcfg['login.iv'])

    # restore the session if any
    sess_data = sess_cfg.get_session_data(username)
    if sess_data:
        session.load(bytes(sess_data, encoding='utf-8'))
        password = session.password

    if not password or args.password:
        session.password = password = prompt_password()

    if not session.username:
        session.username = username

    if not session.validate():
        session.login()

    sess_cfg.last_login_username = username
    sess_cfg.set_session_data(username, str(session.dump(), encoding='utf-8'))
    sess_cfg.save()

    # run the command
    args.func(session, args)
