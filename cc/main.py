#! /usr/bin/env python3

import cloud
import app
import os
import glob
import argparse
import importlib
import getpass
import sys


def prompt_username():
    username = ''
    while not username:
        username = input('Username: ').strip()
    return username

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
    rootparser = argparse.ArgumentParser(prog='cc')
    rootparser.add_argument('-u', '--username', default='', help='''specify the username, if not specified and 
it's the first time to login, you will be prompted to enter the username''')
    rootparser.add_argument(
        '-p', '--password', action='store_true', help='prompt for the new password')

    subparsers = rootparser.add_subparsers(
        required=True, metavar='sub-commands')
    # register all sub commands
    for path in glob.glob(os.path.join(dirname, 'c_*.py')):
        fname = os.path.basename(path)
        mod = importlib.import_module(os.path.splitext(fname)[0])
        mod.register(rootparser, subparsers)
    args = rootparser.parse_args()

    sess_cfg = app.SessionConfig(os.path.join(
        os.path.expanduser('~'), '.ccsession'))

    username = args.username or sess_cfg.last_login_username
    if not username:
        username = prompt_username()

    appcfg = cloud.AppConfig(os.path.join(dirname, 'config.ini'))
    session = cloud.Session(appcfg['app.api_endpoint'],
                            appcfg['login.key'],
                            appcfg['login.iv'])

    # restore the session if any
    sess_data = sess_cfg.get_session_data(username)
    if sess_data:
        session.load(bytes(sess_data, encoding='utf-8'))

    if args.password:
        session.password = prompt_password()

    if not session.validate():
        session.login()

    sess_cfg.last_login_username = username
    sess_cfg.set_session_data(username, str(session.dump(), encoding='utf-8'))
    sess_cfg.save()

    context = app.AppContext(appcfg=appcfg, session=session)
    # run the command
    args.func(context, args)
