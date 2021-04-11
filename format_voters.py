#! /usr/bin/env python3

import argparse

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('-c', dest='columns', type=int, default=6,
                        help='number of columns for the output table')
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
        for i, k in enumerate(sorted(groups.keys())):
            if i:
                f.write('\n')
            f.write('第{}居民小组：\n'.format(k))
            i = 0
            names = groups[k]
            while i < len(names):
                if i:
                    f.write('\n')
                last = min(i + args.columns, len(names))
                f.write('\t'.join(names[i:last]))
                i = last
