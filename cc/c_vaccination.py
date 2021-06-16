'''
Vaccination Service Driver
'''


import argparse
import community_cloud as cc


def register(parent_parsers):
    parser = parent_parsers.add_parser('vac', help='vaccination services')
    subparsers = parser.add_subparsers(required=True, metavar='sub-commands')

    # list sub-command
    sp = subparsers.add_parser(
        'list', help='list vaccination records')
    sp.add_argument('-p', type=int, default=1, help='page number')
    sp.add_argument('-n', type=int, default=10,
                             help='number of records per page')
    sp.set_defaults(func=list_main)

    # update sub-command
    sp = subparsers.add_parser(
        'update', help='update vaccination records')
    sp.set_defaults(func=update_main)


def list_main(app: cc.Application, args):
    pass

def update_main(app: cc.Application, args):
    pass