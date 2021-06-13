#! /usr/bin/python3

import community_cloud as cc
import configparser
import os
import glob
import argparse
import importlib
import getpass
import config

if __name__ == '__main__':
    dirname = os.path.dirname(__file__)
    argparser = argparse.ArgumentParser(prog='cc')
    argparser.add_argument('-u', '--username', help='username')
    argparser.add_argument('-p', '--password', action='store_true', help='prompt for the new password')

    subparsers = argparser.add_subparsers(required=True, metavar='sub-commands')
    # register all sub commands
    for path in glob.glob(os.path.join(dirname, 'c_*.py')):
        fname = os.path.basename(path)
        mod = importlib.import_module(os.path.splitext(fname)[0])
        parser = mod.register(subparsers)
    args = argparser.parse_args()
    
    # get the username and password
    cfg = config.Config(os.path.join(os.path.expanduser('~'), '.cconfig'))
    if 'username' in args:
        username = args.username
    else:
        username = cfg.get('user', 'username', '')
    while not username:
        username = input('Username: ').strip()
        if username:
            cfg.set('user', 'username', username)

    password = cfg.get('user', 'password', '')
    while args.password or not password:
        password = getpass.getpass()
        if password:
            cfg.set('user', 'password', password)
    cfg.save()

    appcfg = configparser.ConfigParser()
    appcfg.read(os.path.join(dirname, 'config.ini'))
    app = cc.Application(appcfg.get('app', 'origin'),
                         appcfg.get('login', 'key'),
                         appcfg.get('login', 'iv'))

    app.login(username, password)
    args.func(app, args)
