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

    sess_cfg_path = os.path.join(os.path.expanduser('~'), '.ccsession')
    sess_cfg = configparser.ConfigParser()
    sess_cfg.read(sess_cfg_path)

    password = ''
    username = args.username or sess_cfg.get('last', 'username', fallback='')
    if not username:
        die('Please specify the username')

    appcfg = configparser.ConfigParser()
    appcfg.read(os.path.join(dirname, 'config.ini'))

    session = cloud.Session(appcfg.get('app', 'api_endpoint'),
                            appcfg.get('login', 'key'),
                            appcfg.get('login', 'iv'))

    # prefix the username to avoid collision with app keys
    username_key = '+' + username
    # restore the session if any
    sess_data = sess_cfg.get(username_key, 'state', fallback='')
    if sess_data:
        session.load(sess_data)
        password = session.password

    if not password or args.password:
        session.password = password = prompt_password()

    if not session.username:
        session.username = username

    if not session.validate():
        session.login()

    # save the session
    if not sess_cfg.has_section('last'):
        sess_cfg.add_section('last')
    if not sess_cfg.has_section(username_key):
        sess_cfg.add_section(username_key)

    sess_cfg.set('last', 'username', username)
    sess_cfg.set(username_key, 'state', str(session.dump()))
    with open(sess_cfg_path, 'w') as fp:
        sess_cfg.write(fp)

    # run the command
    args.func(session, args)
