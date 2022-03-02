'''
Vaccination Service Driver
'''


import app


def register(rootparser, subparsers):
    vac_parser = subparsers.add_parser('vac', help='vaccination services')
    vac_subparsers = vac_parser.add_subparsers(required=True, metavar='sub-commands')

    list_parser = vac_subparsers.add_parser(
        'list', help='list vaccination records')
    list_parser.add_argument('-p', type=int, default=1, help='page number')
    list_parser.add_argument('-n', type=int, default=10,
                             help='number of records per page')
    list_parser.set_defaults(func=list_main)


def list_main(context: app.AppContext, args):
    pass
