from ast import parse
from collections import namedtuple
from json import encoder
import sys
import argparse
import json

AddressNode = namedtuple('AddressNode', 'name, parent')


class AddressDecomposer:
    def __init__(self, provinces):
        self._tries = {}
        self._build_tries(None, '', provinces)

    def _build_tries(self, parent, path, children):
        for child in children:
            node = AddressNode(child['name'], parent)
            node_path = path + node.name
            if 'children' in child:
                self._build_tries(node, node_path, child['children'])
            else:
                self._tries[node_path] = node

    def decompose(self, addr):
        node = self._tries[addr]
        parts = []
        while node:
            parts.append(node.name)
            node = node.parent
        return reversed(parts)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('province_database')
    parser.add_argument('input')
    parser.add_argument('output')
    args = parser.parse_args()

    with open(args.province_database, encoding='utf-8') as f:
        decomposer = AddressDecomposer(json.load(f))

    with open(args.input, encoding='utf-8') as input, \
        open(args.output, 'w', encoding='utf-8') as output:
        for line in input:
            line = line.strip()
            if line:
                output.write('\t'.join(decomposer.decompose(line)))
            output.write('\n')
