#! /usr/bin/env python3

import community_cloud as cc
import configparser
import os
import glob
import argparse
import importlib
import getpass


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


if __name__ == '__main__':
    dirname = os.path.dirname(__file__)
    argparser = argparse.ArgumentParser(prog='cc')
    argparser.add_argument('-u', '--username', help='''specify the username, if not specified and 
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

    # get the username and password
    username = ''
    if 'username' in args:
        username = prompt_username()

    password = ''
    if args.password:
        password = prompt_password()

    sess_cfg_path = os.path.join(os.path.expanduser('~'), '.ccsession')
    sess_cfg = configparser.ConfigParser()
    sess_cfg.read(sess_cfg_path)

    if not username:
        username = sess_cfg.get('last', 'username', fallback='')
        # no way to set a new password because there was no saved session
        if not username and args.password:
            raise RuntimeError('Please specify the username')

    # first run requires the username and password
    if not username and not password:
        username = prompt_username()
        password = prompt_password()
    
    appcfg = configparser.ConfigParser()
    appcfg.read(os.path.join(dirname, 'config.ini'))

    session = cc.Session(appcfg.get('app', 'api_endpoint'),
                         appcfg.get('login', 'key'),
                         appcfg.get('login', 'iv'))

    # restore the session if any
    sess_data = sess_cfg.get(username, 'state', fallback='')
    if sess_data:
        session.load(sess_data)
        if session.password and session.password != password:
            session.password = password
    else:
        session.username = username
        session.password = password

    if not session.validate():
        session.login()

    # save the session
    sess_cfg.set('last', 'username', username)
    sess_cfg.set(username, 'state', session.dump())
    with open(sess_cfg, 'w') as fp:
        sess_cfg.write(fp)

    # run the command
    args.func(session, args)
