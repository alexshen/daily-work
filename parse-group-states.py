#! /usr/bin/python3

import re
import sys

with open(sys.argv[1], encoding='utf-8') as f:
    for line in f:
        group_no, addr_range = line.split('\t')
        group_no = int(group_no)
        m = re.search(r'(\d+)弄(\d+)号(?:.+?(\d+)号)?', addr_range)
        long = int(m.group(1))
        first = int(m.group(2))
        end = first if m.group(3) is None else int(m.group(3))
        for i in range(first, end + 1):
            print('{}-{}\t{}'.format(long, i, group_no))