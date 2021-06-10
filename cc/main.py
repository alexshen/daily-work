#! /usr/bin/python3

import community_cloud as cc
import configparser
import os

if __name__ == '__main__':
    parser = configparser.ConfigParser()
    parser.read(os.path.join(os.path.dirname(__file__), 'config.ini'))
    app = cc.Application(parser.get('app', 'origin'),
                         parser.get('login', 'key'),
                         parser.get('login', 'iv'))