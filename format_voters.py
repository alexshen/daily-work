#! /usr/bin/env python3

import argparse

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('-c', dest='columns', default=6, help='number of columns for the output table')
    parser.add_argument('input', help='''input file path. The input is a
two-column table, the first column is the group number, the second column is
the voter name''')
    parser.add_argument('output')
    args = parser.parse_args()

    groups = {}
    with open(args.input, encoding='utf-8') as f:
        for line in f:
            g, name = line.rstrip().split('\t')
            groups.setdefault(int(g), []).append(name)

    with open(args.output, 'w', encoding='utf-8') as f:
        for k in sorted(groups.keys()):
            f.write('第{}居民小组：\n'.format(k))
            i = 0
            for name in groups[k]:
                if i > 0:
                    f.write('\t')
                f.write(name)
                i += 1
                if i == args.columns:
                    f.write('\n')
                    i = 0
            if i < args.columns:
                f.write('\n')
